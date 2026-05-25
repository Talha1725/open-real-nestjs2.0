import { createHmac } from 'crypto';
import { describe, it, expect } from 'vitest';
import { SumsubProvider } from '../kyc/providers/sumsub.provider.js';

describe('SumsubProvider.parseWebhook', () => {
  const provider = new SumsubProvider();
  const tenantConfig = {
    apiKey: 'test-key',
    apiSecret: 'test-secret',
    webhookSecret: 'webhook-secret',
  };

  const payload = {
    applicantId: 'applicant-123',
    externalUserId: 'user-123',
    reviewResult: { reviewAnswer: 'GREEN' },
  };

  it('rejects a tampered webhook digest', async () => {
    const rawBody = JSON.stringify(payload);
    const validDigest = createHmac('sha256', tenantConfig.webhookSecret)
      .update(rawBody)
      .digest('hex');
    const tamperedDigest = `${validDigest.slice(0, -1)}${validDigest.endsWith('a') ? 'b' : 'a'}`;

    const result = await provider.parseWebhook({
      headers: { 'x-payload-digest': tamperedDigest },
      body: payload,
      rawBody,
      tenantConfig,
    });

    expect(result).toBeNull();
  });

  it('rejects webhooks when the webhook secret is not configured', async () => {
    const result = await provider.parseWebhook({
      headers: {},
      body: payload,
      tenantConfig: {
        apiKey: tenantConfig.apiKey,
        apiSecret: tenantConfig.apiSecret,
      },
    });

    expect(result).toBeNull();
  });

  it('accepts a valid webhook digest', async () => {
    const rawBody = JSON.stringify(payload);
    const validDigest = createHmac('sha256', tenantConfig.webhookSecret)
      .update(rawBody)
      .digest('hex');

    const result = await provider.parseWebhook({
      headers: { 'x-payload-digest': validDigest },
      body: payload,
      rawBody,
      tenantConfig,
    });

    expect(result).not.toBeNull();
    expect(result?.status).toBe('APPROVED');
    expect(result?.providerRef).toBe(payload.applicantId);
  });
});
