export const QUEUE_NAME = 'openreal-jobs';
export const DEAD_LETTER_QUEUE_NAME = 'openreal-jobs-dlq';

export const JOB_NAMES = {
  INVESTMENT_REQUEST_EXPIRY_CHECK: 'investment-request-expiry-check',
  AUDIT_LOG_EXPORT: 'audit-log-export',
  EXPIRE_PRIORITY_WINDOW: 'expire-priority-window',
  DEAD_LETTER_JOB_FAILED: 'dead-letter-job-failed',
} as const;
export const SYSTEM_JOB_IDS = {
  INVESTMENT_REQUEST_EXPIRY: 'investment-request-expiry',
} as const;
