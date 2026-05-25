import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import type {
  KycProvider,
  KycProviderConfig,
  KycSessionResult,
  KycWebhookResult,
} from '../interfaces/kyc-provider.interface.js';

const SUMSUB_BASE_URL = 'https://api.sumsub.com';

@Injectable()
export class SumsubProvider implements KycProvider {
  private readonly logger = new Logger(SumsubProvider.name);

  async createSession(params: {
    externalUserId: string;
    email: string;
    phone?: string | null;
    fullName: string;
    tenantConfig: KycProviderConfig;
  }): Promise<KycSessionResult> {
    const { externalUserId, email, fullName, tenantConfig } = params;
    const levelName = tenantConfig.levelName ?? 'basic-kyc-level';

    // Split fullName into first/last for Sumsub
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0] ?? fullName;
    const lastName = nameParts.slice(1).join(' ') || firstName;

    // 1. Create applicant
    const applicantBody = JSON.stringify({
      externalUserId,
      email,
      fixedInfo: { firstName, lastName },
    });

    const applicantRes = await this.request(
      'POST',
      `/resources/applicants?levelName=${encodeURIComponent(levelName)}`,
      tenantConfig,
      applicantBody,
    );

    if (!applicantRes.ok) {
      const errText = await applicantRes.text();
      this.logger.error(`Sumsub create applicant failed: ${errText}`);
      throw new Error(`Sumsub API error: ${applicantRes.status} — ${errText}`);
    }

    const applicant = (await applicantRes.json()) as { id: string };
    const applicantId = applicant.id;
    this.logger.log(`Sumsub applicant created: ${applicantId}`);

