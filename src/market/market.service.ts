import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class MarketService {
  constructor(private readonly prisma: PrismaService) {}

  async guardMarketAccess(opportunityId: string): Promise<void> {
    const opportunity = await this.prisma.client.opportunity.findUnique({
      where: { id: opportunityId },
      select: { id: true, featureConfig: true },
    });

    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }

    const fc = (opportunity.featureConfig as Record<string, any>) ?? {};
    if (!fc.secondaryMarketEnabled) {
      throw new ForbiddenException(
        'Secondary market is not enabled for this instrument',
      );
    }
  }
}
