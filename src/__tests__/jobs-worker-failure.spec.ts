import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JobsWorker } from '../jobs/jobs.worker.js';
import { JOB_NAMES, QUEUE_NAME } from '../jobs/jobs.constants.js';
import { AuditAction } from '../audit/audit-action.enum.js';

describe('JobsWorker failure handling', () => {
  let worker: JobsWorker;
  let deadLetterQueue: any;
  let audit: any;
  let emailService: any;
  let config: any;

  beforeEach(() => {
    deadLetterQueue = {
      add: vi.fn().mockResolvedValue(undefined),
    };
    audit = {
      log: vi.fn().mockResolvedValue(undefined),
    };
    emailService = {
      sendSystemJobFailureAlert: vi.fn().mockResolvedValue(undefined),
    };
    config = {
      get: vi.fn((key: string) => {
        if (key === 'OPS_ALERT_EMAIL') return 'ops@example.com';
        if (key === 'SMTP_FROM_EMAIL') return 'noreply@example.com';
        return undefined;
      }),
    };

    worker = new JobsWorker(
      { getConnectionOpts: vi.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      audit,
      emailService,
      config,
    );
    (worker as any).deadLetterQueue = deadLetterQueue;
  });

  it('moves failed jobs to DLQ, audits, and alerts ops', async () => {
    const job = {
      id: 'job-123',
      name: JOB_NAMES.AUDIT_LOG_EXPORT,
      attemptsMade: 3,
      data: { tenantId: 'tenant-1' },
      opts: { attempts: 3 },
      failedReason: 'boom',
    } as any;

    await (worker as any).handleJobFailure(job, new Error('boom'));

    expect(deadLetterQueue.add).toHaveBeenCalledWith(
      JOB_NAMES.DEAD_LETTER_JOB_FAILED,
      expect.objectContaining({
        queue: QUEUE_NAME,
        jobName: JOB_NAMES.AUDIT_LOG_EXPORT,
        jobId: 'job-123',
        attemptsMade: 3,
        failedReason: 'boom',
      }),
      expect.any(Object),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.SYSTEM_JOB_FAILED,
        targetType: 'SystemJob',
        targetId: 'job-123',
      }),
    );
    expect(emailService.sendSystemJobFailureAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ops@example.com',
        queue: QUEUE_NAME,
        jobName: JOB_NAMES.AUDIT_LOG_EXPORT,
      }),
    );
  });
});
