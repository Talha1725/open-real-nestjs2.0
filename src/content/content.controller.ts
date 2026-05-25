import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { ContentService } from './content.service.js';
import { QueryListingsDto } from '../listings/dto/query-listings.dto.js';
import { PublicMarketService } from './public-market.service.js';
import { PublicNewsService } from './public-news.service.js';
import {
  MARKET_PARENT_SECTION,
  PUBLIC_MARKET_NAVIGATION,
  PUBLIC_MARKET_PORTAL_MANIFEST,
  PUBLIC_MARKET_SECTION_DESCRIPTIONS,
  isPublicMarketCategoryKey,
} from './public-market-portal.js';

@ApiTags('Content (Public)')
@Public()
@Controller('public')
export class ContentController {
  constructor(
    private readonly contentService: ContentService,
    private readonly publicMarketService: PublicMarketService,
    private readonly publicNewsService: PublicNewsService,
  ) {}

  @Get('market-overview')
  @ApiOperation({ summary: 'Aggregated market data (tenant-scoped, public)' })
  @ApiResponse({
    status: 200,
    description: 'Market overview with KPIs, distributions, and navigation',
  })
  async getMarketOverview() {
    const overview = await this.publicMarketService.getPublicMarketOverview();
    return {
      ...overview,
      pageType: 'market-landing',
      portal: {
        ...PUBLIC_MARKET_PORTAL_MANIFEST,
        hierarchy: {
          parent: MARKET_PARENT_SECTION,
          corePages: PUBLIC_MARKET_PORTAL_MANIFEST.routeGroups[0].pages,
          categoryPages: PUBLIC_MARKET_PORTAL_MANIFEST.routeGroups[1].pages,
        },
        routeAliases: [
          '/public/market',
          '/public/market/overview',
          '/public/market-overview',
        ],
        layoutHints: [
          'top KPI strip',
          'dense chart section',
          'rankings / league tables',
          'discoverable market blocks',
        ],
      },
    };
  }

  @Get('market')
  @ApiOperation({ summary: 'Market Overview landing page alias' })
  @ApiResponse({
    status: 200,
    description: 'Market overview with KPIs, distributions, and navigation',
  })
  async getMarketLanding() {
    return this.getMarketOverview();
  }

  @Get('market/overview')
  @ApiOperation({ summary: 'Market Overview landing page alias' })
  @ApiResponse({
    status: 200,
    description: 'Market overview with KPIs, distributions, and navigation',
  })
  async getMarketOverviewAlias() {
    return this.getMarketOverview();
  }

