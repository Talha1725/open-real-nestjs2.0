import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job, Queue } from 'bullmq';
import { RedisService } from '../redis/redis.service.js';
import {
  DEAD_LETTER_QUEUE_NAME,
  QUEUE_NAME,
  JOB_NAMES,
} from './jobs.constants.js';
import { InvestmentRequestExpiryHandler } from './handlers/investment-request-expiry.handler.js';
import { AuditExportHandler } from './handlers/audit-export.handler.js';
import { PriorityWindowExpiryHandler } from './handlers/priority-window-expiry.handler.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditAction } from '../audit/audit-action.enum.js';
import { EmailService } from '../notifications/email.service.js';

@Injectable()
export class JobsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsWorker.name);
  private worker!: Worker;
  private deadLetterQueue!: Queue;

  constructor(
    private readonly redis: RedisService,
    private readonly expiryHandler: InvestmentRequestExpiryHandler,
    private readonly auditExportHandler: AuditExportHandler,
    private readonly priorityWindowHandler: PriorityWindowExpiryHandler,
    private readonly audit: AuditService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.deadLetterQueue = new Queue(DEAD_LETTER_QUEUE_NAME, {
      connection: this.redis.getConnectionOpts(),
    });

    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        return this.processJob(job);
      },
      {
        connection: this.redis.getConnectionOpts(),
        concurrency: 1,
      },
    );

    this.worker.on('completed', (job: Job) => {
      this.logger.log(`Job ${job.name} [${job.id}] completed`);
    });

    this.worker.on('failed', async (job: Job | undefined, err: Error) => {
      this.logger.error(`Job ${job?.name} [${job?.id}] failed: ${err.message}`);
      await this.handleJobFailure(job, err);
    });

    this.logger.log('JobsWorker listening on queue: ' + QUEUE_NAME);
  }

  private async processJob(job: Job): Promise<any> {
    switch (job.name) {
      case JOB_NAMES.INVESTMENT_REQUEST_EXPIRY_CHECK:
        return this.expiryHandler.run();
      case JOB_NAMES.AUDIT_LOG_EXPORT:
        return this.auditExportHandler.run(job.data);
      case JOB_NAMES.EXPIRE_PRIORITY_WINDOW:
        return this.priorityWindowHandler.run(job.data);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  async onModuleDestroy() {
    await this.worker.close();
    await this.deadLetterQueue.close();
  }

  private async handleJobFailure(
    job: Job | undefined,
    err: Error,
  ): Promise<void> {
    if (!job) return;

    const failedReason = err.message || job.failedReason || 'Unknown failure';
    const payload = {
      queue: QUEUE_NAME,
      jobName: job.name,
      jobId: String(job.id ?? 'unknown'),
      attemptsMade: job.attemptsMade,
      failedReason,
      data: job.data,
      opts: job.opts,
      timestamp: new Date().toISOString(),
    };

    try {
      await this.deadLetterQueue.add(JOB_NAMES.DEAD_LETTER_JOB_FAILED, payload, {
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
    } catch (dlqError: any) {
      this.logger.error(
        `Failed to enqueue dead-letter job for ${job.name} [${job.id}]: ${dlqError.message}`,
      );
    }

    await this.audit.log({
      tenantId: null,
      actorId: null,
      action: AuditAction.SYSTEM_JOB_FAILED,
      targetType: 'SystemJob',
      targetId: String(job.id ?? job.name),
      details: payload,
    });

    const opsEmail =
      this.config.get<string>('OPS_ALERT_EMAIL') ||
      this.config.get<string>('SMTP_FROM_EMAIL');
    if (!opsEmail) return;

    await this.emailService.sendSystemJobFailureAlert({
      to: opsEmail,
      queue: QUEUE_NAME,
      jobName: job.name,
      jobId: String(job.id ?? 'unknown'),
      attemptsMade: job.attemptsMade,
      failedReason,
      payload: job.data,
    });
  }
}
