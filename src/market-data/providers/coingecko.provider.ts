import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { RedisService } from '../../redis/redis.service.js';

export interface CoinGeckoMarketOverview {
  summary: {
    totalMarketValue: number;
    totalProtocols: number;
    change24h: number;
    change7d: number;
    change30d: number;
    lastUpdated: string;
  };
  assetClassBreakdown: {
    category: string;
    totalValue: number;
    protocolCount: number;
    percentageOfTotal: number;
  }[];
  topProtocols: {
    name: string;
    tvl: number;
    change24h: number;
    change7d: number;
    chains: string[];
    logo: string;
    category: string;
  }[];
  chainBreakdown: {
    chain: string;
    totalValue: number;
    protocolCount: number;
    percentageOfTotal: number;
  }[];
}

export interface CoinGeckoHistoricalTvl {
  period: string;
  dataPoints: { date: string; totalTvl: number }[];
  protocols: string[];
}

interface CoinGeckoGlobalResponse {
  data: {
    active_cryptocurrencies: number;
    total_market_cap: Record<string, number>;
    market_cap_percentage: Record<string, number>;
    market_cap_change_percentage_24h_usd: number;
    updated_at: number;
  };
}

interface CoinGeckoCoinMarket {
  id: string;
  symbol: string;
  name: string;
  image: string;
  market_cap: number;
  current_price: number;
  price_change_percentage_24h_in_currency?: number;
  price_change_percentage_7d_in_currency?: number;
  price_change_percentage_30d_in_currency?: number;
}

interface CoinGeckoMarketChartResponse {
  market_caps: [number, number][];
}

const PERIOD_DAYS: Record<string, number> = {
  month: 30,
  quarter: 90,
  year: 365,
};

const PUBLIC_BASE_URL = 'https://api.coingecko.com/api/v3';
const PRO_BASE_URL = 'https://pro-api.coingecko.com/api/v3';
const KEY_TYPE_DEMO = 'demo';
const KEY_TYPE_PRO = 'pro';

@Injectable()
export class CoinGeckoProvider {
  private readonly logger = new Logger(CoinGeckoProvider.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly keyType: 'demo' | 'pro' | 'none';
  private readonly maxRetries: number;
  private readonly requestCacheTtlSeconds: number;
  private readonly staleCacheTtlSeconds: number;
  private readonly rateLimitCooldownMs: number;
  private static requestQueue: Promise<void> = Promise.resolve();
  private static lastRequestTime = 0;
  private static rateLimitedUntil = 0;
  private readonly memoryCache = new Map<
    string,
    { data: any; expiry: number }
  >();
  private readonly inFlightRequests = new Map<string, Promise<any>>();

  constructor(
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.apiKey = this.configService
      .get<string>('COINGECKO_API_KEY', '')
      .trim();
    this.keyType = this.resolveKeyType(
      this.configService
        .get<string>('COINGECKO_API_KEY_TYPE', '')
        .trim()
        .toLowerCase(),
    );

    const configuredBase = this.configService
      .get<string>('COINGECKO_API_BASE_URL', '')
      .trim();
    this.baseUrl = configuredBase || this.defaultBaseUrl();
    this.maxRetries = this.configService.get<number>(
      'COINGECKO_MAX_RETRIES',
      3,
    );
    this.requestCacheTtlSeconds = this.configService.get<number>(
      'COINGECKO_REQUEST_CACHE_TTL_SECONDS',
      900,
    );
    this.staleCacheTtlSeconds = this.configService.get<number>(
      'COINGECKO_STALE_CACHE_TTL_SECONDS',
      86_400,
    );
    this.rateLimitCooldownMs =
      this.configService.get<number>(
        'COINGECKO_RATE_LIMIT_COOLDOWN_SECONDS',
        60,
      ) * 1000;
  }

  private resolveKeyType(configured: string): 'demo' | 'pro' | 'none' {
    if (!this.apiKey) return 'none';
    if (configured === KEY_TYPE_PRO) return 'pro';
    if (configured === KEY_TYPE_DEMO) return 'demo';
    return 'demo';
  }

  private defaultBaseUrl(): string {
    return this.keyType === 'pro' ? PRO_BASE_URL : PUBLIC_BASE_URL;
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl);
  }

