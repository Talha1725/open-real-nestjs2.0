export const MARKET_PARENT_SECTION = 'Market Overview';

export const PUBLIC_MARKET_NAVIGATION = [
  { label: 'News', path: '/public/market/news' },
  { label: 'Asset Screener', path: '/public/market/asset-screener' },
  { label: 'Asset Classes', path: '/public/market/asset-classes' },
  { label: 'Stablecoins', path: '/public/market/stablecoins' },
  { label: 'U.S. Treasuries', path: '/public/market/treasuries' },
  {
    label: 'Non-U.S. Government Debt',
    path: '/public/market/non-us-government-debt',
  },
  { label: 'Credit', path: '/public/market/credit' },
  { label: 'Commodities', path: '/public/market/commodities' },
  {
    label: 'Institutional Funds',
    path: '/public/market/institutional-funds',
  },
  { label: 'Stocks', path: '/public/market/stocks' },
  { label: 'Real Estate', path: '/public/market/real-estate' },
] as const;

export const PUBLIC_MARKET_PAGES = [
  {
    key: 'market-overview',
    label: 'Market Overview',
    path: '/public/market-overview',
    kind: 'landing',
    template: 'market-landing',
    description:
      'Live market portal with KPI strip, dense charting, rankings, and discoverable blocks.',
    capabilities: ['kpis', 'charts', 'rankings', 'discovery'],
  },
  {
    key: 'news',
    label: 'News',
    path: '/public/market/news',
    kind: 'feed',
    template: 'news-list',
    description:
      'Scannable market-news feed with timestamps, summaries, and live context.',
    capabilities: ['timestamps', 'summaries', 'scannable-list'],
  },
  {
    key: 'asset-screener',
    label: 'Asset Screener',
    path: '/public/market/asset-screener',
    kind: 'tool',
    template: 'data-table',
    description:
      'Searchable public screener with filters, table exploration, and category discovery.',
    capabilities: ['search', 'filters', 'table', 'category-discovery'],
  },
  {
    key: 'asset-classes',
    label: 'Asset Classes',
    path: '/public/market/asset-classes',
    kind: 'template',
    template: 'category-template',
    description:
      'Reusable category template for market discovery, ranking tables, and related news.',
    capabilities: ['category-header', 'kpis', 'trend', 'ranking', 'news'],
  },
] as const;

export const PUBLIC_MARKET_CATEGORY_PAGES = [
  {
    key: 'stablecoins',
    label: 'Stablecoins',
    path: '/public/market/stablecoins',
    template: 'category-template',
    routeAlias: '/public/market/category/stablecoins',
  },
  {
    key: 'treasuries',
    label: 'U.S. Treasuries',
    path: '/public/market/treasuries',
    template: 'category-template',
    routeAlias: '/public/market/category/treasuries',
  },
  {
    key: 'non-us-government-debt',
    label: 'Non-U.S. Government Debt',
    path: '/public/market/non-us-government-debt',
    template: 'category-template',
    routeAlias: '/public/market/category/non-us-government-debt',
  },
  {
    key: 'credit',
    label: 'Credit',
    path: '/public/market/credit',
    template: 'category-template',
    routeAlias: '/public/market/category/credit',
  },
  {
    key: 'commodities',
    label: 'Commodities',
    path: '/public/market/commodities',
    template: 'category-template',
    routeAlias: '/public/market/category/commodities',
  },
  {
    key: 'institutional-funds',
    label: 'Institutional Funds',
    path: '/public/market/institutional-funds',
    template: 'category-template',
    routeAlias: '/public/market/category/institutional-funds',
  },
  {
    key: 'stocks',
    label: 'Stocks',
    path: '/public/market/stocks',
    template: 'category-template',
    routeAlias: '/public/market/category/stocks',
  },
  {
    key: 'real-estate',
    label: 'Real Estate',
    path: '/public/market/real-estate',
    template: 'category-template',
    routeAlias: '/public/market/category/real-estate',
  },
] as const;

export type PublicMarketCategoryKey =
  (typeof PUBLIC_MARKET_CATEGORY_PAGES)[number]['key'];

export const PUBLIC_MARKET_PAGE_TEMPLATES = [
  {
    name: 'Market landing',
    blocks: [
      'top KPI strip',
      'dense chart section',
      'rankings / league tables',
      'discoverable market blocks',
    ],
  },
  {
    name: 'News feed',
    blocks: ['list layout', 'timestamps', 'summaries', 'scannable structure'],
  },
  {
    name: 'Asset screener',
    blocks: [
      'search',
      'filters',
      'table-style exploration',
      'category discovery',
    ],
  },
  {
    name: 'Asset class page',
    blocks: [
      'category header',
      'KPI row',
      'chart / trend section',
      'ranking table',
      'related news / activity block',
    ],
  },
] as const;

export const PUBLIC_MARKET_PUBLIC_SAFE_RULES = [
  'aggregated market information only',
  'research / category exploration only',
  'no investment execution',
  'no private investor actions',
  'no gated transaction behavior in visitor mode',
] as const;

export const PUBLIC_MARKET_ROUTE_GROUPS = [
  {
    label: 'Core pages',
    pages: PUBLIC_MARKET_PAGES,
  },
  {
    label: 'Category pages',
    pages: PUBLIC_MARKET_CATEGORY_PAGES,
  },
] as const;

export const PUBLIC_MARKET_PORTAL_MANIFEST = {
  parentSection: MARKET_PARENT_SECTION,
  routeGroups: PUBLIC_MARKET_ROUTE_GROUPS,
  navigation: PUBLIC_MARKET_NAVIGATION,
  pageTemplates: PUBLIC_MARKET_PAGE_TEMPLATES,
  publicSafeRules: PUBLIC_MARKET_PUBLIC_SAFE_RULES,
} as const;

export const PUBLIC_MARKET_CATEGORY_KEYS = new Set(
  PUBLIC_MARKET_CATEGORY_PAGES.map((page) => page.key),
);

export function isPublicMarketCategoryKey(
  section: string,
): section is PublicMarketCategoryKey {
  return PUBLIC_MARKET_CATEGORY_KEYS.has(section as PublicMarketCategoryKey);
}

export const PUBLIC_MARKET_SECTION_DESCRIPTIONS: Record<string, string> = {
  news: 'Scannable market news with timestamps, summaries, and live context.',
  'asset-screener':
    'Searchable public screener with filters and table-style exploration.',
  'asset-classes':
    'Reusable templates for category-level discovery across market segments.',
  stablecoins:
    'Public-safe portal view for stablecoin market intelligence and discovery.',
  treasuries:
    'U.S. Treasury market intelligence with live market context and rankings.',
  'non-us-government-debt':
    'Government-debt discovery view for non-U.S. sovereign market exposure.',
  credit:
    'Public credit discovery with reusable ranking, trend, and news blocks.',
  commodities:
    'Commodity discovery view with public market intelligence blocks.',
  'institutional-funds':
    'Institutional fund discovery with public-safe market navigation.',
  stocks:
    'Public equity market discovery with scannable market intelligence blocks.',
  'real-estate':
    'Real estate discovery view with category, chart, and ranking templates.',
};

export const PUBLIC_MARKET_ASSET_CLASS_MAP: Record<string, string | undefined> =
  {
    credit: 'PRIVATE_CREDIT',
    'real-estate': 'REAL_ESTATE',
    commodities: 'COMMODITIES',
    'institutional-funds': 'PRIVATE_EQUITY',
  };
