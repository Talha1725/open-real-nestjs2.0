import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobsOptions, Queue } from 'bullmq';
import { RedisService } from '../redis/redis.service.js';
import { QUEUE_NAME, JOB_NAMES } from './jobs.constants.js';

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private queue!: Queue;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    this.queue = new Queue(QUEUE_NAME, {
      connection: this.redis.getConnectionOpts(),
    });

    await this.scheduleRepeatingJobs();
    this.logger.log('JobsService initialized, repeating jobs scheduled');
  }

  private async scheduleRepeatingJobs() {
    const rawInterval = this.config.get(
      'INVESTMENT_REQUEST_EXPIRY_CHECK_INTERVAL_MS',
      300000,
    );
    const intervalMs = Number(rawInterval);

    const existing = await this.queue.getRepeatableJobs();
    const expiryJob = existing.find(
      (j) => j.name === JOB_NAMES.INVESTMENT_REQUEST_EXPIRY_CHECK,
    );

    // If job exists but frequency changed, remove it first
    if (expiryJob && Number(expiryJob.every) !== intervalMs) {
      this.logger.log(
        `Job frequency changed (${expiryJob.every}ms -> ${intervalMs}ms). Re-scheduling...`,
      );
      await this.queue.removeRepeatableByKey(expiryJob.key);
    }

    // Add job if missing or re-scheduling
    if (!expiryJob || Number(expiryJob.every) !== intervalMs) {
      await this.queue.add(
        JOB_NAMES.INVESTMENT_REQUEST_EXPIRY_CHECK,
        {},
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          repeat: { every: intervalMs },
          jobId: 'recurring-expiry-check',
        },
      );
      this.logger.log(
        `Scheduled investment-request-expiry-check (every ${intervalMs / 1000}s)`,
      );
    }
  }

  async addJob(name: string, data: Record<string, any>, opts?: any) {
    const defaultOpts: JobsOptions = {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    };
    return this.queue.add(name, data, { ...defaultOpts, ...(opts ?? {}) });
  }

  async getQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    const repeatableJobs = await this.queue.getRepeatableJobs();

    return {
      queue: QUEUE_NAME,
      stats: { waiting, active, completed, failed, delayed },
      repeatableJobs: repeatableJobs.map((j) => ({
        name: j.name,
        every: j.every,
        next: j.next ? new Date(j.next).toISOString() : null,
      })),
    };
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
