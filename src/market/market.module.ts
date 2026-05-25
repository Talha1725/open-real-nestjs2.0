import { Module } from '@nestjs/common';
import { MarketService } from './market.service.js';
import { MarketController } from './market.controller.js';

@Module({
  controllers: [MarketController],
  providers: [MarketService],
  exports: [MarketService],
})
export class MarketModule {}
