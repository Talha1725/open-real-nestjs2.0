import { Module } from '@nestjs/common';
import { ContentService } from './content.service.js';
import { MarketOverviewService } from './market-overview.service.js';
import { ContentController } from './content.controller.js';
import { AdminContentController } from './admin-content.controller.js';
import { PublicMarketService } from './public-market.service.js';
import { PublicNewsService } from './public-news.service.js';

@Module({
  controllers: [ContentController, AdminContentController],
  providers: [
    ContentService,
    MarketOverviewService,
    PublicMarketService,
    PublicNewsService,
  ],
  exports: [
    ContentService,
    MarketOverviewService,
    PublicMarketService,
    PublicNewsService,
  ],
})
export class ContentModule {}
