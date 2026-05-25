import { CoinGeckoProvider } from '../market-data/providers/coingecko.provider.js';

describe('CoinGeckoProvider rate limits', () => {
  const makeProvider = (redis: any) => {
    const config = {
      get: vi.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          COINGECKO_API_KEY: 'test-key',
          COINGECKO_API_KEY_TYPE: 'pro',
          COINGECKO_API_BASE_URL: 'https://pro-api.coingecko.com/api/v3',
          COINGECKO_MAX_RETRIES: 3,
          COINGECKO_REQUEST_CACHE_TTL_SECONDS: 900,
          COINGECKO_STALE_CACHE_TTL_SECONDS: 86_400,
          COINGECKO_RATE_LIMIT_COOLDOWN_SECONDS: 60,
        };
        return key in values ? values[key] : fallback;
      }),
    } as any;

    return new CoinGeckoProvider(config, redis);
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('serves stale Redis data immediately when CoinGecko returns 429', async () => {
    const staleCoins = [
      {
        id: 'ethereum',
        symbol: 'eth',
        name: 'Ethereum',
        image: '',
        market_cap: 100,
        current_price: 1,
      },
    ];
    const redis = {
      getJSON: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(staleCoins),
      setJSON: vi.fn(),
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: vi.fn().mockReturnValue('60') },
      text: vi.fn().mockResolvedValue('rate limit'),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await makeProvider(redis).fetchCoinsByIds(['ethereum']);

    expect(result).toBe(staleCoins);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails fast on 429 when no stale data exists', async () => {
    const redis = {
      getJSON: vi.fn().mockResolvedValue(null),
      setJSON: vi.fn(),
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: vi.fn().mockReturnValue('60') },
      text: vi.fn().mockResolvedValue('rate limit'),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      makeProvider(redis).fetchCoinsByIds(['ethereum']),
    ).rejects.toThrow('CoinGecko API rate limited');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
