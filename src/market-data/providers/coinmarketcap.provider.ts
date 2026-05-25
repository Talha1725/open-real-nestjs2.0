import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CoinGeckoMarketOverview } from './coingecko.provider.js';

interface CoinMarketCapGlobalMetricsResponse {
  data: {
    active_cryptocurrencies?: number;
    quote?: {
      USD?: {
        total_market_cap?: number;
        total_market_cap_yesterday_percentage_change?: number;
      };
    };
    btc_dominance?: number;
    eth_dominance?: number;
    last_updated?: string;
  };
}

interface CoinMarketCapListingsResponse {
  data: Array<{
    id: number;
    name: string;
    symbol: string;
    cmc_rank?: number;
    circulating_supply?: number;
    quote?: {
      USD?: {
        market_cap?: number;
        percent_change_24h?: number;
        percent_change_7d?: number;
        percent_change_30d?: number;
      };
    };
  }>;
}

const BASE_URL = 'https://pro-api.coinmarketcap.com';

@Injectable()
export class CoinMarketCapProvider {
  private readonly logger = new Logger(CoinMarketCapProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService
      .get<string>('COINMARKETCAP_API_KEY', '')
      .trim();
    this.baseUrl =
      this.configService
        .get<string>('COINMARKETCAP_API_BASE_URL', '')
        .trim() || BASE_URL;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  publicUrl(): string {
    return this.baseUrl;
  }

  async getMarketOverview(): Promise<CoinGeckoMarketOverview> {
    const [global, listings] = await Promise.all([
      this.request<CoinMarketCapGlobalMetricsResponse>(
        '/v1/global-metrics/quotes/latest?convert=USD',
      ),
      this.request<CoinMarketCapListingsResponse>(
        '/v1/cryptocurrency/listings/latest?convert=USD&limit=50',
      ),
    ]);

    const totalMarketValue = Math.round(
      global.data.quote?.USD?.total_market_cap ?? 0,
    );
    const topCoins = (listings.data ?? []).slice(0, 10);
    const assetClassBreakdown = this.buildDominanceBreakdown(
      global.data.btc_dominance ?? 0,
      global.data.eth_dominance ?? 0,
      totalMarketValue,
    );

    return {
      summary: {
        totalMarketValue,
        totalProtocols: global.data.active_cryptocurrencies ?? listings.data.length,
        change24h: this.round(
          global.data.quote?.USD?.total_market_cap_yesterday_percentage_change ??
            0,
        ),
        change7d: this.round(this.weightedChange(listings.data ?? [], '7d')),
        change30d: this.round(this.weightedChange(listings.data ?? [], '30d')),
        lastUpdated:
          global.data.last_updated ?? new Date().toISOString(),
      },
      assetClassBreakdown,
      topProtocols: topCoins.map((coin) => ({
        name: coin.name,
        tvl: Math.round(coin.quote?.USD?.market_cap ?? 0),
        change24h: this.round(coin.quote?.USD?.percent_change_24h ?? 0),
        change7d: this.round(coin.quote?.USD?.percent_change_7d ?? 0),
        chains: [],
        logo: '',
        category: coin.symbol?.toUpperCase() ?? 'CRYPTO',
      })),
      chainBreakdown: [],
    };
  }

  private async request<T>(path: string): Promise<T> {
    if (!this.apiKey) {
      throw new Error('CoinMarketCap API key is not configured');
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-CMC_PRO_API_KEY': this.apiKey,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`CoinMarketCap ${path} failed: ${res.status} — ${body}`);
      throw new Error(`CoinMarketCap API error: ${res.status} — ${body}`);
    }

    return (await res.json()) as T;
  }

  private buildDominanceBreakdown(
    btcDominance: number,
    ethDominance: number,
    totalMarketValue: number,
  ) {
    const entries = [
      { category: 'Bitcoin', percentageOfTotal: this.round(btcDominance) },
      { category: 'Ethereum', percentageOfTotal: this.round(ethDominance) },
    ].filter((item) => item.percentageOfTotal > 0);

    const used = entries.reduce((sum, item) => sum + item.percentageOfTotal, 0);
    if (used < 100) {
      entries.push({
        category: 'Other',
        percentageOfTotal: this.round(Math.max(0, 100 - used)),
      });
    }

    return entries.map((item) => ({
      category: item.category,
      totalValue: Math.round((totalMarketValue * item.percentageOfTotal) / 100),
      protocolCount: 1,
      percentageOfTotal: item.percentageOfTotal,
    }));
  }

  private weightedChange(
    coins: CoinMarketCapListingsResponse['data'],
    window: '7d' | '30d',
  ): number {
    let totalCap = 0;
    let weighted = 0;

    for (const coin of coins) {
      const cap = coin.quote?.USD?.market_cap ?? 0;
      const change =
        window === '7d'
          ? (coin.quote?.USD?.percent_change_7d ?? 0)
          : (coin.quote?.USD?.percent_change_30d ?? 0);
      if (cap <= 0 || !Number.isFinite(change)) continue;
      totalCap += cap;
      weighted += cap * change;
    }

    return totalCap > 0 ? weighted / totalCap : 0;
  }

  private round(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 100) / 100;
  }
}