  publicUrl(): string {
    return this.baseUrl;
  }

  async getMarketOverview(): Promise<CoinGeckoMarketOverview> {
    const [global, topCoins] = await Promise.all([
      this.fetchGlobal(),
      this.fetchTopCoins(50),
    ]);

    const totalMarketValue = Math.round(global.data.total_market_cap?.usd ?? 0);
    const change24h = this.round(
      global.data.market_cap_change_percentage_24h_usd ?? 0,
    );
    const change7d = this.round(this.weightedChange(topCoins, '7d'));
    const change30d = this.round(this.weightedChange(topCoins, '30d'));

    const assetClassBreakdown = this.buildDominanceBreakdown(
      global.data.market_cap_percentage ?? {},
      totalMarketValue,
      topCoins,
    );

    const topProtocols = topCoins.slice(0, 10).map((coin) => ({
      name: coin.name,
      tvl: Math.round(coin.market_cap ?? 0),
      change24h: this.round(coin.price_change_percentage_24h_in_currency ?? 0),
      change7d: this.round(coin.price_change_percentage_7d_in_currency ?? 0),
      chains: [],
      logo: coin.image ?? '',
      category: coin.symbol?.toUpperCase() ?? 'CRYPTO',
    }));

    return {
      summary: {
        totalMarketValue,
        totalProtocols: global.data.active_cryptocurrencies ?? topCoins.length,
        change24h,
        change7d,
        change30d,
        lastUpdated: new Date(
          (global.data.updated_at ?? Math.floor(Date.now() / 1000)) * 1000,
        ).toISOString(),
      },
      assetClassBreakdown,
      topProtocols,
      chainBreakdown: [],
    };
  }

