import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { S3Service } from '../documents/s3.service.js';

@ApiTags('Health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly s3: S3Service,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness check' })
  @ApiResponse({ status: 200, description: 'Service process is running' })
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.2.0',
    };
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness check' })
  @ApiResponse({ status: 200, description: 'Service process is running' })
  live() {
    return this.check();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness check' })
  @ApiResponse({
    status: 200,
    description: 'Required dependencies are reachable',
  })
  @ApiResponse({
    status: 503,
    description: 'One or more required dependencies are unavailable',
  })
  async ready() {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkS3(),
    ]);

    const database =
      checks[0].status === 'fulfilled'
        ? checks[0].value
        : { healthy: false, responseMs: 0 };
    const redis =
      checks[1].status === 'fulfilled'
        ? checks[1].value
        : { healthy: false, responseMs: 0 };
    const s3 =
      checks[2].status === 'fulfilled'
        ? checks[2].value
        : { healthy: false, responseMs: 0 };

    const body = {
      status:
        database.healthy && redis.healthy && s3.healthy
          ? 'ready'
          : 'not_ready',
      timestamp: new Date().toISOString(),
      checks: { database, redis, s3 },
    };

    if (body.status !== 'ready') {
      throw new ServiceUnavailableException(body);
    }

    return body;
  }

  private async checkDatabase(): Promise<{
    healthy: boolean;
    responseMs: number;
  }> {
    const start = Date.now();
    try {
      await this.prisma.client.$queryRawUnsafe('SELECT 1');
      return { healthy: true, responseMs: Date.now() - start };
    } catch {
      return { healthy: false, responseMs: Date.now() - start };
    }
  }

  private async checkRedis(): Promise<{
    healthy: boolean;
    responseMs: number;
  }> {
    const start = Date.now();
    try {
      const result = await this.redis.getClient().ping();
      return {
        healthy: result === 'PONG',
        responseMs: Date.now() - start,
      };
    } catch {
      return { healthy: false, responseMs: Date.now() - start };
    }
  }

  private async checkS3(): Promise<{
    healthy: boolean;
    responseMs: number;
  }> {
    const start = Date.now();
    try {
      await this.s3.getSignedDownloadUrl('__health-check__', 60);
      return { healthy: true, responseMs: Date.now() - start };
    } catch {
      return { healthy: false, responseMs: Date.now() - start };
    }
  }
}
