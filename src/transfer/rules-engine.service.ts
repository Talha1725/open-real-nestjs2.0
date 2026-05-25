import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface RulesCheckResult {
  approved: boolean;
  reasons: string[];
  checks: Record<string, { passed: boolean; message: string }>;
}

const ACTIVE_TRANSFER_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'RULES_CHECK',
  'MANAGER_REVIEW',
  'PRIORITY_WINDOW',
  'KYC_READY',
  'BUYER_SELECTED',
  'BUYER_VERIFICATION_PENDING',
  'COMPLIANCE_REVIEW',
  'DOCS_PENDING',
  'PAYMENT_PENDING',
  'PAYMENT_CONFIRMED',
  'FINALIZING',
  'REGISTER_UPDATE_IN_PROGRESS',
  'ESCALATED',
];

@Injectable()
export class RulesEngineService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(params: {
    tenantId: string;
    holdingId: string;
    opportunityId: string;
    sellerId: string;
    buyerId?: string | null;
    quantity: number;
    tx?: any;
  }): Promise<RulesCheckResult> {
    const client = params.tx ?? this.prisma.client;
    const reasons: string[] = [];
    const checks: Record<string, { passed: boolean; message: string }> = {};

    // 1. Check transferRequestEnabled on opportunity
    const opportunity = await client.opportunity.findUnique({
      where: { id: params.opportunityId },
    });

    if (!opportunity) {
      return {
        approved: false,
        reasons: ['Opportunity not found'],
        checks: {
          opportunityExists: {
            passed: false,
            message: 'Opportunity not found',
          },
        },
      };
    }

    // Check featureConfig first, fall back to the column-level flag
    const fc = (opportunity.featureConfig as Record<string, any>) ?? {};
    const transferEnabled =
      fc.transferRequestEnabled ?? opportunity.transferRequestEnabled ?? false;
    checks.transferEnabled = {
      passed: transferEnabled,
      message: transferEnabled
        ? 'Transfers are enabled'
        : 'Transfers are not enabled for this opportunity',
    };
    if (!transferEnabled) {
      reasons.push('Transfers are not enabled for this opportunity');
    }

    const holding = await client.holding.findUnique({
      where: { id: params.holdingId },
    });

    // 2. Check per-lot lockup period. Existing rows fall back to opportunity
    // lockup until the migration backfill has populated holding.lockupUntil.
    const lotLockupUntil = holding?.lockupUntil ?? opportunity.lockupUntil;
    if (lotLockupUntil) {
      const lockupExpired = new Date() > new Date(lotLockupUntil);
      checks.lockupPeriod = {
        passed: lockupExpired,
        message: lockupExpired
          ? 'Lockup period has expired'
          : `Lockup period active until ${lotLockupUntil.toISOString()}`,
      };
      if (!lockupExpired) {
        reasons.push(
          `Holding is locked up until ${lotLockupUntil.toISOString()}`,
        );
      }
    } else {
      checks.lockupPeriod = { passed: true, message: 'No lockup period' };
    }

    // 3. Verify holding belongs to seller and has enough units
    if (!holding || holding.userId !== params.sellerId) {
      checks.holdingOwnership = {
        passed: false,
        message: 'Holding not found or does not belong to seller',
      };
      reasons.push('Holding not found or does not belong to seller');
    } else if (holding.status !== 'ACTIVE') {
      checks.holdingOwnership = {
        passed: false,
        message: `Holding status is ${holding.status}, must be ACTIVE`,
      };
      reasons.push(`Holding status is ${holding.status}, must be ACTIVE`);
    } else {
      const hasEnoughUnits = Number(holding.units) >= params.quantity;
      checks.holdingOwnership = {
        passed: hasEnoughUnits,
        message: hasEnoughUnits
          ? `Holding has ${holding.units} units (requested ${params.quantity})`
          : `Insufficient units: has ${holding.units}, requested ${params.quantity}`,
      };
      if (!hasEnoughUnits) {
        reasons.push(
          `Insufficient units: has ${holding.units}, requested ${params.quantity}`,
        );
      }
    }

    // 4. Check minTransferQuantity
    if (opportunity.minTransferQuantity) {
      const meetsMin =
        params.quantity >= Number(opportunity.minTransferQuantity);
      checks.minTransferQuantity = {
        passed: meetsMin,
        message: meetsMin
          ? 'Meets minimum transfer quantity'
          : `Below minimum transfer quantity of ${opportunity.minTransferQuantity}`,
      };
      if (!meetsMin) {
        reasons.push(
          `Below minimum transfer quantity of ${opportunity.minTransferQuantity}`,
        );
      }
    } else {
      checks.minTransferQuantity = {
        passed: true,
        message: 'No minimum transfer quantity',
      };
    }

    // 5. Check maxHolders as a hard compliance cap. If the transfer is to an
    // existing active holder the holder count does not increase, so it remains OK.
    if (opportunity.maxHolders) {
      const currentHolderCount = await client.holding.count({
        where: {
          opportunityId: params.opportunityId,
          status: 'ACTIVE',
          units: { gt: 0 },
        },
      });
      const buyerAlreadyHolder = params.buyerId
        ? Boolean(
            await client.holding.findFirst({
              where: {
                opportunityId: params.opportunityId,
                userId: params.buyerId,
                status: 'ACTIVE',
                units: { gt: 0 },
              },
            }),
          )
        : false;
      const atMax =
        Boolean(params.buyerId) &&
        currentHolderCount >= opportunity.maxHolders &&
        !buyerAlreadyHolder;
      checks.maxHolders = {
        passed: !atMax,
        message: !params.buyerId
          ? `${currentHolderCount}/${opportunity.maxHolders} holder slots used; final cap enforced after buyer selection`
          : atMax
            ? `Max holders reached (${currentHolderCount}/${opportunity.maxHolders})`
            : `${currentHolderCount}/${opportunity.maxHolders} holder slots used`,
      };
      if (atMax) {
        reasons.push(
          `Max holders reached (${currentHolderCount}/${opportunity.maxHolders})`,
        );
      }
    } else {
      checks.maxHolders = { passed: true, message: 'No max holders limit' };
    }

    // 6. Check no existing active transfer on same holding
    const existingTransfer = await client.transferCase.findFirst({
      where: {
        holdingId: params.holdingId,
        status: { in: ACTIVE_TRANSFER_STATUSES },
      },
    });

    checks.noActiveTransfer = {
      passed: !existingTransfer,
      message: existingTransfer
        ? `Active transfer already exists (${existingTransfer.reference})`
        : 'No active transfers on this holding',
    };
    if (existingTransfer) {
      reasons.push(
        `Active transfer already exists (${existingTransfer.reference})`,
      );
    }

    return {
      approved: reasons.length === 0,
      reasons,
      checks,
    };
  }

  async evaluateBuyer(params: {
    tenantId: string;
    buyerId: string;
    opportunityId: string;
    tx?: any;
  }): Promise<RulesCheckResult> {
    const client = params.tx ?? this.prisma.client;
    const reasons: string[] = [];
    const checks: Record<string, { passed: boolean; message: string }> = {};

    const verification = await client.verification.findFirst({
      where: { tenantId: params.tenantId, userId: params.buyerId },
      orderBy: { updatedAt: 'desc' },
    });
    const kycApproved = verification?.status === 'APPROVED';
    checks.kycApproved = {
      passed: kycApproved,
      message: kycApproved ? 'Buyer KYC approved' : 'Buyer KYC is not approved',
    };
    if (!kycApproved) reasons.push('Buyer KYC is not approved');

    const liquidityConfig = await client.liquidityConfig.findUnique({
      where: { opportunityId: params.opportunityId },
    });
    const allowedCountries = liquidityConfig?.allowedCountries ?? [];
    if (allowedCountries.length > 0) {
      const jurisdiction = verification?.jurisdiction?.trim();
      const allowed = Boolean(
        jurisdiction &&
          allowedCountries.some(
            (country: string) =>
              country.toLowerCase() === jurisdiction.toLowerCase(),
          ),
      );
      checks.buyerJurisdiction = {
        passed: allowed,
        message: allowed
          ? `Buyer jurisdiction ${jurisdiction} is allowed`
          : `Buyer jurisdiction ${jurisdiction ?? 'unknown'} is not allowed`,
      };
      if (!allowed) {
        reasons.push(
          `Buyer jurisdiction ${jurisdiction ?? 'unknown'} is not allowed`,
        );
      }
    } else {
      checks.buyerJurisdiction = {
        passed: true,
        message: 'No buyer jurisdiction restriction configured',
      };
    }

    const opportunity = await client.opportunity.findUnique({
      where: { id: params.opportunityId },
      select: { featureConfig: true, maxHolders: true },
    });
    const featureConfig =
      (opportunity?.featureConfig as Record<string, any> | null) ?? {};
    const ruleset = featureConfig.investorCategoryRuleset;
    if (ruleset) {
      const providerData =
        (verification?.providerData as Record<string, any> | null) ?? {};
      const investorCategory =
        providerData.investorCategory ??
        providerData.investor_category ??
        providerData.category;
      const allowedCategories = Array.isArray(ruleset)
        ? ruleset
        : (ruleset.allowedCategories ?? ruleset.allowed ?? []);
      const passed =
        allowedCategories.length === 0 ||
        allowedCategories.includes(investorCategory);
      checks.investorCategory = {
        passed,
        message: passed
          ? 'Buyer investor category is allowed'
          : 'Buyer investor category is not allowed',
      };
      if (!passed) reasons.push('Buyer investor category is not allowed');
    } else {
      checks.investorCategory = {
        passed: true,
        message: 'No investor category restriction configured',
      };
    }

    if (opportunity?.maxHolders) {
      const buyerAlreadyHolder = Boolean(
        await client.holding.findFirst({
          where: {
            opportunityId: params.opportunityId,
            userId: params.buyerId,
            status: 'ACTIVE',
            units: { gt: 0 },
          },
        }),
      );
      const currentHolderCount = await client.holding.count({
        where: {
          opportunityId: params.opportunityId,
          status: 'ACTIVE',
          units: { gt: 0 },
        },
      });
      const passed =
        buyerAlreadyHolder || currentHolderCount < opportunity.maxHolders;
      checks.maxHolders = {
        passed,
        message: passed
          ? `${currentHolderCount}/${opportunity.maxHolders} holder slots used`
          : `Max holders reached (${currentHolderCount}/${opportunity.maxHolders})`,
      };
      if (!passed) {
        reasons.push(
          `Max holders reached (${currentHolderCount}/${opportunity.maxHolders})`,
        );
      }
    }

    return {
      approved: reasons.length === 0,
      reasons,
      checks,
    };
  }
}
