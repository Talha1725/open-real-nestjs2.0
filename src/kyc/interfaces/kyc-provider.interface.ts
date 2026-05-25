import type { Request } from 'express';
export interface KycSessionResult {
  providerRef: string;
  sdkAccessToken?: string;
}

export interface KycWebhookResult {
  providerRef: string;
  externalUserId?: string;
  status: 'APPROVED' | 'REJECTED' | 'PENDING_REVIEW';
  rejectionReason?: string;
  rawData: Record<string, any>;
}

export interface KycProviderConfig {
  apiKey: string;
  apiSecret: string;
  levelName?: string;
  webhookSecret?: string;
}

export interface KycProvider {
  createSession(params: {
    externalUserId: string;
    email: string;
    phone?: string | null;
    fullName: string;
    tenantConfig: KycProviderConfig;
  }): Promise<KycSessionResult>;

  refreshSessionToken?(params: {
    externalUserId: string;
    tenantConfig: KycProviderConfig;
  }): Promise<{ accessToken: string }>;

  parseWebhook(params: {
    headers: Record<string, string | string[] | undefined>;
    body: any;
    rawBody?: string;
    tenantConfig: KycProviderConfig;
  }): Promise<KycWebhookResult | null>;

  getApplicantStatus(params: {
    providerRef: string;
    tenantConfig: KycProviderConfig;
  }): Promise<KycWebhookResult>;
}

export type RequestWithRawBody = Request & {
  rawBody?: Buffer;
};