    // 2. Get access token for SDK
    const tokenRes = await this.request(
      'POST',
      `/resources/accessTokens?userId=${encodeURIComponent(externalUserId)}&levelName=${encodeURIComponent(levelName)}`,
      tenantConfig,
    );

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      this.logger.error(`Sumsub access token failed: ${errText}`);
      throw new Error(`Sumsub API error: ${tokenRes.status} — ${errText}`);
    }

    const tokenData = (await tokenRes.json()) as { token: string };

    return {
      providerRef: applicantId,
      sdkAccessToken: tokenData.token,
    };
  }

  async refreshSessionToken(params: {
    externalUserId: string;
    tenantConfig: KycProviderConfig;
  }): Promise<{ accessToken: string }> {
    const { externalUserId, tenantConfig } = params;
    const levelName = tenantConfig.levelName ?? 'basic-kyc-level';

    const tokenRes = await this.request(
      'POST',
      `/resources/accessTokens?userId=${encodeURIComponent(externalUserId)}&levelName=${encodeURIComponent(levelName)}`,
      tenantConfig,
    );

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      this.logger.error(`Sumsub refresh access token failed: ${errText}`);
      throw new Error(`Sumsub API error: ${tokenRes.status} — ${errText}`);
    }

    const tokenData = (await tokenRes.json()) as { token: string };

    return { accessToken: tokenData.token };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async parseWebhook(params: {
    headers: Record<string, string | string[] | undefined>;
    body: any;
    rawBody?: string;
    tenantConfig: KycProviderConfig;
  }): Promise<KycWebhookResult | null> {
    const { headers, body, rawBody, tenantConfig } = params;
    const webhookSecret = tenantConfig.webhookSecret?.trim();

    // Sumsub webhooks must always be authenticated when the provider is active.
    if (!webhookSecret) {
      this.logger.warn('Sumsub webhook secret is not configured');
      return null;
    }

    const digestHeader =
      headers['x-payload-digest'] ?? headers['X-Payload-Digest'];
    const digest = Array.isArray(digestHeader) ? digestHeader[0] : digestHeader;
    if (!digest) {
      this.logger.warn('Missing X-Payload-Digest header');
      return null;
    }

    const signaturePayload =
      rawBody ?? (typeof body === 'string' ? body : JSON.stringify(body));
    const expected = createHmac('sha256', webhookSecret)
      .update(signaturePayload)
      .digest('hex');

    const normalizedDigest = digest.trim().toLowerCase();
    const isHexDigest = /^[a-f0-9]{64}$/.test(normalizedDigest);
    if (!isHexDigest) {
      this.logger.warn('Sumsub webhook digest format is invalid');
      return null;
    }

    if (
      !timingSafeEqual(Buffer.from(normalizedDigest), Buffer.from(expected))
    ) {
      this.logger.warn('Sumsub webhook signature mismatch');
      return null;
    }

    const parsed = typeof body === 'string' ? JSON.parse(body) : body;

    // Sumsub webhook types we care about: applicantReviewed, applicantPending
    const externalUserId: string | undefined = parsed.externalUserId;
    const applicantId: string | undefined =
      parsed.applicantId ?? parsed.externalUserId;
    if (!applicantId) {
      this.logger.warn('Sumsub webhook missing applicantId');
      return null;
    }

    const reviewResult = parsed.reviewResult;
    let status: 'APPROVED' | 'REJECTED' | 'PENDING_REVIEW' = 'PENDING_REVIEW';
    let rejectionReason: string | undefined;

    if (reviewResult) {
      if (reviewResult.reviewAnswer === 'GREEN') {
        status = 'APPROVED';
      } else if (reviewResult.reviewAnswer === 'RED') {
        status = 'REJECTED';
        const labels: string[] = reviewResult.rejectLabels ?? [];
        rejectionReason =
          labels.length > 0
            ? labels.join(', ')
            : (reviewResult.reviewRejectType ?? 'Rejected by provider');
      }
    }

    return {
      providerRef: parsed.applicantId ?? applicantId,
      externalUserId,
      status,
      rejectionReason,
      rawData: parsed,
    };
  }

  async getApplicantStatus(params: {
    providerRef: string;
    tenantConfig: KycProviderConfig;
  }): Promise<KycWebhookResult> {
    const { providerRef, tenantConfig } = params;

    const res = await this.request(
      'GET',
      `/resources/applicants/${encodeURIComponent(providerRef)}/one`,
      tenantConfig,
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Sumsub API error: ${res.status} — ${errText}`);
    }

    const data = (await res.json()) as {
      id: string;
      review?: {
        reviewResult?: {
          reviewAnswer?: string;
          rejectLabels?: string[];
          reviewRejectType?: string;
        };
      };
    };

    let status: 'APPROVED' | 'REJECTED' | 'PENDING_REVIEW' = 'PENDING_REVIEW';
    let rejectionReason: string | undefined;

    const reviewResult = data.review?.reviewResult;
    if (reviewResult) {
      if (reviewResult.reviewAnswer === 'GREEN') {
        status = 'APPROVED';
      } else if (reviewResult.reviewAnswer === 'RED') {
        status = 'REJECTED';
        const labels = reviewResult.rejectLabels ?? [];
        rejectionReason =
          labels.length > 0
            ? labels.join(', ')
            : (reviewResult.reviewRejectType ?? 'Rejected by provider');
      }
    }

    return {
      providerRef: data.id,
      status,
      rejectionReason,
      rawData: data,
    };
  }

  // ─── Sumsub HMAC Auth ─────────────────────────

  private async request(
    method: string,
    path: string,
    config: KycProviderConfig,
    body?: string,
  ): Promise<Response> {
    const ts = Math.floor(Date.now() / 1000).toString();
    const sigPayload = ts + method.toUpperCase() + path + (body ?? '');
    const sig = createHmac('sha256', config.apiSecret)
      .update(sigPayload)
      .digest('hex');

    const headers: Record<string, string> = {
      'X-App-Token': config.apiKey,
      'X-App-Access-Sig': sig,
      'X-App-Access-Ts': ts,
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    return fetch(`${SUMSUB_BASE_URL}${path}`, {
      method,
      headers,
      body: body ?? undefined,
    });
  }
}
