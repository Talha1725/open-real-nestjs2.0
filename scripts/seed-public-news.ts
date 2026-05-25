import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.$connect();

    const tenant = await prisma.tenant.findFirst({
      where: { slug: 'openreal' },
      select: { id: true, slug: true },
    });

    if (!tenant) {
      throw new Error("Tenant 'openreal' not found. Run base seed first.");
    }

    const now = new Date();
    const categories = [
      'NEWS',
      'EDUCATION',
      'FAQ',
      'NEWS',
      'EDUCATION',
      'FAQ',
      'NEWS',
      'EDUCATION',
      'FAQ',
      'NEWS',
      'EDUCATION',
      'FAQ',
      'NEWS',
      'EDUCATION',
      'FAQ',
      'NEWS',
      'EDUCATION',
      'FAQ',
      'NEWS',
      'FAQ',
    ] as const;

    const items = [
      {
        slug: 'tokenized-treasuries-q2-inflows',
        title: 'Tokenized Treasuries See Strong Q2 Inflows',
        body: `<p>Tokenized treasury products recorded strong inflows this quarter as investors favored short-duration yield strategies and on-chain settlement.</p>
<p>Institutional desks increased allocations to regulated products with daily liquidity and transparent reporting.</p>`,
      },
      {
        slug: 'real-estate-rwa-cross-border-demand',
        title: 'Cross-Border Demand Rises for Tokenized Real Estate',
        body: `<p>Demand for tokenized real estate continued to expand across major regions, supported by improved digital onboarding and lower ticket sizes.</p>
<p>Issuers highlighted stronger participation from professional investors in mixed-use and logistics segments.</p>`,
      },
      {
        slug: 'commodities-onchain-volume-jumps',
        title: 'On-Chain Commodity Volume Jumps on Energy Rally',
        body: `<p>Tokenized commodity instruments posted higher transfer activity as energy-related products outperformed during recent volatility.</p>
<p>Gold and diversified commodity baskets remained active among treasury management use cases.</p>`,
      },
      {
        slug: 'institutional-funds-distribution-update',
        title: 'Institutional Tokenized Funds Expand Distribution Channels',
        body: `<p>Fund managers broadened tokenized distribution by adding new custody and transfer rails, improving market reach.</p>
<p>New product launches focused on private credit and cash management mandates.</p>`,
      },
      {
        slug: 'market-infrastructure-security-upgrade',
        title: 'Market Infrastructure Upgrade Improves Settlement Reliability',
        body: `<p>Platform operators rolled out infrastructure upgrades aimed at faster reconciliation and improved reliability for public market dashboards.</p>
<p>The release includes improved audit trails and monitoring for high-volume events.</p>`,
      },
      {
        slug: 'stablecoin-liquidity-expands-on-new-rails',
        title: 'Stablecoin Liquidity Expands on New Settlement Rails',
        body: `<p>Stablecoin activity increased as new settlement rails improved transfer reliability and reduced friction for treasury teams.</p>
<p>Market participants reported faster reconciliation across major chains.</p>`,
      },
      {
        slug: 'regulatory-clarity-supports-tokenized-credit',
        title: 'Regulatory Clarity Supports Tokenized Credit Growth',
        body: `<p>Tokenized credit issuers benefited from clearer disclosure standards and stronger institutional onboarding.</p>
<p>Private lenders highlighted improved demand from structured finance buyers.</p>`,
      },
      {
        slug: 'stocks-digitization-platforms-gain-momentum',
        title: 'Digitization Platforms Gain Momentum in Stock Tokenization',
        body: `<p>Equity digitization platforms continued to gain attention as issuers explored more efficient settlement and ownership tracking.</p>
<p>Trading activity remained concentrated in smaller cap market segments.</p>`,
      },
      {
        slug: 'treasury-yields-institutional-demand',
        title: 'Institutional Demand Rises With Treasury Yield Reset',
        body: `<p>Repricing in treasury yields supported renewed demand for short-duration products among cash managers.</p>
<p>Advisors reported increased attention to yield preservation strategies.</p>`,
      },
      {
        slug: 'credit-issuers-focus-on-reporting',
        title: 'Credit Issuers Focus on Reporting and Transparency',
        body: `<p>Credit issuers improved reporting cadence and data transparency to support broader secondary market participation.</p>
<p>Investors increasingly requested more frequent updates and standardized disclosures.</p>`,
      },
      {
        slug: 'real-estate-logistics-segment-strength',
        title: 'Real Estate Logistics Segment Shows Persistent Strength',
        body: `<p>Logistics-backed tokenized real estate remained one of the strongest segments as leasing fundamentals stayed resilient.</p>
<p>Cross-border participation continued to build across structured offerings.</p>`,
      },
      {
        slug: 'commodities-gold-basket-sees-daily-activity',
        title: 'Gold Basket Products See Steady Daily Activity',
        body: `<p>Gold-linked tokenized products maintained steady daily activity as investors diversified away from more volatile exposures.</p>
<p>Commodity baskets also gained traction as portfolio hedges.</p>`,
      },
      {
        slug: 'institutional-funds-cash-management-flows',
        title: 'Cash Management Flows Lift Institutional Fund Activity',
        body: `<p>Cash management strategies attracted additional flows as investors prioritized liquidity and capital preservation.</p>
<p>Portfolio managers reported improving demand for tokenized fund units.</p>`,
      },
      {
        slug: 'market-infrastructure-monitoring-upgrade',
        title: 'Monitoring Upgrade Improves Market Infrastructure Visibility',
        body: `<p>New monitoring tools gave operators better visibility into settlement queues and market health metrics.</p>
<p>The upgrade is expected to reduce operational blind spots across public market dashboards.</p>`,
      },
      {
        slug: 'stablecoin-settlement-activity-rises',
        title: 'Stablecoin Settlement Activity Rises Across Major Chains',
        body: `<p>Settlement activity continued to rise as stablecoin rails became a preferred path for fast transfer and treasury operations.</p>
<p>Multi-chain reporting showed higher daily turnover.</p>`,
      },
      {
        slug: 'regulatory-updates-shape-disclosure-standards',
        title: 'Regulatory Updates Shape New Disclosure Standards',
        body: `<p>Updated disclosure expectations are reshaping how tokenized market issuers present product information.</p>
<p>Compliance teams are adapting documentation workflows accordingly.</p>`,
      },
      {
        slug: 'stocks-investor-interest-concentrated',
        title: 'Investor Interest in Tokenized Stocks Remains Concentrated',
        body: `<p>Investor attention in tokenized stocks remained concentrated in a few high-liquidity listings and infrastructure providers.</p>
<p>Participants continue to watch for broader distribution channels.</p>`,
      },
      {
        slug: 'treasury-short-duration-strategies-expand',
        title: 'Short-Duration Strategies Expand in Treasury Markets',
        body: `<p>Short-duration treasury strategies continued to attract allocations from liquidity-sensitive desks.</p>
<p>Portfolio managers are using them as a defensive cash alternative.</p>`,
      },
      {
        slug: 'credit-secondary-market-activity-climbs',
        title: 'Secondary Market Activity Climbs in Credit Products',
        body: `<p>Secondary market activity in tokenized credit products climbed as more buyers and sellers entered the market.</p>
<p>Market makers reported narrower spreads in select products.</p>`,
      },
      {
        slug: 'real-estate-new-project-launches',
        title: 'New Real Estate Projects Add Supply to Market',
        body: `<p>New real estate launches expanded the available supply of tokenized properties across several jurisdictions.</p>
<p>Deal pipelines remain active in residential and mixed-use sectors.</p>`,
      },
    ];

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i]!;
      const category = categories[i] ?? 'NEWS';
      const publishedAt = new Date(now.getTime() - i * 60 * 60 * 1000);
      await prisma.contentArticle.upsert({
        where: {
          tenantId_slug: {
            tenantId: tenant.id,
            slug: item.slug,
          },
        },
        update: {
          title: item.title,
          body: item.body,
          category,
          published: true,
          publishedAt,
        },
        create: {
          tenantId: tenant.id,
          slug: item.slug,
          title: item.title,
          body: item.body,
          category,
          published: true,
          publishedAt,
        },
      });
    }

    const count = await prisma.contentArticle.count({
      where: { tenantId: tenant.id, published: true },
    });

    console.log(`Seeded/updated public news articles. Total published articles for '${tenant.slug}': ${count}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Failed to seed public news:', error);
  process.exit(1);
});
