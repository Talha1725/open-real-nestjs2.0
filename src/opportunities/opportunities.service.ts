import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContextService } from '../common/tenant-context/tenant-context.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import { S3Service } from '../documents/s3.service.js';

const INVESTOR_VISIBLE_STATUSES = ['LIVE', 'CLOSED'];

@Injectable()
export class OpportunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly documentsService: DocumentsService,
    private readonly s3: S3Service,
  ) {}

  async getOpportunityDetail(opportunityId: string) {
    const opportunity = await this.prisma.client.opportunity.findFirst({
      where: {
        id: opportunityId,
        status: { in: INVESTOR_VISIBLE_STATUSES },
      },
      include: {
        issuerOrg: { select: { name: true } },
      },
    });

    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }

    let heroImageUrl: string | null = null;
    if (opportunity.heroImageKey) {
      try {
        heroImageUrl = await this.s3.getSignedDownloadUrl(
          opportunity.heroImageKey,
        );
      } catch {
        heroImageUrl = null;
      }
    }

    return {
      id: opportunity.id,
      title: opportunity.title,
      summary: opportunity.summary,
      investmentThesis: opportunity.investmentThesis,
      whatYouAreBuying: opportunity.whatYouAreBuying,
      risks: opportunity.risks,
      feesAndConflicts: opportunity.feesAndConflicts,
      faq: opportunity.faq,
      assetClass: opportunity.assetClass,
      region: opportunity.region,
      currency: opportunity.currency,
      minimumAmount: opportunity.minimumAmount,
      maximumAmount: opportunity.maximumAmount,
      status: opportunity.status,
      issuerName: opportunity.issuerOrg.name,
      heroImageUrl,
      createdAt: opportunity.createdAt,
    };
  }

  async getOpportunityDocuments(opportunityId: string) {
    const opportunity = await this.prisma.client.opportunity.findFirst({
      where: {
        id: opportunityId,
        status: { in: INVESTOR_VISIBLE_STATUSES },
      },
    });

    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }

    const docs = await this.documentsService.listDocuments(opportunityId);

    const docsWithUrls = await Promise.all(
      docs.map(async (doc) => {
        const { url } = await this.documentsService.getSignedUrl(doc.id);
        return {
          id: doc.id,
          fileName: doc.fileName,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
          category: doc.category,
          url,
        };
      }),
    );

    return docsWithUrls;
  }

  async getSimilarOpportunities(opportunityId: string) {
    const opportunity = await this.prisma.client.opportunity.findFirst({
      where: {
        id: opportunityId,
        status: { in: INVESTOR_VISIBLE_STATUSES },
      },
    });

    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }

    const similar = await this.prisma.client.opportunity.findMany({
      where: {
        id: { not: opportunityId },
        status: 'LIVE',
        OR: [
          { assetClass: opportunity.assetClass },
          { region: opportunity.region },
        ],
      },
      select: {
        id: true,
        title: true,
        summary: true,
        assetClass: true,
        region: true,
        currency: true,
        minimumAmount: true,
        heroImageKey: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 4,
    });

    return await Promise.all(
      similar.map(async (item) => {
        let heroImageUrl: string | null = null;
        if (item.heroImageKey) {
          try {
            heroImageUrl = await this.s3.getSignedDownloadUrl(
              item.heroImageKey,
            );
          } catch {
            heroImageUrl = null;
          }
        }
        return {
          ...item,
          heroImageUrl,
          heroImageKey: undefined,
        };
      }),
    );
  }

  async getRequestConfig(opportunityId: string) {
    const opportunity = await this.prisma.client.opportunity.findFirst({
      where: {
        id: opportunityId,
        status: 'LIVE',
      },
    });

    if (!opportunity) {
      throw new NotFoundException(
        'Opportunity not found or not accepting investments',
      );
    }

    const config = this.tenantContext.getTenantConfig();
    const workflows = config?.workflows ?? {};
    const integrations = config?.integrations ?? {};

    return {
      opportunityId: opportunity.id,
      title: opportunity.title,
      minimumAmount: opportunity.minimumAmount,
      maximumAmount: opportunity.maximumAmount,
      currency: opportunity.currency,
      acknowledgements: workflows.requiredAcknowledgements ?? [],
      paymentConfig: integrations.paymentConfig ?? null,
    };
  }
}