  async getHistoricalTvl(period: string): Promise<CoinGeckoHistoricalTvl> {
    const validPeriod = PERIOD_DAYS[period] ? period : 'month';
    const days = PERIOD_DAYS[validPeriod];

    // /global/market_cap_chart is Pro-only. On the free tier we approximate
    // total market cap by summing per-coin market_chart series for the top N
    // coins. We use a smaller sample on the free tier to avoid 429s.
    const sampleSize = this.keyType === 'pro' ? 50 : 5;
    const topCoins = await this.fetchTopCoins(sampleSize).catch(() => []);

    const charts: (CoinGeckoMarketChartResponse | null)[] = [];
    for (const coin of topCoins) {
      const cacheKey = `coingecko:chart:${coin.id}:${days}`;
      try {
        let chart =
          await this.redis.getJSON<CoinGeckoMarketChartResponse>(cacheKey);

        if (!chart) {
          chart = await this.request<CoinGeckoMarketChartResponse>(
            `/coins/${encodeURIComponent(coin.id)}/market_chart?vs_currency=usd&days=${days}&interval=daily`,
          );
          if (chart) {
            // Cache individual charts for 1 hour to avoid repeated requests for different periods/views
            await this.redis.setJSON(cacheKey, chart, 3600);
          }
        }

        charts.push(chart);
      } catch (err) {
        this.logger.warn(
          `CoinGecko market_chart for ${coin.id} failed: ${(err as Error).message}`,
        );
        charts.push(null);
      }
    }

    const dailyMap = new Map<string, number>();
    for (const chart of charts) {
      if (!chart) continue;
      for (const [timestamp, marketCap] of chart.market_caps ?? []) {
        const dateKey = new Date(timestamp).toISOString().split('T')[0];
        dailyMap.set(dateKey, (dailyMap.get(dateKey) ?? 0) + marketCap);
      }
    }

    const dataPoints = Array.from(dailyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, totalTvl]) => ({ date, totalTvl: Math.round(totalTvl) }));

    const protocols = topCoins.slice(0, 15).map((coin) => coin.name);

    return {
      period: validPeriod,
      dataPoints,
      protocols,
    };
  }

  async fetchCoinsByIds(ids: string[]): Promise<CoinGeckoCoinMarket[]> {
    if (!ids.length) return [];
    const path =
      `/coins/markets?vs_currency=usd&ids=${ids.join(',')}&order=market_cap_desc` +
      `&per_page=100&page=1&sparkline=false` +
      `&price_change_percentage=24h,7d,30d`;
    return this.request<CoinGeckoCoinMarket[]>(path);
  }

  /**
   * Fetch all coins in a specific category (e.g., 'tokenized-stock', 'real-world-assets')
   */
  async fetchCoinsByCategory(category: string): Promise<CoinGeckoCoinMarket[]> {
    if (!category) return [];
    const path =
      `/coins/markets?vs_currency=usd&category=${category}&order=market_cap_desc` +
      `&per_page=50&page=1&sparkline=false` +
      `&price_change_percentage=24h,7d,30d`;
    return this.request<CoinGeckoCoinMarket[]>(path);
  }

  private async fetchGlobal(): Promise<CoinGeckoGlobalResponse> {
    return this.request<CoinGeckoGlobalResponse>('/global');
  }

  private async fetchTopCoins(limit: number): Promise<CoinGeckoCoinMarket[]> {
    const path =
      `/coins/markets?vs_currency=usd&order=market_cap_desc` +
      `&per_page=${limit}&page=1&sparkline=false` +
      `&price_change_percentage=24h,7d,30d`;
    return this.request<CoinGeckoCoinMarket[]>(path);
  }

  private async request<T>(path: string): Promise<T> {
    const cacheKey = `memory:${path}`;
    const redisCacheKey = this.redisCacheKey(path);
    const redisStaleKey = `${redisCacheKey}:stale`;
    const now = Date.now();

    // 1. Check in-memory cache first for very recent requests
    const cached = this.memoryCache.get(cacheKey);
    if (cached && cached.expiry > now) {
      if ((cached as any).isError) {
        throw cached.data;
      }
      return cached.data as T;
    }

    // 2. Deduplicate simultaneous requests for the same path
    const inFlight = this.inFlightRequests.get(cacheKey);
    if (inFlight) {
      return inFlight as Promise<T>;
    }

    const fetchPromise = (async () => {
      const redisCached = await this.redis.getJSON<T>(redisCacheKey);
      if (redisCached) {
        this.setMemoryCache(cacheKey, redisCached);
        return redisCached;
      }

      if (
        this.keyType !== 'pro' &&
        CoinGeckoProvider.rateLimitedUntil > Date.now()
      ) {
        const stale = await this.redis.getJSON<T>(redisStaleKey);
        if (stale) {
          this.setMemoryCache(cacheKey, stale);
          return stale;
        }
        throw new Error('CoinGecko API rate limited; retry later');
      }

      // Ensure we don't hit rate limits by throttling requests sequentially for the free tier
      if (this.keyType !== 'pro') {
        const waitFn = () =>
          new Promise<void>((resolve) => {
            const currentNow = Date.now();
            const interval = 6000; // 6 seconds between requests on free tier
            const timeSinceLast =
              currentNow - CoinGeckoProvider.lastRequestTime;
            const delay = Math.max(0, interval - timeSinceLast);

            setTimeout(() => {
              CoinGeckoProvider.lastRequestTime = Date.now();
              resolve();
            }, delay);
          });

        await (CoinGeckoProvider.requestQueue =
          CoinGeckoProvider.requestQueue.then(waitFn));
      }

      const url = `${this.baseUrl}${path}`;
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (this.keyType === 'pro') {
        headers['x-cg-pro-api-key'] = this.apiKey;
      } else if (this.keyType === 'demo') {
        headers['x-cg-demo-api-key'] = this.apiKey;
      }

      let lastError = '';
      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        const res = await fetch(url, { method: 'GET', headers });
        if (res.ok) {
          const data = (await res.json()) as T;
          this.setMemoryCache(cacheKey, data);
          await Promise.all([
            this.redis.setJSON(
              redisCacheKey,
              data,
              this.requestCacheTtlSeconds,
            ),
            this.redis.setJSON(redisStaleKey, data, this.staleCacheTtlSeconds),
          ]);
          return data;
        }

        lastError = await res.text();

        const retryable = res.status === 429 || res.status >= 500;

        if (res.status === 429) {
          const retryAfter = Number(res.headers.get('retry-after'));
          const cooldownMs =
            Number.isFinite(retryAfter) && retryAfter > 0
              ? retryAfter * 1000
              : this.rateLimitCooldownMs;
          CoinGeckoProvider.rateLimitedUntil = Date.now() + cooldownMs;

          const stale = await this.redis.getJSON<T>(redisStaleKey);
          if (stale) {
            this.logger.warn(
              `CoinGecko ${path} 429; serving stale cache for ${Math.ceil(cooldownMs / 1000)}s cooldown`,
            );
            this.setMemoryCache(cacheKey, stale);
            return stale;
          }

          // Cache the 429 state in memory briefly so same-path requests fail fast.
          this.memoryCache.set(cacheKey, {
            data: new Error(`CoinGecko Rate Limit (429) cached`),
            expiry: Date.now() + Math.min(cooldownMs, this.rateLimitCooldownMs),
            isError: true,
          } as any);
          throw new Error(`CoinGecko API rate limited: ${lastError}`);
        }

        if (!retryable || attempt === this.maxRetries) {
          this.logger.error(
            `CoinGecko ${path} failed: ${res.status} — ${lastError}`,
          );
          throw new Error(`CoinGecko API error: ${res.status} — ${lastError}`);
        }

        const retryAfter = Number(res.headers.get('retry-after'));
        const waitMs =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : Math.min(15_000, 500 * 2 ** attempt);

        this.logger.warn(
          `CoinGecko ${path} ${res.status}; retrying in ${waitMs}ms (attempt ${attempt + 1}/${this.maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      throw new Error(`CoinGecko API error: exhausted retries — ${lastError}`);
    })().finally(() => {
      this.inFlightRequests.delete(cacheKey);
    });

    this.inFlightRequests.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  private setMemoryCache<T>(cacheKey: string, data: T): void {
    this.memoryCache.set(cacheKey, {
      data,
      expiry: Date.now() + Math.min(this.requestCacheTtlSeconds, 300) * 1000,
    });
  }

  private redisCacheKey(path: string): string {
    return `coingecko:request:${createHash('sha1').update(path).digest('hex')}`;
  }

  private weightedChange(
    coins: CoinGeckoCoinMarket[],
    window: '7d' | '30d',
  ): number {
    const key =
      window === '7d'
        ? 'price_change_percentage_7d_in_currency'
        : 'price_change_percentage_30d_in_currency';
    let totalCap = 0;
    let weighted = 0;
    for (const coin of coins) {
      const cap = coin.market_cap ?? 0;
      const change = coin[key] ?? 0;
      if (cap <= 0 || !Number.isFinite(change)) continue;
      totalCap += cap;
      weighted += cap * change;
    }
    return totalCap > 0 ? weighted / totalCap : 0;
  }

  private buildDominanceBreakdown(
    dominance: Record<string, number>,
    totalMarketValue: number,
    coins: CoinGeckoCoinMarket[],
  ) {
    const symbolToName = new Map<string, string>();
    for (const coin of coins) {
      const sym = coin.symbol?.toLowerCase();
      if (sym && !symbolToName.has(sym)) {
        symbolToName.set(sym, coin.name);
      }
    }

    return Object.entries(dominance)
      .filter(([, pct]) => Number.isFinite(pct) && pct > 0)
      .map(([symbol, pct]) => {
        const percentage = this.round(pct);
        const totalValue = Math.round((totalMarketValue * pct) / 100);
        return {
          category: symbolToName.get(symbol) ?? symbol.toUpperCase(),
          totalValue,
          protocolCount: 1,
          percentageOfTotal: percentage,
        };
      })
      .sort((a, b) => b.totalValue - a.totalValue);
  }

  private round(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 100) / 100;
  }
}
