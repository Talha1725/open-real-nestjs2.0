import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class TokenAdapterService {
  private readonly logger = new Logger(TokenAdapterService.name);

  constructor(private readonly prisma: PrismaService) {}

  async mirrorTransfer(params: {
    tenantId: string;
    transferCaseId: string;
    holdingId: string;
    fromUserId: string;
    toUserId: string;
    quantity: number;
  }): Promise<void> {
    const payload = {
      event: 'FORCED_TRANSFER',
      from: params.fromUserId,
      to: params.toUserId,
      amount: params.quantity,
      timestamp: new Date().toISOString(),
      mode: 'DB_SHADOW_ONLY',
    };
    try {
      await this.prisma.client.tokenRecord.upsert({
        where: { transferCaseId: params.transferCaseId },
        update: {
          tokenState: 'PENDING_SYNC',
          syncPayload: payload,
          syncedAt: null,
          syncError: null,
        },
        create: {
          tenantId: params.tenantId,
          transferCaseId: params.transferCaseId,
          holdingId: params.holdingId,
          tokenState: 'PENDING_SYNC',
          syncPayload: payload,
          syncedAt: null,
        },
      });
    } catch (err: any) {
      this.logger.warn(
        `Failed to mirror transfer ${params.transferCaseId}: ${err.message}`,
      );
      try {
        await this.prisma.client.tokenRecord.upsert({
          where: { transferCaseId: params.transferCaseId },
          update: {
            tokenState: 'FAILED',
            syncError: err.message,
          },
          create: {
            tenantId: params.tenantId,
            transferCaseId: params.transferCaseId,
            holdingId: params.holdingId,
            tokenState: 'FAILED',
            syncError: err.message,
          },
        });
      } catch (recordErr: any) {
        this.logger.error(
          `Failed to persist token sync failure for ${params.transferCaseId}: ${recordErr.message}`,
        );
        throw recordErr;
      }
    }
  }

  async mirrorPrimaryIssuance(params: {
    tenantId: string;
    holdingId: string;
    toUserId: string;
    quantity: number;
  }): Promise<void> {
    try {
      await this.prisma.client.tokenRecord.create({
        data: {
          tenantId: params.tenantId,
          holdingId: params.holdingId,
          tokenState: 'SHADOW_MIRROR',
          syncPayload: {
            event: 'MINT',
            to: params.toUserId,
            amount: params.quantity,
            timestamp: new Date().toISOString(),
          },
        },
      });
    } catch (err: any) {
      this.logger.warn(
        `Failed to mirror primary issuance for holding ${params.holdingId}: ${err.message}`,
      );
      // Never throw — shadow mode only
    }
  }
}
