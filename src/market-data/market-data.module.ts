import { Global, Module } from '@nestjs/common';
import { MarketDataService } from './market-data.service.js';
import { CoinGeckoProvider } from './providers/coingecko.provider.js';
import { CoinMarketCapProvider } from './providers/coinmarketcap.provider.js';
import { DuneProvider } from './providers/dune.provider.js';
import { AlchemyProvider } from './providers/alchemy.provider.js';

@Global()
@Module({
  providers: [
    MarketDataService,
    CoinGeckoProvider,
    CoinMarketCapProvider,
    DuneProvider,
    AlchemyProvider,
  ],
  exports: [MarketDataService],
})
export class MarketDataModule {}
