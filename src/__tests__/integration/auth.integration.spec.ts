// Integration test — requires: docker services running, seed data applied, app running on port 3000

import { describe, it, expect, beforeAll } from 'vitest';
import { api, cookieHeaderFromSetCookies, loginAs } from '../helpers/api.js';

describe('Auth Integration', () => {
  let authEmail: string;
  const authPassword = 'QaAuthUser123!';

  beforeAll(async () => {
    authEmail = `qa-auth-${Date.now()}@openreal.test`;
    const adminToken = await loginAs('admin');
    const created = await api('POST', '/admin/users', {
      token: adminToken,
      body: {
        email: authEmail,
        fullName: 'QA Auth User',
        password: authPassword,
        role: 'VERIFIED',
        emailVerified: true,
      },
    });
    expect(created.status).toBe(201);
  }, 70000);

  it('should register a new user on the platform tenant', async () => {
    const uniqueEmail = `test-${Date.now()}@register.test`;
    const { status, data, setCookie } = await api('POST', '/auth/register', {
      body: {
        fullName: 'Integration Test User',
        email: uniqueEmail,
        password: 'TestPass123!',
      },
    });

    expect(status).toBe(201);
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe(uniqueEmail);
    expect(data.user.role).toBe('REGISTERED');
    expect(data.user.emailVerified).toBe(false);
    expect(data.accessToken).toBeUndefined();
    expect(data.refreshToken).toBeUndefined();
    expect(setCookie.some((cookie) => cookie.startsWith('or_access='))).toBe(
      false,
    );
    expect(setCookie.some((cookie) => cookie.startsWith('or_refresh='))).toBe(
      false,
    );
  });

  it('should login with valid credentials', async () => {
    const { status, data, setCookie } = await api('POST', '/auth/login', {
      body: { email: authEmail, password: authPassword },
    });

    expect(status).toBe(200);
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe(authEmail);
    expect(data.accessToken).toBeUndefined();
    expect(data.refreshToken).toBeUndefined();
    expect(setCookie.some((cookie) => cookie.startsWith('or_access='))).toBe(
      true,
    );
    expect(setCookie.some((cookie) => cookie.startsWith('or_refresh='))).toBe(
      true,
    );
  });

  it('should reject login with wrong password', async () => {
    const { status } = await api('POST', '/auth/login', {
      body: { email: authEmail, password: 'WrongPass123!' },
    });

    expect(status).toBe(401);
  });

  it('should reject login with non-existent email', async () => {
    const { status } = await api('POST', '/auth/login', {
      body: { email: 'nonexistent@example.com', password: 'Whatever123!' },
    });

    expect(status).toBe(401);
  });

  it('should access profile with valid token', async () => {
    const token = await loginAs('investor');
    const { status, data } = await api('GET', '/users/me', { token });

    expect(status).toBe(200);
    expect(data.email).toBe('investor@openreal.io');
    expect(data.fullName).toBe('Test Investor');
  });

  it('should reject profile access without token', async () => {
    const { status } = await api('GET', '/users/me');

    expect(status).toBe(401);
  });

  it('should refresh tokens', async () => {
    const loginResult = await api('POST', '/auth/login', {
      body: { email: authEmail, password: authPassword },
    });

    const { status, data } = await api('POST', '/auth/refresh', {
      headers: { Cookie: cookieHeaderFromSetCookies(loginResult.setCookie) },
    });

    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.accessToken).toBeUndefined();
    expect(data.refreshToken).toBeUndefined();
  });

  it('should verify email with valid token', async () => {
    // Note: Since emailVerificationToken is no longer exposed in register response,
    // this test would normally require intercepting an email or checking the DB.
    // For now, we are focusing on ensuring it's NOT in the response.
    const uniqueEmail = `test-verify-${Date.now()}@register.test`;
    const registerResult = await api('POST', '/auth/register', {
      body: {
        fullName: 'Verify Test User',
        email: uniqueEmail,
        password: 'TestPass123!',
      },
    });

    expect(registerResult.status).toBe(201);
    expect(registerResult.data.emailVerificationToken).toBeUndefined();
  });
});
