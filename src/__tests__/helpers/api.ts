import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const BASE_URL = 'http://localhost:3000/api/v1';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  envValue('DATABASE_URL') ??
  'postgresql://openreal:openreal_dev_2026@localhost:5432/openreal?schema=public';

const { Client } = pg;

export async function api(
  method: string,
  path: string,
  options?: { body?: any; token?: string; headers?: Record<string, string> },
): Promise<{ status: number; data: any; setCookie: string[] }> {
  const headers: Record<string, string> = {
    'x-tenant-id': 'localhost',
    ...options?.headers,
  };

  if (options?.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  let data: any;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { status: res.status, data, setCookie: getSetCookies(res.headers) };
}

export async function login(email: string, password: string): Promise<string> {
  if (process.env.INTEGRATION_USE_REAL_LOGIN !== 'true') {
    return directAccessToken(email);
  }

  // Auth endpoints are throttled; retry briefly on 429.
  for (let attempt = 1; attempt <= 12; attempt++) {
    const { status, data, setCookie } = await api('POST', '/auth/login', {
      body: { email, password },
    });

    if (status === 200) {
      const accessToken = getCookieValue(setCookie, 'or_access');
      if (accessToken) {
        return accessToken;
      }

      throw new Error(`Login succeeded for ${email} but no auth cookie was set`);
    }

    if (status !== 429) {
      throw new Error(
        `Login failed for ${email}: status=${status} message=${data?.message ?? 'unknown'}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error(`Login throttled for ${email} after retries`);
}

const CREDENTIALS: Record<string, { email: string; password: string }> = {
  superadmin: { email: 'admin@openreal.io', password: 'Admin123!' },
  admin: { email: 'tenantadmin@openreal.io', password: 'TenantAdmin123!' },
  investor: { email: 'investor@openreal.io', password: 'Investor123!' },
  issuer: { email: 'issuer@openreal.io', password: 'Issuer123!' },
};

const TOKEN_CACHE = new Map<string, string>();

export async function loginAs(
  role: 'superadmin' | 'admin' | 'investor' | 'issuer',
): Promise<string> {
  const cached = TOKEN_CACHE.get(role);
  if (cached) return cached;

  const creds = CREDENTIALS[role];
  const token = await login(creds.email, creds.password);
  TOKEN_CACHE.set(role, token);
  return token;
}

export async function createVerifiedUserAndLogin(
  adminToken: string,
  email: string,
  fullName: string,
  role = 'REGISTERED',
  password = 'QaUser123!',
): Promise<string> {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await api('POST', '/admin/users', {
      token: adminToken,
      body: { email, fullName, password, role, emailVerified: true },
    });

    if (res.status === 201 || res.status === 409) {
      return login(email, password);
    }

    if (res.status !== 429) {
      throw new Error(
        `Create test user failed for ${email}: status=${res.status} message=${res.data?.message ?? 'unknown'}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
  }

  throw new Error(`Create test user throttled for ${email} after retries`);
}

async function directAccessToken(email: string): Promise<string> {
  const cacheKey = email.toLowerCase();
  const cached = TOKEN_CACHE.get(cacheKey);
  if (cached) return cached;

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query<{
      id: string;
      tenant_id: string;
      email: string;
      role: string;
    }>(
      `
        SELECT id, tenant_id, email, role
        FROM users
        WHERE lower(email) = lower($1)
          AND status = 'ACTIVE'
          AND email_verified = true
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [email],
    );
    const user = result.rows[0];
    if (!user) {
      throw new Error(`No active verified test user found for ${email}`);
    }

    const token = signTestJwt({
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id,
      jti: randomUUID(),
    });
    TOKEN_CACHE.set(cacheKey, token);
    return token;
  } finally {
    await client.end();
  }
}

export async function directAccessTokenForEmail(email: string): Promise<string> {
  return directAccessToken(email);
}

function signTestJwt(payload: Record<string, unknown>): string {
  const secret =
    process.env.JWT_ACCESS_SECRET ??
    envValue('JWT_ACCESS_SECRET') ??
    'test-access-secret';
  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    iat: now,
    exp: now + 60 * 60,
  };
  const header = { alg: 'HS256', typ: 'JWT' };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(body),
  )}`;
  const signature = createHmac('sha256', secret)
    .update(unsigned)
    .digest('base64url');
  return `${unsigned}.${signature}`;
}

function base64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

function envValue(key: string): string | undefined {
  try {
    const env = readFileSync('.env', 'utf8');
    const line = env
      .split(/\r?\n/)
      .find((entry) => entry.trim().startsWith(`${key}=`));
    if (!line) return undefined;
    return line.slice(line.indexOf('=') + 1).trim().replace(/^"|"$/g, '');
  } catch {
    return undefined;
  }
}

export function getSetCookies(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof withGetSetCookie.getSetCookie === 'function') {
    return withGetSetCookie.getSetCookie();
  }

  const singleHeader = headers.get('set-cookie');
  return singleHeader ? splitCombinedSetCookieHeader(singleHeader) : [];
}

export function getCookieValue(
  setCookieHeaders: string[],
  name: string,
): string | null {
  for (const header of setCookieHeaders) {
    const firstPart = header.split(';', 1)[0];
    const separator = firstPart.indexOf('=');
    if (separator === -1) continue;

    const cookieName = firstPart.slice(0, separator);
    if (cookieName === name) {
      return decodeURIComponent(firstPart.slice(separator + 1));
    }
  }

  return null;
}

export function cookieHeaderFromSetCookies(setCookieHeaders: string[]): string {
  return setCookieHeaders
    .map((header) => header.split(';', 1)[0])
    .filter(Boolean)
    .join('; ');
}

function splitCombinedSetCookieHeader(header: string): string[] {
  return header.split(/,(?=\s*[^;,=\s]+=[^;,]*)/).map((part) => part.trim());
}
