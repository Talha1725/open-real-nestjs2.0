import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContextService } from '../common/tenant-context/tenant-context.service.js';
import { S3Service } from '../documents/s3.service.js';
import { EncryptionService } from '../common/encryption/encryption.service.js';

@Injectable()
export class InvestorHomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly s3: S3Service,
    private readonly encryption: EncryptionService,
  ) {}

  async getHome(userId: string, userRole: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: {
        fullName: true,
        role: true,
        emailVerified: true,
      },
    });

    const tenant = this.tenantContext.getTenant();

    const decryptedName = user?.fullName
      ? this.encryption.decrypt(user.fullName)
      : 'Investor';

    // Base response for all authenticated users
    const response: any = {
      greeting: `Welcome back, ${decryptedName}`,
      tenantName: tenant?.name ?? 'OpenReal',
      userStatus: {
        role: user?.role ?? userRole,
        emailVerified: user?.emailVerified ?? false,
        kycStatus: await this.getKycStatus(userId),
      },
      actions: this.getActions(user?.role ?? userRole),
    };

    // If user is VERIFIED or higher, include portfolio summary and featured opportunities
    const isVerified = ['VERIFIED', 'ISSUER', 'ADMIN', 'SUPER_ADMIN'].includes(
      user?.role ?? userRole,
    );

    if (isVerified) {
      const [portfolioSummary, featuredOpportunities, pendingRequests] =
        await Promise.all([
          this.getPortfolioSummary(userId),
          this.getFeaturedOpportunities(),
          this.getPendingRequests(userId),
        ]);

      response.portfolio = portfolioSummary;
      response.featuredOpportunities = featuredOpportunities;
      response.pendingRequests = pendingRequests;
    }

    // Include tenant announcements if any
    const announcements = await this.getAnnouncements();
    if (announcements.length > 0) {
      response.announcements = announcements;
    }

    return response;
  }

  private async getKycStatus(userId: string) {
    const verification = await this.prisma.client.verification.findFirst({
      where: { userId },
      select: { status: true, eligibilityStatus: true },
    });

    return verification
      ? {
          status: verification.status,
          eligibilityStatus: verification.eligibilityStatus,
        }
      : { status: 'NOT_STARTED', eligibilityStatus: 'PENDING' };
  }

  private getActions(role: string): { label: string; action: string }[] {
    const actions: { label: string; action: string }[] = [];

    if (role === 'REGISTERED') {
      actions.push({
        label: 'Verify your identity to start investing',
        action: 'START_KYC',
      });
    }

    if (['VERIFIED', 'ISSUER', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
      actions.push({
        label: 'Browse investment opportunities',
        action: 'VIEW_LISTINGS',
      });
      actions.push({
        label: 'View your portfolio',
        action: 'VIEW_PORTFOLIO',
      });
    }

    return actions;
  }

  private async getPortfolioSummary(userId: string) {
    const [activeHoldings, paidDistributions] = await Promise.all([
      this.prisma.client.holding.findMany({
        where: { userId, status: 'ACTIVE' },
        select: { units: true },
      }),
      this.prisma.client.distribution.findMany({
        where: {
          holding: { userId },
          status: 'PAID',
        },
        select: { amount: true },
      }),
    ]);

    const totalValue = activeHoldings.reduce(
      (sum, h) => sum + Number(h.units),
      0,
    );
    const totalDistributions = paidDistributions.reduce(
      (sum, d) => sum + Number(d.amount),
      0,
    );

    return {
      totalHoldings: activeHoldings.length,
      totalValue,
      totalDistributions,
    };
  }

  private async getFeaturedOpportunities() {
    const opportunities = await this.prisma.client.opportunity.findMany({
      where: { status: 'LIVE' },
      select: {
        id: true,
        title: true,
        summary: true,
        assetClass: true,
        region: true,
        currency: true,
        minimumAmount: true,
        heroImageKey: true,
      },
      orderBy: { approvedAt: 'desc' },
      take: 4,
    });

    return Promise.all(
      opportunities.map(async (opp) => ({
        id: opp.id,
        title: opp.title,
        summary: opp.summary,
        assetClass: opp.assetClass,
        region: opp.region,
        currency: opp.currency,
        minimumAmount: opp.minimumAmount,
        heroImageUrl: await this.getHeroUrl(opp.heroImageKey),
      })),
    );
  }

  private async getPendingRequests(userId: string) {
    const requests = await this.prisma.client.investmentRequest.findMany({
      where: {
        userId,
        status: { in: ['REQUEST_CREATED', 'PENDING_PAYMENT_CONFIRMATION'] },
      },
      select: {
        id: true,
        referenceNumber: true,
        amount: true,
        currency: true,
        status: true,
        expiresAt: true,
        opportunity: {
          select: { title: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return requests.map((r) => ({
      id: r.id,
      referenceNumber: r.referenceNumber,
      amount: r.amount,
      currency: r.currency,
      status: r.status,
      expiresAt: r.expiresAt,
      opportunityTitle: r.opportunity.title,
    }));
  }

  private async getAnnouncements() {
    const articles = await this.prisma.client.contentArticle.findMany({
      where: { category: 'NEWS', published: true },
      select: {
        id: true,
        slug: true,
        title: true,
        publishedAt: true,
      },
      orderBy: { publishedAt: 'desc' },
      take: 3,
    });

    return articles;
  }

  private async getHeroUrl(
    heroImageKey: string | null,
  ): Promise<string | null> {
    if (!heroImageKey) return null;
    try {
      return await this.s3.getSignedDownloadUrl(heroImageKey);
    } catch {
      return null;
    }
  }
}