  @Get('market-overview/historical')
  @ApiOperation({ summary: 'Historical RWA TVL data for charts' })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['month', 'quarter', 'year'],
    description: 'Time period (default: month)',
  })
  @ApiResponse({
    status: 200,
    description: 'Historical TVL data points for charting',
  })
  getHistoricalTvl(@Query('period') period: string = 'month') {
    return this.publicMarketService.getHistoricalTvl(period);
  }

  @Get('education')
  @ApiOperation({ summary: 'List published education articles' })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: ['EDUCATION', 'NEWS', 'FAQ'],
  })
  @ApiResponse({ status: 200, description: 'List of published articles' })
  listPublished(@Query('category') category?: string) {
    return this.publicNewsService.listPublished(category);
  }

  @Get('education/:slug')
  @ApiOperation({ summary: 'Get a published article by slug' })
  @ApiResponse({ status: 200, description: 'Article detail' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  getBySlug(@Param('slug') slug: string) {
    return this.publicNewsService.getPublishedBySlug(slug);
  }

  @Get('legal/:slug')
  @ApiOperation({ summary: 'Get legal page (terms, privacy, notices)' })
  @ApiResponse({ status: 200, description: 'Legal page content' })
  @ApiResponse({ status: 404, description: 'Legal page not found' })
  getLegalPage(@Param('slug') slug: string) {
    return this.contentService.getLegalPage(slug);
  }

  @Get('market/news')
  @ApiOperation({ summary: 'Public market news feed' })
  @ApiResponse({ status: 200, description: 'Scannable market news list' })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: ['NEWS', 'EDUCATION', 'FAQ'],
  })
  getMarketNews(
    @Query('limit') limit?: string,
    @Query('category') category?: string,
  ) {
    return this.getMarketNewsWithLiveMarket(limit, category);
  }

  private async getMarketNewsWithLiveMarket(
    limit?: string,
    category?: string,
  ) {
    const parsedLimit = Number.parseInt(limit ?? '', 10);
    const safeLimit =
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20;
    const allowedCategories = new Set(['NEWS', 'EDUCATION', 'FAQ']);
    const safeCategory = allowedCategories.has(category ?? '')
      ? (category as 'NEWS' | 'EDUCATION' | 'FAQ')
      : undefined;
    const [feed, overview] = await Promise.all([
      this.publicNewsService.getPublicNewsFeed(safeLimit, safeCategory),
      this.publicMarketService.getPublicMarketOverview(),
    ]);
    const liveMarket = this.buildLiveMarketContext(overview, undefined, true);
    return feed.map((item) => ({ ...item, liveMarket }));
  }

  @Get('market/portal')
  @ApiOperation({ summary: 'Public market portal manifest' })
  @ApiResponse({
    status: 200,
    description: 'Structured market portal navigation and page manifest',
  })
  async getMarketPortal() {
    const overview = await this.publicMarketService.getPublicMarketOverview();
    return {
      ...PUBLIC_MARKET_PORTAL_MANIFEST,
      hierarchy: {
        parent: MARKET_PARENT_SECTION,
        corePages: PUBLIC_MARKET_PORTAL_MANIFEST.routeGroups[0].pages,
        categoryPages: PUBLIC_MARKET_PORTAL_MANIFEST.routeGroups[1].pages,
      },
      routeAliases: PUBLIC_MARKET_PORTAL_MANIFEST.routeGroups[1].pages.map(
        (page) => ({
          path: page.path,
          alias: page.routeAlias,
        }),
      ),
      liveMarket: this.buildLiveMarketContext(overview),
    };
  }

  @Get('market/asset-screener')
  @ApiOperation({ summary: 'Public asset screener' })
  @ApiResponse({ status: 200, description: 'Search and filter public assets' })
  async getAssetScreener(@Query() query: QueryListingsDto) {
    const [screener, overview] = await Promise.all([
      this.publicMarketService.getPublicAssetScreener(query),
      this.publicMarketService.getPublicMarketOverview(query.assetClass),
    ]);
    return {
      ...screener,
      liveMarket: this.buildLiveMarketContext(overview),
    };
  }

  @Get('market/asset-classes')
  @ApiOperation({ summary: 'Public asset class overview' })
  @ApiResponse({
    status: 200,
    description: 'Reusable market blocks for category discovery',
  })
  async getAssetClasses() {
    const [overview, classes, relatedNews, featured] = await Promise.all([
      this.publicMarketService.getPublicMarketOverview(),
      this.publicMarketService.getPublicAssetClassOverview(),
      this.publicNewsService.getPublicNewsFeed(3),
      this.publicMarketService.getPublicAssetScreener({ page: 1, limit: 8 }),
    ]);

    return this.buildTemplatePage({
      section: 'asset-classes',
      title: 'Asset Classes',
      description: PUBLIC_MARKET_SECTION_DESCRIPTIONS['asset-classes'],
      overview,
      rankingTable: classes,
      relatedBlocks: featured.data,
      relatedNews,
      routeAlias: '/public/market/asset-classes',
    });
  }

  @Get('market/stablecoins')
  @ApiOperation({ summary: 'Stablecoins market page' })
  @ApiResponse({ status: 200, description: 'Public-safe market template' })
  getStablecoins() {
    return this.buildCategoryPage('stablecoins');
  }

  @Get('market/treasuries')
  @ApiOperation({ summary: 'U.S. Treasuries market page' })
  @ApiResponse({ status: 200, description: 'Public-safe market template' })
  getTreasuries() {
    return this.buildCategoryPage('treasuries');
  }

  @Get('market/us-treasuries')
  @ApiOperation({ summary: 'U.S. Treasuries market page (alias)' })
  @ApiResponse({ status: 200, description: 'Public-safe market template' })
  getUsTreasuries() {
    return this.buildCategoryPage('treasuries');
  }

  @Get('market/non-us-government-debt')
  @ApiOperation({ summary: 'Non-U.S. Government Debt market page' })
  @ApiResponse({ status: 200, description: 'Public-safe market template' })
  getNonUsGovtDebt() {
    return this.buildCategoryPage('non-us-government-debt');
  }

  @Get('market/credit')
  @ApiOperation({ summary: 'Credit market page' })
  @ApiResponse({ status: 200, description: 'Public-safe market template' })
  getCredit() {
    return this.buildCategoryPage('credit');
  }

  @Get('market/private-credit')
  @ApiOperation({ summary: 'Credit market page alias' })
  @ApiResponse({ status: 200, description: 'Public-safe market template' })
  getPrivateCreditAlias() {
    return this.buildCategoryPage('credit');
  }

  @Get('market/commodities')
  @ApiOperation({ summary: 'Commodities market page' })
  @ApiResponse({ status: 200, description: 'Public-safe market template' })
  getCommodities() {
    return this.buildCategoryPage('commodities');
  }

  @Get('market/institutional-funds')
  @ApiOperation({ summary: 'Institutional funds market page' })
  @ApiResponse({ status: 200, description: 'Public-safe market template' })
  getInstitutionalFunds() {
    return this.buildCategoryPage('institutional-funds');
  }

  @Get('market/stocks')
  @ApiOperation({ summary: 'Stocks market page' })
  @ApiResponse({ status: 200, description: 'Public-safe market template' })
  getStocks() {
    return this.buildCategoryPage('stocks');
  }

  @Get('market/real-estate')
  @ApiOperation({ summary: 'Real estate market page' })
  @ApiResponse({ status: 200, description: 'Public-safe market template' })
  getRealEstate() {
    return this.buildCategoryPage('real-estate');
  }

  @Get('market/category/:section')
  @ApiOperation({ summary: 'Generic public market category page' })
  @ApiResponse({ status: 200, description: 'Reusable category-level template' })
  getCategoryPage(@Param('section') section: string) {
    return this.buildCategoryPage(section);
  }

  private async buildCategoryPage(section: string) {
    if (!isPublicMarketCategoryKey(section)) {
      throw new NotFoundException(
        `Public market category "${section}" not found`,
      );
    }

    const overview = await this.publicMarketService.getPublicMarketOverview(section);
    const relatedNews = await this.publicNewsService.getPublicNewsFeed(3);
    const historical =
      await this.publicMarketService.getHistoricalTvl('quarter', section);
    const screener = await this.publicMarketService.getScreenerSliceForCategory(
      section,
      5,
    );
    const rwaIntel = await this.publicMarketService.getRwaIntel(section);

    return this.buildTemplatePage({
      section,
      title: this.titleForSection(section),
      description:
        PUBLIC_MARKET_SECTION_DESCRIPTIONS[section] ??
        'Reusable public market template for category-level exploration.',
      overview,
      chart: historical,
      rankingTable: screener.data.slice(0, 5),
      relatedNews,
      relatedBlocks: overview.marketData.assetClassBreakdown.slice(0, 4),
      routeAlias: `/public/market/category/${section}`,
      rwaIntel,
    });
  }

  private buildTemplatePage(options: {
    section: string;
    title: string;
    description: string;
    overview: Awaited<
      ReturnType<PublicMarketService['getPublicMarketOverview']>
    >;
    chart?: Awaited<ReturnType<PublicMarketService['getHistoricalTvl']>>;
    rwaIntel?: Awaited<ReturnType<PublicMarketService['getRwaIntel']>>;
    rankingTable?: unknown[];
    relatedBlocks?: unknown[];
    relatedNews?: unknown[];
    routeAlias?: string;
  }) {
    return {
      section: options.section,
      title: options.title,
      description: options.description,
      publicSafe: true,
      pageType: 'market-category',
      navigation: PUBLIC_MARKET_NAVIGATION,
      routeAlias: options.routeAlias,
      categoryHeader: {
        title: options.title,
        description: options.description,
      },
      pageTemplate: 'category-template',
      publicSafeRules: PUBLIC_MARKET_PORTAL_MANIFEST.publicSafeRules,
      kpiRow: options.overview.marketData.summary,
      chartSection: options.chart
        ? {
            period: options.chart.period,
            dataPoints: options.chart.dataPoints,
            protocols: options.chart.protocols,
          }
        : null,
      rankingTable: options.rankingTable ?? [],
      discoverableBlocks:
        options.relatedBlocks ??
        options.overview.marketData.assetClassBreakdown,
      relatedNews: options.relatedNews ?? [],
      relatedActivity: options.overview.platform.recentActivity,
      source: options.overview.marketData.source,
      liveMarket: this.buildLiveMarketContext(
        options.overview,
        options.chart,
        false,
        options.rwaIntel,
      ),
    };
  }

  private buildLiveMarketContext(
    overview: Awaited<ReturnType<PublicMarketService['getPublicMarketOverview']>>,
    historical?: Awaited<ReturnType<PublicMarketService['getHistoricalTvl']>>,
    compact = false,
    rwaIntel?: Awaited<ReturnType<PublicMarketService['getRwaIntel']>>,
  ) {
    return {
      summary: overview.marketData.summary,
      assetClassBreakdown: compact
        ? overview.marketData.assetClassBreakdown.slice(0, 6)
        : overview.marketData.assetClassBreakdown,
      topProtocols: compact
        ? overview.marketData.topProtocols.slice(0, 5)
        : overview.marketData.topProtocols,
      chainBreakdown: compact
        ? overview.marketData.chainBreakdown.slice(0, 6)
        : overview.marketData.chainBreakdown,
      source: overview.marketData.source,
      ...(historical
        ? {
            historical: {
              period: historical.period,
              dataPoints: historical.dataPoints,
              protocols: historical.protocols,
              source: historical.source,
            },
          }
        : {}),
      ...(rwaIntel ? { rwaIntel } : {}),
    };
  }

  private titleForSection(section: string) {
    switch (section) {
      case 'stablecoins':
        return 'Stablecoins';
      case 'treasuries':
        return 'U.S. Treasuries';
      case 'non-us-government-debt':
        return 'Non-U.S. Government Debt';
      case 'credit':
        return 'Credit';
      case 'commodities':
        return 'Commodities';
      case 'institutional-funds':
        return 'Institutional Funds';
      case 'stocks':
        return 'Stocks';
      case 'real-estate':
        return 'Real Estate';
      default:
        return 'Market';
    }
  }
}
