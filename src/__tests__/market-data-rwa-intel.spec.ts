import { MarketDataService } from '../market-data/market-data.service.js';

describe('MarketDataService RWA intel', () => {
  it('returns cached Dune analytics and Alchemy token activity for a supported section', async () => {
    const redis = {
      getJSON: vi.fn().mockResolvedValue(null),
      setJSON: vi.fn().mockResolvedValue(undefined),
    } as any;

    const config = {
      get: vi.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          COINGECKO_CACHE_TTL_SECONDS: 600,
          COINGECKO_ERROR_CACHE_TTL_SECONDS: 60,
          RWA_INTEL_CACHE_TTL_SECONDS: 900,
          DUNE_TREASURIES_QUERY_ID: '12345',
          ALCHEMY_TREASURIES_TOKEN_ADDRESS: '0xabc',
          ALCHEMY_NETWORK: 'eth-mainnet',
        };
        return key in values ? values[key] : fallback;
      }),
    } as any;

    const coinGecko = {
      publicUrl: vi.fn().mockReturnValue('https://api.coingecko.com/api/v3'),
    } as any;

    const coinMarketCap = {} as any;

    const dune = {
      isConfigured: vi.fn().mockReturnValue(true),
      publicUrl: vi.fn().mockReturnValue('https://api.dune.com/api/v1'),
      getLatestQueryResult: vi.fn().mockResolvedValue({
        queryId: '12345',
        executionId: 'exec-1',
        rowCount: 1,
        columns: ['metric', 'value'],
        rows: [{ metric: 'aum', value: 100 }],
        lastUpdated: '2026-04-30T06:00:00.000Z',
      }),
    } as any;

    const alchemy = {
      isConfigured: vi.fn().mockReturnValue(true),
      publicUrl: vi
        .fn()
        .mockReturnValue('https://eth-mainnet.g.alchemy.com/v2'),
      getTokenActivity: vi.fn().mockResolvedValue({
        contractAddress: '0xabc',
        network: 'eth-mainnet',
        asset: 'USTB',
        transferCount30d: 12,
        uniqueWallets30d: 8,
        lastTransferAt: '2026-04-29T06:00:00.000Z',
      }),
    } as any;

    const service = new MarketDataService(
      redis,
      config,
      coinGecko,
      coinMarketCap,
      dune,
      alchemy,
    );

    const result = await service.getRwaIntel('treasuries');

    expect(result).toMatchObject({
      section: 'treasuries',
      analytics: {
        queryId: '12345',
        rowCount: 1,
      },
      tokenActivity: {
        contractAddress: '0xabc',
        asset: 'USTB',
        transferCount30d: 12,
      },
    });
    expect(redis.setJSON).toHaveBeenCalledWith(
      'market:rwa:intel:treasuries:v2',
      expect.any(Object),
      900,
    );
  });

  it('returns null for unsupported sections', async () => {
    const service = new MarketDataService(
      { getJSON: vi.fn(), setJSON: vi.fn() } as any,
      { get: vi.fn() } as any,
      { publicUrl: vi.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.getRwaIntel('real-estate')).resolves.toBeNull();
  });
});
