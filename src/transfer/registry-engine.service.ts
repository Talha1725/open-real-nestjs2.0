import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditAction } from '../audit/audit-action.enum.js';

@Injectable()
export class RegistryEngineService {
  constructor(private readonly prisma: PrismaService) {}

  async executeTransfer(params: {
    tenantId: string;
    transferCaseId: string;
    sellerId: string;
    buyerId: string;
    holdingId: string;
    opportunityId: string;
    quantity: number;
    actorId: string;
  }): Promise<{ registryEntryId: string; buyerHoldingId: string }> {
    return this.prisma.bypassTenantScoping(() =>
      this.prisma.client.$transaction(async (tx: any) => {
        // 1. Load seller holding with row lock and verify sufficient units
        await tx.$executeRaw`SELECT id FROM "holdings" WHERE "id" = ${params.holdingId} FOR UPDATE`;

        const sellerHolding = await tx.holding.findUnique({
          where: { id: params.holdingId },
        });

        if (!sellerHolding || sellerHolding.userId !== params.sellerId) {
          throw new BadRequestException(
            'Seller holding not found or ownership mismatch',
          );
        }

        if (Number(sellerHolding.units) < params.quantity) {
          throw new BadRequestException(
            `Insufficient units: has ${sellerHolding.units}, need ${params.quantity}`,
          );
        }

        // 2. Decrement seller's units
        const remainingUnits = Number(sellerHolding.units) - params.quantity;
        await tx.holding.update({
          where: { id: params.holdingId },
          data: {
            units: remainingUnits,
            status: remainingUnits <= 0 ? 'TRANSFERRED' : 'ACTIVE',
          },
        });

        // 3. Upsert buyer holding
        const existingBuyerHolding = await tx.holding.findFirst({
          where: {
            userId: params.buyerId,
            opportunityId: params.opportunityId,
            tenantId: params.tenantId,
            status: 'ACTIVE',
          },
        });

        let buyerHolding;
        if (existingBuyerHolding) {
          buyerHolding = await tx.holding.update({
            where: { id: existingBuyerHolding.id },
            data: {
              units: Number(existingBuyerHolding.units) + params.quantity,
            },
          });
        } else {
          buyerHolding = await tx.holding.create({
            data: {
              tenantId: params.tenantId,
              userId: params.buyerId,
              opportunityId: params.opportunityId,
              investmentRequestId: null,
              units: params.quantity,
              acquisitionDate: new Date(),
              lockupUntil: null,
              status: 'ACTIVE',
            },
          });
        }

        // 4. Append immutable RegistryEntry
        const registryEntry = await tx.registryEntry.create({
          data: {
            tenantId: params.tenantId,
            transferCaseId: params.transferCaseId,
            opportunityId: params.opportunityId,
            fromUserId: params.sellerId,
            toUserId: params.buyerId,
            quantity: params.quantity,
            eventType: 'TRANSFER',
            sealedBy: params.actorId,
          },
        });

        // 5. Update TransferCase
        await tx.transferCase.update({
          where: { id: params.transferCaseId },
          data: {
            registryMutatedAt: new Date(),
            registryMutatedBy: params.actorId,
          },
        });

        // 6. Append TransferStatusHistory
        await tx.transferStatusHistory.create({
          data: {
            transferCaseId: params.transferCaseId,
            fromStatus: 'REGISTER_UPDATE_IN_PROGRESS',
            toStatus: 'COMPLETED',
            actorId: params.actorId,
            notes: 'Registry mutation completed',
          },
        });

        await tx.auditLogEvent.create({
          data: {
            tenantId: params.tenantId,
            actorId: params.actorId,
            action: AuditAction.REGISTRY_UPDATED,
            targetType: 'RegistryEntry',
            targetId: registryEntry.id,
            details: {
              transferCaseId: params.transferCaseId,
              fromUserId: params.sellerId,
              toUserId: params.buyerId,
              quantity: params.quantity,
            },
          },
        });

        return {
          registryEntryId: registryEntry.id,
          buyerHoldingId: buyerHolding.id,
        };
      }),
    );
  }

  async sealPrimaryIssuance(params: {
    tenantId: string;
    opportunityId: string;
    toUserId: string;
    quantity: number;
    holdingId: string;
    actorId: string;
    tx?: any;
  }): Promise<{ registryEntryId: string }> {
    const client = params.tx ?? this.prisma.client;
    const entry = await client.registryEntry.create({
      data: {
        tenantId: params.tenantId,
        opportunityId: params.opportunityId,
        fromUserId: null,
        toUserId: params.toUserId,
        quantity: params.quantity,
        eventType: 'PRIMARY_ISSUANCE',
        sealedBy: params.actorId,
        metadata: { holdingId: params.holdingId },
      },
    });

    await client.auditLogEvent.create({
      data: {
        tenantId: params.tenantId,
        actorId: params.actorId,
        action: AuditAction.REGISTRY_PRIMARY_ISSUANCE,
        targetType: 'RegistryEntry',
        targetId: entry.id,
        details: {
          opportunityId: params.opportunityId,
          toUserId: params.toUserId,
          quantity: params.quantity,
          holdingId: params.holdingId,
        },
      },
    });

    return { registryEntryId: entry.id };
  }
}
