export const PUBLIC_MARKET_TIME_PERIODS = ['month', 'quarter', 'year'] as const;
export type PublicMarketTimePeriod =
  (typeof PUBLIC_MARKET_TIME_PERIODS)[number];

export const PUBLIC_MARKET_RANKING_DIMENSIONS = [
  'totalValue',
  'protocolCount',
  'change24h',
  'change7d',
] as const;
export type PublicMarketRankingDimension =
  (typeof PUBLIC_MARKET_RANKING_DIMENSIONS)[number];

export const PUBLIC_MARKET_ASSET_CLASSES = [
  { slug: 'stablecoins', label: 'Stablecoins', dbAssetClass: undefined },
  { slug: 'treasuries', label: 'U.S. Treasuries', dbAssetClass: undefined },
  {
    slug: 'non-us-government-debt',
    label: 'Non-U.S. Government Debt',
    dbAssetClass: 'INFRASTRUCTURE',
  },
  { slug: 'credit', label: 'Credit', dbAssetClass: 'PRIVATE_CREDIT' },
  { slug: 'commodities', label: 'Commodities', dbAssetClass: 'COMMODITIES' },
  {
    slug: 'institutional-funds',
    label: 'Institutional Funds',
    dbAssetClass: 'PRIVATE_EQUITY',
  },
  { slug: 'stocks', label: 'Stocks', dbAssetClass: 'ART_AND_COLLECTIBLES' },
  { slug: 'real-estate', label: 'Real Estate', dbAssetClass: 'REAL_ESTATE' },
] as const;

export type PublicMarketAssetClassSlug =
  (typeof PUBLIC_MARKET_ASSET_CLASSES)[number]['slug'];

export const PUBLIC_MARKET_REGION_LABELS: Record<string, string> = {
  NORTH_AMERICA: 'North America',
  EUROPE: 'Europe',
  ASIA_PACIFIC: 'Asia Pacific',
  MIDDLE_EAST: 'Middle East',
  AFRICA: 'Africa',
  LATIN_AMERICA: 'Latin America',
  GLOBAL: 'Global',
};

export const PUBLIC_MARKET_TAGS = [
  'market-overview',
  'asset-screener',
  'asset-class',
  'trend',
  'ranking',
] as const;
export type PublicMarketTag = (typeof PUBLIC_MARKET_TAGS)[number];

export function mapDbAssetClassToPublicLabel(assetClass: string) {
  switch (assetClass) {
    case 'REAL_ESTATE':
      return 'Real Estate';
    case 'INFRASTRUCTURE':
      return 'Infrastructure';
    case 'PRIVATE_EQUITY':
      return 'Institutional Funds';
    case 'PRIVATE_CREDIT':
      return 'Credit';
    case 'COMMODITIES':
      return 'Commodities';
    case 'ART_AND_COLLECTIBLES':
      return 'Art & Collectibles';
    default:
      return 'Other';
  }
}

export function mapDbRegionToPublicLabel(region: string) {
  return PUBLIC_MARKET_REGION_LABELS[region] ?? region.replace(/_/g, ' ');
}

export function mapCategorySlugToDbAssetClass(
  slug: string,
): string | undefined {
  return PUBLIC_MARKET_ASSET_CLASSES.find((item) => item.slug === slug)
    ?.dbAssetClass;
}
