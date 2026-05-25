import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketDataService } from '../market-data/market-data.service.js';

describe('MarketDataService fallback', () => {
  let redis: any;
  let config: any;
  let coinGecko: any;
  let coinMarketCap: any;
  let service: MarketDataService;

  beforeEach(() => {
    redis = {
      getJSON: vi.fn().mockResolvedValue(null),
      setJSON: vi.fn().mockResolvedValue(undefined),
    };
    config = {
      get: vi.fn((key: string, defaultValue?: any) => defaultValue),
    };
    coinGecko = {
      getMarketOverview: vi.fn(),
      getHistoricalTvl: vi.fn(),
      fetchCoinsByCategory: vi.fn(),
      fetchCoinsByIds: vi.fn(),
      publicUrl: vi.fn().mockReturnValue('https://api.coingecko.com/api/v3'),
    };
    coinMarketCap = {
      isConfigured: vi.fn().mockReturnValue(true),
      getMarketOverview: vi.fn(),
      publicUrl: vi.fn().mockReturnValue('https://pro-api.coinmarketcap.com'),
    };
    service = new MarketDataService(redis, config, coinGecko, coinMarketCap);
  });

  it('falls back to CoinMarketCap when CoinGecko market overview fails', async () => {
    coinGecko.getMarketOverview.mockRejectedValue(new Error('429'));
    coinMarketCap.getMarketOverview.mockResolvedValue({
      summary: {
        totalMarketValue: 100,
        totalProtocols: 2,
        change24h: 1,
        change7d: 2,
        change30d: 3,
        lastUpdated: '2026-04-30T00:00:00.000Z',
      },
      assetClassBreakdown: [],
      topProtocols: [],
      chainBreakdown: [],
    });

    const result = await service.getMarketOverview();

    expect(result.source.provider).toBe('CoinMarketCap');
    expect(result.source.error).toContain('Primary provider failed: 429');
    expect(coinMarketCap.getMarketOverview).toHaveBeenCalled();
  });

  it('caches empty market discovery briefly when CoinGecko is rate limited', async () => {
    redis.getJSON.mockResolvedValueOnce(null).mockResolvedValueOnce([]);
    coinGecko.fetchCoinsByCategory.mockRejectedValue(new Error('429'));

    await expect(
      service.getMarketDiscoveryForSection('stocks'),
    ).resolves.toEqual([]);
    await expect(
      service.getMarketDiscoveryForSection('stocks'),
    ).resolves.toEqual([]);

    expect(coinGecko.fetchCoinsByCategory).toHaveBeenCalledTimes(1);
    expect(redis.setJSON).toHaveBeenCalledWith(
      'market:discovery:stocks:v2',
      [],
      60,
    );
  });
});
