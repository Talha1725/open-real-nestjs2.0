export type PublicMarketScreenerRecord = {
  id: string;
  title: string;
  summary: string;
  assetClass: string;
  assetClassLabel: string;
  region: string;
  regionLabel: string;
  currency: string;
  minimumAmount: number | null;
  maximumAmount: number | null;
  status: string;
  approvedAt: string | null;
  createdAt: string;
  yieldApyPct?: number;
  holders?: number;
  change7dPct?: number;
  change7dApyPct?: number;
  displayType?: string;
  drawerStatus?: string;
  drawerAbout?: string;
  drawerIssuerManager?: string;
  drawerJurisdiction?: string;
  drawerMinInvestment?: string;
  drawerMaturity?: string;
  drawerCreditRating?: string;
  drawerLastUpdated?: string;
  drawerTags?: string[];
  drawerPriceTrend?: number[];
};

export type PublicMarketScreenerFilters = {
  assetClasses: Array<{ key: string; label: string; count: number }>;
  regions: Array<{ key: string; label: string; count: number }>;
};

export type PublicMarketScreenerResponse = {
  data: PublicMarketScreenerRecord[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  filters: PublicMarketScreenerFilters;
  liveMarket?: {
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
    source: {
      provider: string;
      url: string;
      cached: boolean;
      cachedAt: string | null;
      error?: string;
    };
    historical?: {
      period: string;
      dataPoints: { date: string; totalTvl: number }[];
      protocols: string[];
      source: {
        provider: string;
        cached: boolean;
        cachedAt: string | null;
        error?: string;
      };
    };
    rwaIntel?: {
      section: string;
      analytics?: {
        queryId: string;
        executionId: string | null;
        rowCount: number;
        columns: string[];
        rows: Record<string, unknown>[];
        source: {
          provider: string;
          url: string;
          cached: boolean;
          cachedAt: string | null;
          error?: string;
        };
      };
      tokenActivity?: {
        contractAddress: string;
        network: string;
        asset: string | null;
        transferCount30d: number;
        uniqueWallets30d: number;
        lastTransferAt: string | null;
        source: {
          provider: string;
          url: string;
          cached: boolean;
          cachedAt: string | null;
          error?: string;
        };
      };
    };
  };
};
