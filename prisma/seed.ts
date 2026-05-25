import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcrypt';

const BCRYPT_SALT_ROUNDS = 10;

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.$connect();

    // ═══════════════════════════════════════════════════════════════════════
    // TENANT 1 — OpenReal (primary brand, enterprise tier)
    // ═══════════════════════════════════════════════════════════════════════

    const tenant1 = await prisma.tenant.upsert({
      where: { slug: 'openreal' },
      update: {
        name: 'OpenReal',
        domain: 'openreal.io',
        additionalDomains: ['localhost', '127.0.0.1'],
        status: 'ACTIVE',
        featureTier: 'ENTERPRISE',
      },
      create: {
        name: 'OpenReal',
        slug: 'openreal',
        domain: 'openreal.io',
        additionalDomains: ['localhost', '127.0.0.1'],
        status: 'ACTIVE',
        featureTier: 'ENTERPRISE',
      },
    });

    await prisma.tenantConfig.upsert({
      where: { tenantId: tenant1.id },
      update: {
        branding: {
          bgPrimary: '#0D0F14',
          bgSecondary: '#141720',
          bgTertiary: '#1A1E2B',
          accent: '#4F7BF7',
          textPrimary: '#FFFFFF',
          textSecondary: '#8B92A5',
          textMuted: '#5A6178',
          border: '#2A2E3D',
          success: '#22C55E',
          warning: '#F59E0B',
          error: '#EF4444',
          info: '#3B82F6',
          fontFamily: 'Inter, sans-serif',
          headingFont: 'Inter, sans-serif',
          logoPrimary: '',
          logoMonochrome: '',
          logoFavicon: '',
        },
        legal: {
          copyrightHolder: 'OpenReal Ltd',
          companyAddress: 'OpenReal Ltd, London, UK',
          regulatoryNotice:
            'OpenReal is not a regulated investment platform. All investments carry risk. Past performance is not indicative of future results.',
          termsUrl: '/legal/terms',
          privacyUrl: '/legal/privacy',
        },
        support: {
          email: 'support@openreal.io',
          phone: '+44 20 0000 0000',
          chatEnabled: false,
        },
        email: {
          fromName: 'OpenReal',
          fromAddress: 'noreply@openreal.io',
        },
        features: {
          market_overview: true,
          education_hub: true,
          issuer_portal: true,
          portfolio_distributions: true,
          portfolio_statements: true,
          mfa_support: true,
          custom_domain: true,
          api_access: true,
          advanced_analytics: true,
          audit_export: true,
          custom_email_templates: true,
          multi_currency: false,
          advanced_filters: true,
        },
        integrations: {
          kycProvider: 'sumsub',
          paymentConfig: {
            accountName: 'OpenReal Custody Account',
            iban: 'GB29NWBK60161331926819',
            bankName: 'National Westminster Bank',
            swift: 'NWBKGB2L',
          },
        },
        workflows: {
          requestExpiryDays: 7,
          requiredAcknowledgements: [
            'I understand that this is a request to invest, not a guaranteed allocation.',
            'I have read and understood the risk factors.',
            'I confirm I am eligible to invest in this opportunity.',
          ],
          allowedAssetClasses: [
            'REAL_ESTATE',
            'INFRASTRUCTURE',
            'PRIVATE_EQUITY',
            'PRIVATE_CREDIT',
            'COMMODITIES',
            'ART_AND_COLLECTIBLES',
            'OTHER',
          ],
          allowedRegions: [
            'NORTH_AMERICA',
            'EUROPE',
            'ASIA_PACIFIC',
            'MIDDLE_EAST',
            'AFRICA',
            'LATIN_AMERICA',
            'GLOBAL',
          ],
          maxFileUploadMB: 10,
        },
      },
      create: {
        tenantId: tenant1.id,
        branding: {
          bgPrimary: '#0D0F14',
          bgSecondary: '#141720',
          bgTertiary: '#1A1E2B',
          accent: '#4F7BF7',
          textPrimary: '#FFFFFF',
          textSecondary: '#8B92A5',
          textMuted: '#5A6178',
          border: '#2A2E3D',
          success: '#22C55E',
          warning: '#F59E0B',
          error: '#EF4444',
          info: '#3B82F6',
          fontFamily: 'Inter, sans-serif',
          headingFont: 'Inter, sans-serif',
          logoPrimary: '',
          logoMonochrome: '',
          logoFavicon: '',
        },
        legal: {
          copyrightHolder: 'OpenReal Ltd',
          companyAddress: 'OpenReal Ltd, London, UK',
          regulatoryNotice:
            'OpenReal is not a regulated investment platform. All investments carry risk. Past performance is not indicative of future results.',
          termsUrl: '/legal/terms',
          privacyUrl: '/legal/privacy',
        },
        support: {
          email: 'support@openreal.io',
          phone: '+44 20 0000 0000',
          chatEnabled: false,
        },
        email: {
          fromName: 'OpenReal',
          fromAddress: 'noreply@openreal.io',
        },
        features: {
          market_overview: true,
          education_hub: true,
          issuer_portal: true,
          portfolio_distributions: true,
          portfolio_statements: true,
          mfa_support: true,
          custom_domain: true,
          api_access: true,
          advanced_analytics: true,
          audit_export: true,
          custom_email_templates: true,
          multi_currency: false,
          advanced_filters: true,
        },
        integrations: {
          kycProvider: 'sumsub',
          paymentConfig: {
            accountName: 'OpenReal Custody Account',
            iban: 'GB29NWBK60161331926819',
            bankName: 'National Westminster Bank',
            swift: 'NWBKGB2L',
          },
        },
        workflows: {
          requestExpiryDays: 7,
          requiredAcknowledgements: [
            'I understand that this is a request to invest, not a guaranteed allocation.',
            'I have read and understood the risk factors.',
            'I confirm I am eligible to invest in this opportunity.',
          ],
          allowedAssetClasses: [
            'REAL_ESTATE',
            'INFRASTRUCTURE',
            'PRIVATE_EQUITY',
            'PRIVATE_CREDIT',
            'COMMODITIES',
            'ART_AND_COLLECTIBLES',
            'OTHER',
          ],
          allowedRegions: [
            'NORTH_AMERICA',
            'EUROPE',
            'ASIA_PACIFIC',
            'MIDDLE_EAST',
            'AFRICA',
            'LATIN_AMERICA',
            'GLOBAL',
          ],
          maxFileUploadMB: 10,
        },
      },
    });

    // ── Tenant 1 Users ──────────────────────────────────────────────────
    const adminHash = await bcrypt.hash('Admin123!', BCRYPT_SALT_ROUNDS);
    const investorHash = await bcrypt.hash('Investor123!', BCRYPT_SALT_ROUNDS);
    const issuerHash = await bcrypt.hash('Issuer123!', BCRYPT_SALT_ROUNDS);
    const tenantAdminHash = await bcrypt.hash(
      'TenantAdmin123!',
      BCRYPT_SALT_ROUNDS,
    );
    const spvManagerHash = await bcrypt.hash(
      'SpvManager123!',
      BCRYPT_SALT_ROUNDS,
    );
    const complianceHash = await bcrypt.hash(
      'Compliance123!',
      BCRYPT_SALT_ROUNDS,
    );

    const superAdmin = await prisma.user.upsert({
      where: {
        tenantId_email: { tenantId: tenant1.id, email: 'admin@openreal.io' },
      },
      update: {
        passwordHash: adminHash,
        fullName: 'Platform Admin',
        role: 'SUPER_ADMIN',
        emailVerified: true,
        status: 'ACTIVE',
      },
      create: {
        tenantId: tenant1.id,
        email: 'admin@openreal.io',
        passwordHash: adminHash,
        fullName: 'Platform Admin',
        role: 'SUPER_ADMIN',
        emailVerified: true,
        status: 'ACTIVE',
      },
    });

    const investor1 = await prisma.user.upsert({
      where: {
        tenantId_email: {
          tenantId: tenant1.id,
          email: 'investor@openreal.io',
        },
      },
      update: {
        passwordHash: investorHash,
        fullName: 'Test Investor',
        role: 'VERIFIED',
        emailVerified: true,
        status: 'ACTIVE',
      },
      create: {
        tenantId: tenant1.id,
        email: 'investor@openreal.io',
        passwordHash: investorHash,
        fullName: 'Test Investor',
        role: 'VERIFIED',
        emailVerified: true,
        status: 'ACTIVE',
      },
    });

    const issuer1 = await prisma.user.upsert({
      where: {
        tenantId_email: { tenantId: tenant1.id, email: 'issuer@openreal.io' },
      },
      update: {
        passwordHash: issuerHash,
        fullName: 'Test Issuer',
        role: 'ISSUER',
        emailVerified: true,
        status: 'ACTIVE',
      },
      create: {
        tenantId: tenant1.id,
        email: 'issuer@openreal.io',
        passwordHash: issuerHash,
        fullName: 'Test Issuer',
        role: 'ISSUER',
        emailVerified: true,
        status: 'ACTIVE',
      },
    });

    const tenantAdmin1 = await prisma.user.upsert({
      where: {
        tenantId_email: {
          tenantId: tenant1.id,
          email: 'tenantadmin@openreal.io',
        },
      },
      update: {
        passwordHash: tenantAdminHash,
        fullName: 'Tenant Admin',
        role: 'ADMIN',
        emailVerified: true,
        status: 'ACTIVE',
      },
      create: {
        tenantId: tenant1.id,
        email: 'tenantadmin@openreal.io',
        passwordHash: tenantAdminHash,
        fullName: 'Tenant Admin',
        role: 'ADMIN',
        emailVerified: true,
        status: 'ACTIVE',
      },
    });

    const investor1b = await prisma.user.upsert({
      where: {
        tenantId_email: {
          tenantId: tenant1.id,
          email: 'investor2@openreal.io',
        },
      },
      update: {
        passwordHash: investorHash,
        fullName: 'Investor Two',
        role: 'VERIFIED',
        emailVerified: true,
        status: 'ACTIVE',
      },
      create: {
        tenantId: tenant1.id,
        email: 'investor2@openreal.io',
        passwordHash: investorHash,
        fullName: 'Investor Two',
        role: 'VERIFIED',
        emailVerified: true,
        status: 'ACTIVE',
      },
    });

    const spvManager1 = await prisma.user.upsert({
      where: {
        tenantId_email: {
          tenantId: tenant1.id,
          email: 'spvmanager@openreal.io',
        },
      },
      update: {
        passwordHash: spvManagerHash,
        fullName: 'SPV Manager',
        role: 'SPV_MANAGER',
        emailVerified: true,
        status: 'ACTIVE',
      },
      create: {
        tenantId: tenant1.id,
        email: 'spvmanager@openreal.io',
        passwordHash: spvManagerHash,
        fullName: 'SPV Manager',
        role: 'SPV_MANAGER',
        emailVerified: true,
        status: 'ACTIVE',
      },
    });

    const compliance1 = await prisma.user.upsert({
      where: {
        tenantId_email: {
          tenantId: tenant1.id,
          email: 'compliance@openreal.io',
        },
      },
      update: {
        passwordHash: complianceHash,
        fullName: 'Compliance Officer',
        role: 'COMPLIANCE_OFFICER',
        emailVerified: true,
        status: 'ACTIVE',
      },
      create: {
        tenantId: tenant1.id,
        email: 'compliance@openreal.io',
        passwordHash: complianceHash,
        fullName: 'Compliance Officer',
        role: 'COMPLIANCE_OFFICER',
        emailVerified: true,
        status: 'ACTIVE',
      },
    });

    // ── Tenant 1 Issuer Org ─────────────────────────────────────────────
    const existingOrg1 = await prisma.issuerOrg.findFirst({
      where: { tenantId: tenant1.id, registrationNumber: 'ISS-2026-001' },
    });

    const issuerOrg1 =
      existingOrg1 ??
      (await prisma.issuerOrg.create({
        data: {
          tenantId: tenant1.id,
          name: 'Test Issuer Corp',
          registrationNumber: 'ISS-2026-001',
          countryOfIncorporation: 'United Kingdom',
          representativeUserId: issuer1.id,
          status: 'ACTIVE',
        },
      }));

    // ── Tenant 1 Content Article ────────────────────────────────────────
    await prisma.contentArticle.upsert({
      where: {
        tenantId_slug: {
          tenantId: tenant1.id,
          slug: 'what-is-real-world-asset-investing',
        },
      },
      update: {
        title: 'What is Real World Asset Investing?',
        body: `<p>Real World Asset (RWA) investing refers to the practice of investing in tangible, physical assets through digital platforms. These assets can include real estate, infrastructure projects, commodities, art, and other traditionally illiquid investments.</p>
<p>Through tokenisation and fractional ownership, RWA platforms make it possible for individual investors to access opportunities that were previously only available to institutional investors or high-net-worth individuals. This democratisation of investment opens up new possibilities for portfolio diversification.</p>
<p>While RWA investing offers exciting potential, it is important to understand the risks involved. Investments in real-world assets may be illiquid, subject to market fluctuations, and carry the risk of partial or total loss of capital. Always conduct thorough due diligence and consider seeking independent financial advice before investing.</p>`,
        category: 'EDUCATION',
        published: true,
        publishedAt: new Date(),
      },
      create: {
        tenantId: tenant1.id,
        slug: 'what-is-real-world-asset-investing',
        title: 'What is Real World Asset Investing?',
        body: `<p>Real World Asset (RWA) investing refers to the practice of investing in tangible, physical assets through digital platforms. These assets can include real estate, infrastructure projects, commodities, art, and other traditionally illiquid investments.</p>
<p>Through tokenisation and fractional ownership, RWA platforms make it possible for individual investors to access opportunities that were previously only available to institutional investors or high-net-worth individuals. This democratisation of investment opens up new possibilities for portfolio diversification.</p>
<p>While RWA investing offers exciting potential, it is important to understand the risks involved. Investments in real-world assets may be illiquid, subject to market fluctuations, and carry the risk of partial or total loss of capital. Always conduct thorough due diligence and consider seeking independent financial advice before investing.</p>`,
        category: 'EDUCATION',
        published: true,
        publishedAt: new Date(),
      },
    });

    // ── Tenant 1 Opportunity 1: Transfer-enabled ────────────────────────

    const TRANSFER_FEATURE_CONFIG = {
      primaryIssueEnabled: true,
      transferRequestEnabled: true,
      secondaryMarketEnabled: false,
      liquidityMode: 'transfer_only',
      tokenState: 'shadow_mirror',
      settlementMode: 'manual_external_confirm',
      surveillanceRequired: false,
      investorCategoryRuleset: 'adgm_retail_exempt',
    };

    let opp1 = await prisma.opportunity.findFirst({
      where: { tenantId: tenant1.id, title: 'Central London Office Complex' },
    });

    if (!opp1) {
      opp1 = await prisma.opportunity.create({
        data: {
          tenantId: tenant1.id,
          issuerOrgId: issuerOrg1.id,
          title: 'Central London Office Complex',
          summary:
            "Premium Grade A office building in the heart of London's financial district.",
          investmentThesis: `<p>This opportunity offers investors exposure to a prime commercial real estate asset in one of the world's most established financial centres. The building benefits from long-term lease agreements with blue-chip tenants, providing stable and predictable income streams.</p>
<p>The Central London office market has demonstrated resilience through multiple economic cycles, supported by strong demand from financial services, technology, and professional services firms. With limited new supply in the pipeline, rental growth prospects remain favourable.</p>`,
          whatYouAreBuying: `<p>Investors will acquire fractional ownership units in a Special Purpose Vehicle (SPV) that holds the freehold interest in the property. Each unit represents a proportional share of the asset's income and capital appreciation.</p>
<p>Unit holders will receive quarterly distributions from net rental income and will participate in any capital gains realised upon eventual sale of the property.</p>`,
          risks: `<p>Property values can fall as well as rise, and past performance is not a reliable indicator of future results. Key risks include: market risk (changes in property values), tenant risk (default or vacancy), interest rate risk, liquidity risk (units may not be easily tradeable), and regulatory risk.</p>
<p>This investment is only suitable for investors who understand and accept these risks and who can afford to lose their entire investment.</p>`,
          feesAndConflicts: `<p>An initial placement fee of 2% applies to all investments. An ongoing management fee of 0.75% per annum is charged on the net asset value. Performance fees of 15% apply to returns above an 8% preferred return hurdle.</p>
<p>The issuer may have other business relationships with service providers engaged by the SPV. Full details of potential conflicts of interest are disclosed in the offering memorandum.</p>`,
          assetClass: 'REAL_ESTATE',
          region: 'EUROPE',
          heroImageKey: 'openreal/opportunities/sample/hero.jpg',
          minimumAmount: 10000,
          maximumAmount: 500000,
          currency: 'GBP',
          status: 'LIVE',
          submittedAt: new Date(),
          approvedAt: new Date(),
          statusHistory: [
            { status: 'DRAFT', timestamp: '2026-02-20T10:00:00.000Z' },
            { status: 'SUBMITTED', timestamp: '2026-02-20T14:00:00.000Z' },
            { status: 'UNDER_REVIEW', timestamp: '2026-02-21T09:00:00.000Z' },
            { status: 'APPROVED', timestamp: '2026-02-21T11:00:00.000Z' },
            { status: 'LIVE', timestamp: '2026-02-21T11:30:00.000Z' },
          ],
          transferRequestEnabled: true,
          minTransferQuantity: 10,
          maxHolders: 50,
          rofrEnabled: true,
          rofrWindowDays: 3,
          featureConfig: TRANSFER_FEATURE_CONFIG,
        },
      });
    } else {
      // Update existing opportunity with transfer config
      opp1 = await prisma.opportunity.update({
        where: { id: opp1.id },
        data: {
          transferRequestEnabled: true,
          lockupUntil: null,
          minTransferQuantity: 10,
          maxHolders: 50,
          rofrEnabled: true,
          rofrWindowDays: 3,
          featureConfig: TRANSFER_FEATURE_CONFIG,
        },
      });
    }

    // ── Tenant 1 Opportunity 2: Locked ────────────────────────────────

    let opp1Locked = await prisma.opportunity.findFirst({
      where: {
        tenantId: tenant1.id,
        title: 'Abu Dhabi Logistics Hub — Series B',
      },
    });

    if (!opp1Locked) {
      opp1Locked = await prisma.opportunity.create({
        data: {
          tenantId: tenant1.id,
          issuerOrgId: issuerOrg1.id,
          title: 'Abu Dhabi Logistics Hub — Series B',
          summary:
            'State-of-the-art logistics and warehousing facility in Abu Dhabi KIZAD Free Zone.',
          investmentThesis:
            '<p>Exposure to the booming logistics sector in the UAE, driven by e-commerce growth and regional trade expansion.</p>',
          whatYouAreBuying:
            '<p>Fractional ownership units in an SPV holding the leasehold interest in the facility.</p>',
          risks:
            '<p>Commercial real estate investments carry risks including vacancy, tenant default, and market downturns.</p>',
          feesAndConflicts:
            '<p>2% placement fee. 1% annual management fee. 15% performance fee above 8% hurdle.</p>',
          assetClass: 'INFRASTRUCTURE',
          region: 'MIDDLE_EAST',
          minimumAmount: 25000,
          maximumAmount: 1000000,
          currency: 'USD',
          status: 'LIVE',
          submittedAt: new Date(),
          approvedAt: new Date(),
          statusHistory: [
            { status: 'DRAFT', timestamp: '2026-03-01T10:00:00.000Z' },
            { status: 'SUBMITTED', timestamp: '2026-03-01T14:00:00.000Z' },
            { status: 'LIVE', timestamp: '2026-03-02T10:00:00.000Z' },
          ],
          transferRequestEnabled: true,
          lockupUntil: new Date('2027-12-31'),
          rofrEnabled: false,
          featureConfig: TRANSFER_FEATURE_CONFIG,
        },
      });
    }

    // ── Tenant 1 Holdings + Registry (idempotent) ─────────────────────

    // Helper: create investment request + holding + registry entry
    async function seedHolding(params: {
      tenantId: string;
      userId: string;
      opportunityId: string;
      units: number;
      acquisitionDate: Date;
      refPrefix: string;
      refSeq: number;
      sealedBy: string;
    }) {
      // Check if holding already exists for this user+opportunity
      const existing = await prisma.holding.findFirst({
        where: {
          tenantId: params.tenantId,
          userId: params.userId,
          opportunityId: params.opportunityId,
          status: 'ACTIVE',
        },
      });
      if (existing) return existing;

      // Create a confirmed investment request (required FK)
      const refNum = `${params.refPrefix}-2026-${String(params.refSeq).padStart(6, '0')}`;
      const ir = await prisma.investmentRequest.create({
        data: {
          tenantId: params.tenantId,
          userId: params.userId,
          opportunityId: params.opportunityId,
          amount: params.units,
          currency: 'USD',
          status: 'CONFIRMED',
          referenceNumber: refNum,
          acknowledgements: ['seed'],
          statusHistory: [
            {
              status: 'REQUEST_CREATED',
              timestamp: params.acquisitionDate.toISOString(),
            },
            {
              status: 'CONFIRMED',
              timestamp: params.acquisitionDate.toISOString(),
            },
          ],
          expiresAt: new Date('2099-12-31'),
        },
      });

      const holding = await prisma.holding.create({
        data: {
          tenantId: params.tenantId,
          userId: params.userId,
          opportunityId: params.opportunityId,
          investmentRequestId: ir.id,
          units: params.units,
          acquisitionDate: params.acquisitionDate,
          status: 'ACTIVE',
        },
      });

      await prisma.registryEntry.create({
        data: {
          tenantId: params.tenantId,
          opportunityId: params.opportunityId,
          fromUserId: null,
          toUserId: params.userId,
          quantity: params.units,
          eventType: 'PRIMARY_ISSUANCE',
          sealedBy: params.sealedBy,
          metadata: { note: 'Seed — primary issuance', holdingId: holding.id },
        },
      });

      return holding;
    }

    // Investor 1: 500 units on transfer-enabled opportunity
    await seedHolding({
      tenantId: tenant1.id,
      userId: investor1.id,
      opportunityId: opp1.id,
      units: 500,
      acquisitionDate: new Date('2026-01-15'),
      refPrefix: 'OPENREAL',
      refSeq: 901,
      sealedBy: tenantAdmin1.id,
    });

    // Investor 2: 200 units on transfer-enabled opportunity (ROFR co-holder)
    await seedHolding({
      tenantId: tenant1.id,
      userId: investor1b.id,
      opportunityId: opp1.id,
      units: 200,
      acquisitionDate: new Date('2026-02-01'),
      refPrefix: 'OPENREAL',
      refSeq: 902,
      sealedBy: tenantAdmin1.id,
    });

    // Investor 1: 300 units on locked opportunity
    await seedHolding({
      tenantId: tenant1.id,
      userId: investor1.id,
      opportunityId: opp1Locked.id,
      units: 300,
      acquisitionDate: new Date('2026-01-20'),
      refPrefix: 'OPENREAL',
      refSeq: 903,
      sealedBy: tenantAdmin1.id,
    });

    // ═══════════════════════════════════════════════════════════════════════
    // TENANT 2 — Client X Capital (professional tier, different branding)
    // ═══════════════════════════════════════════════════════════════════════

    const tenant2 = await prisma.tenant.upsert({
      where: { slug: 'clientx' },
      update: {
        name: 'Client X Capital',
        domain: 'clientx.openreal.io',
        additionalDomains: [],
        status: 'ACTIVE',
        featureTier: 'PROFESSIONAL',
      },
      create: {
        name: 'Client X Capital',
        slug: 'clientx',
        domain: 'clientx.openreal.io',
        additionalDomains: [],
        status: 'ACTIVE',
        featureTier: 'PROFESSIONAL',
      },
    });

    await prisma.tenantConfig.upsert({
      where: { tenantId: tenant2.id },
      update: {
        branding: {
          bgPrimary: '#1A1A2E',
          bgSecondary: '#16213E',
          bgTertiary: '#0F3460',
          accent: '#E94560',
          textPrimary: '#FFFFFF',
          textSecondary: '#A0A0B0',
          textMuted: '#707080',
          border: '#2A2A4A',
          success: '#22C55E',
          warning: '#F59E0B',
          error: '#EF4444',
          info: '#3B82F6',
          fontFamily: 'Inter, sans-serif',
          headingFont: 'Inter, sans-serif',
          logoPrimary: '',
          logoMonochrome: '',
          logoFavicon: '',
        },
        legal: {
          copyrightHolder: 'Client X Capital Ltd',
          companyAddress: 'Client X Capital Ltd, Dubai, UAE',
          regulatoryNotice:
            'Client X Capital is an authorized investment platform. All investments carry risk.',
          termsUrl: '/legal/terms',
          privacyUrl: '/legal/privacy',
        },
        support: {
          email: 'support@clientx.com',
          phone: '',
          chatEnabled: false,
        },
        email: {
          fromName: 'Client X Capital',
          fromAddress: 'noreply@clientx.com',
        },
        features: {
          market_overview: true,
          education_hub: true,
          issuer_portal: true,
          portfolio_distributions: true,
          portfolio_statements: true,
          mfa_support: true,
          custom_domain: false,
          api_access: false,
          advanced_analytics: false,
          audit_export: true,
          custom_email_templates: false,
          multi_currency: false,
          advanced_filters: true,
        },
        integrations: {
          kycProvider: 'sumsub',
          paymentConfig: {
            accountName: 'Client X Capital Account',
            iban: 'AE070331234567890123456',
            bankName: 'Emirates NBD',
            swift: 'EABORADE',
          },
        },
        workflows: {
          requestExpiryDays: 14,
          requiredAcknowledgements: [
            'I understand this is a non-binding investment request.',
            'I have reviewed the risk disclosures.',
            'I confirm my eligibility to invest.',
          ],
          allowedAssetClasses: [
            'REAL_ESTATE',
            'PRIVATE_EQUITY',
            'PRIVATE_CREDIT',
          ],
          allowedRegions: ['MIDDLE_EAST', 'EUROPE', 'ASIA_PACIFIC'],
          maxFileUploadMB: 10,
        },
      },
      create: {
        tenantId: tenant2.id,
        branding: {
          bgPrimary: '#1A1A2E',
          bgSecondary: '#16213E',
          bgTertiary: '#0F3460',
          accent: '#E94560',
          textPrimary: '#FFFFFF',
          textSecondary: '#A0A0B0',
          textMuted: '#707080',
          border: '#2A2A4A',
          success: '#22C55E',
          warning: '#F59E0B',
          error: '#EF4444',
          info: '#3B82F6',
          fontFamily: 'Inter, sans-serif',
          headingFont: 'Inter, sans-serif',
          logoPrimary: '',
          logoMonochrome: '',
          logoFavicon: '',
        },
        legal: {
          copyrightHolder: 'Client X Capital Ltd',
          companyAddress: 'Client X Capital Ltd, Dubai, UAE',
          regulatoryNotice:
            'Client X Capital is an authorized investment platform. All investments carry risk.',
          termsUrl: '/legal/terms',
          privacyUrl: '/legal/privacy',
        },
        support: {
          email: 'support@clientx.com',
          phone: '',
          chatEnabled: false,
        },
        email: {
          fromName: 'Client X Capital',
          fromAddress: 'noreply@clientx.com',
        },
        features: {
          market_overview: true,
          education_hub: true,
          issuer_portal: true,
          portfolio_distributions: true,
          portfolio_statements: true,
          mfa_support: true,
          custom_domain: false,
          api_access: false,
          advanced_analytics: false,
          audit_export: true,
          custom_email_templates: false,
          multi_currency: false,
          advanced_filters: true,
        },
        integrations: {
          kycProvider: 'sumsub',
          paymentConfig: {
            accountName: 'Client X Capital Account',
            iban: 'AE070331234567890123456',
            bankName: 'Emirates NBD',
            swift: 'EABORADE',
          },
        },
        workflows: {
          requestExpiryDays: 14,
          requiredAcknowledgements: [
            'I understand this is a non-binding investment request.',
            'I have reviewed the risk disclosures.',
            'I confirm my eligibility to invest.',
          ],
          allowedAssetClasses: [
            'REAL_ESTATE',
            'PRIVATE_EQUITY',
            'PRIVATE_CREDIT',
          ],
          allowedRegions: ['MIDDLE_EAST', 'EUROPE', 'ASIA_PACIFIC'],
          maxFileUploadMB: 10,
        },
      },
    });

    // ── Tenant 2 Users ──────────────────────────────────────────────────
    const clientAdminHash = await bcrypt.hash(
      'ClientAdmin123!',
      BCRYPT_SALT_ROUNDS,
    );
    const clientInvestorHash = await bcrypt.hash(
      'ClientInvestor123!',
      BCRYPT_SALT_ROUNDS,
    );
    const clientIssuerHash = await bcrypt.hash(
      'ClientIssuer123!',
      BCRYPT_SALT_ROUNDS,
    );

    const tenantAdmin2 = await prisma.user.upsert({
      where: {
        tenantId_email: { tenantId: tenant2.id, email: 'admin@clientx.com' },
      },
      update: {
        passwordHash: clientAdminHash,
        fullName: 'Client X Admin',
        role: 'ADMIN',
        emailVerified: true,
        status: 'ACTIVE',
      },
      create: {
        tenantId: tenant2.id,
        email: 'admin@clientx.com',
        passwordHash: clientAdminHash,
        fullName: 'Client X Admin',
        role: 'ADMIN',
        emailVerified: true,
        status: 'ACTIVE',
      },
    });

    const investor2 = await prisma.user.upsert({
      where: {
        tenantId_email: {
          tenantId: tenant2.id,
          email: 'investor@clientx.com',
        },
      },
      update: {
        passwordHash: clientInvestorHash,
        fullName: 'Client X Investor',
        role: 'VERIFIED',
        emailVerified: true,
        status: 'ACTIVE',
      },
      create: {
        tenantId: tenant2.id,
        email: 'investor@clientx.com',
        passwordHash: clientInvestorHash,
        fullName: 'Client X Investor',
        role: 'VERIFIED',
        emailVerified: true,
        status: 'ACTIVE',
      },
    });

    const issuer2 = await prisma.user.upsert({
      where: {
        tenantId_email: { tenantId: tenant2.id, email: 'issuer@clientx.com' },
      },
      update: {
        passwordHash: clientIssuerHash,
        fullName: 'Client X Issuer',
        role: 'ISSUER',
        emailVerified: true,
        status: 'ACTIVE',
      },
      create: {
        tenantId: tenant2.id,
        email: 'issuer@clientx.com',
        passwordHash: clientIssuerHash,
        fullName: 'Client X Issuer',
        role: 'ISSUER',
        emailVerified: true,
        status: 'ACTIVE',
      },
    });

    const investor2b = await prisma.user.upsert({
      where: {
        tenantId_email: {
          tenantId: tenant2.id,
          email: 'investor2@clientx.com',
        },
      },
      update: {
        passwordHash: clientInvestorHash,
        fullName: 'Client X Investor Two',
        role: 'VERIFIED',
        emailVerified: true,
        status: 'ACTIVE',
      },
      create: {
        tenantId: tenant2.id,
        email: 'investor2@clientx.com',
        passwordHash: clientInvestorHash,
        fullName: 'Client X Investor Two',
        role: 'VERIFIED',
        emailVerified: true,
        status: 'ACTIVE',
      },
    });

    const spvManager2 = await prisma.user.upsert({
      where: {
        tenantId_email: {
          tenantId: tenant2.id,
          email: 'spvmanager@clientx.com',
        },
      },
      update: {
        passwordHash: spvManagerHash,
        fullName: 'Client X SPV Manager',
        role: 'SPV_MANAGER',
        emailVerified: true,
        status: 'ACTIVE',
      },
      create: {
        tenantId: tenant2.id,
        email: 'spvmanager@clientx.com',
        passwordHash: spvManagerHash,
        fullName: 'Client X SPV Manager',
        role: 'SPV_MANAGER',
        emailVerified: true,
        status: 'ACTIVE',
      },
    });

    const compliance2 = await prisma.user.upsert({
      where: {
        tenantId_email: {
          tenantId: tenant2.id,
          email: 'compliance@clientx.com',
        },
      },
      update: {
        passwordHash: complianceHash,
        fullName: 'Client X Compliance Officer',
        role: 'COMPLIANCE_OFFICER',
        emailVerified: true,
        status: 'ACTIVE',
      },
      create: {
        tenantId: tenant2.id,
        email: 'compliance@clientx.com',
        passwordHash: complianceHash,
        fullName: 'Client X Compliance Officer',
        role: 'COMPLIANCE_OFFICER',
        emailVerified: true,
        status: 'ACTIVE',
      },
    });

    // ── Tenant 2 Issuer Org ─────────────────────────────────────────────
    const existingOrg2 = await prisma.issuerOrg.findFirst({
      where: { tenantId: tenant2.id, registrationNumber: 'CXC-2026-001' },
    });

    const issuerOrg2 =
      existingOrg2 ??
      (await prisma.issuerOrg.create({
        data: {
          tenantId: tenant2.id,
          name: 'Client X Ventures',
          registrationNumber: 'CXC-2026-001',
          countryOfIncorporation: 'United Arab Emirates',
          representativeUserId: issuer2.id,
          status: 'ACTIVE',
        },
      }));

    // ── Tenant 2 Content Article ────────────────────────────────────────
    await prisma.contentArticle.upsert({
      where: {
        tenantId_slug: {
          tenantId: tenant2.id,
          slug: 'understanding-private-equity',
        },
      },
      update: {
        title: 'Understanding Private Equity Investments',
        body: `<p>Private equity (PE) involves investing directly in private companies or conducting buyouts of public companies that result in a delisting of public equity. PE funds typically acquire companies, improve their operations, and sell them for a profit.</p>
<p>As an investor, participating in private equity opportunities through a regulated platform provides access to an asset class that has historically outperformed public markets over long time horizons.</p>
<p>However, PE investments are inherently illiquid and carry significant risk including total loss of capital. Always review the offering documents carefully before investing.</p>`,
        category: 'EDUCATION',
        published: true,
        publishedAt: new Date(),
      },
      create: {
        tenantId: tenant2.id,
        slug: 'understanding-private-equity',
        title: 'Understanding Private Equity Investments',
        body: `<p>Private equity (PE) involves investing directly in private companies or conducting buyouts of public companies that result in a delisting of public equity. PE funds typically acquire companies, improve their operations, and sell them for a profit.</p>
<p>As an investor, participating in private equity opportunities through a regulated platform provides access to an asset class that has historically outperformed public markets over long time horizons.</p>
<p>However, PE investments are inherently illiquid and carry significant risk including total loss of capital. Always review the offering documents carefully before investing.</p>`,
        category: 'EDUCATION',
        published: true,
        publishedAt: new Date(),
      },
    });

    // ── Tenant 2 Opportunity 1: Transfer-enabled ────────────────────────

    let opp2 = await prisma.opportunity.findFirst({
      where: { tenantId: tenant2.id, title: 'Dubai Marina Mixed-Use Tower' },
    });

    if (!opp2) {
      opp2 = await prisma.opportunity.create({
        data: {
          tenantId: tenant2.id,
          issuerOrgId: issuerOrg2.id,
          title: 'Dubai Marina Mixed-Use Tower',
          summary:
            'Premium mixed-use development in Dubai Marina with residential, retail, and hospitality components.',
          investmentThesis: `<p>This opportunity provides exposure to one of the fastest-growing real estate markets in the Middle East. Dubai Marina continues to attract global investment due to its strategic location, world-class infrastructure, and favourable regulatory environment.</p>
<p>The mixed-use nature of the development provides diversified income streams from residential leasing, retail tenants, and hotel operations.</p>`,
          whatYouAreBuying: `<p>Investors acquire fractional ownership units in an SPV holding the development. Each unit represents a proportional share of the asset's income and capital appreciation across all revenue streams.</p>`,
          risks: `<p>Real estate investments carry risk including market volatility, construction delays, currency risk, and regulatory changes. This investment is only suitable for investors who understand and accept these risks.</p>`,
          feesAndConflicts: `<p>A 2.5% placement fee applies. Ongoing management fee of 1% per annum on NAV. Performance fees of 20% above a 10% preferred return hurdle.</p>`,
          assetClass: 'REAL_ESTATE',
          region: 'MIDDLE_EAST',
          minimumAmount: 25000,
          maximumAmount: 1000000,
          currency: 'USD',
          status: 'LIVE',
          submittedAt: new Date(),
          approvedAt: new Date(),
          statusHistory: [
            { status: 'DRAFT', timestamp: '2026-02-22T08:00:00.000Z' },
            { status: 'SUBMITTED', timestamp: '2026-02-22T12:00:00.000Z' },
            { status: 'UNDER_REVIEW', timestamp: '2026-02-23T09:00:00.000Z' },
            { status: 'APPROVED', timestamp: '2026-02-23T14:00:00.000Z' },
            { status: 'LIVE', timestamp: '2026-02-23T14:30:00.000Z' },
          ],
          transferRequestEnabled: true,
          minTransferQuantity: 10,
          maxHolders: 50,
          rofrEnabled: true,
          rofrWindowDays: 3,
          featureConfig: TRANSFER_FEATURE_CONFIG,
        },
      });
    } else {
      opp2 = await prisma.opportunity.update({
        where: { id: opp2.id },
        data: {
          transferRequestEnabled: true,
          lockupUntil: null,
          minTransferQuantity: 10,
          maxHolders: 50,
          rofrEnabled: true,
          rofrWindowDays: 3,
          featureConfig: TRANSFER_FEATURE_CONFIG,
        },
      });
    }

    // ── Tenant 2 Opportunity 2: Locked ────────────────────────────────

    let opp2Locked = await prisma.opportunity.findFirst({
      where: {
        tenantId: tenant2.id,
        title: 'DIFC Commercial Tower — Series A',
      },
    });

    if (!opp2Locked) {
      opp2Locked = await prisma.opportunity.create({
        data: {
          tenantId: tenant2.id,
          issuerOrgId: issuerOrg2.id,
          title: 'DIFC Commercial Tower — Series A',
          summary:
            'Premium office tower in the Dubai International Financial Centre.',
          investmentThesis:
            '<p>Prime commercial real estate in the DIFC, benefiting from strong institutional demand and limited supply.</p>',
          whatYouAreBuying:
            '<p>Fractional ownership units in an SPV holding the leasehold interest.</p>',
          risks:
            '<p>Commercial real estate investments carry risks including vacancy, market downturns, and currency fluctuations.</p>',
          feesAndConflicts:
            '<p>2% placement fee. 1% annual management fee. 20% performance fee above 10% hurdle.</p>',
          assetClass: 'REAL_ESTATE',
          region: 'MIDDLE_EAST',
          minimumAmount: 50000,
          maximumAmount: 2000000,
          currency: 'USD',
          status: 'LIVE',
          submittedAt: new Date(),
          approvedAt: new Date(),
          statusHistory: [
            { status: 'DRAFT', timestamp: '2026-03-01T10:00:00.000Z' },
            { status: 'SUBMITTED', timestamp: '2026-03-01T14:00:00.000Z' },
            { status: 'LIVE', timestamp: '2026-03-02T10:00:00.000Z' },
          ],
          transferRequestEnabled: true,
          lockupUntil: new Date('2027-12-31'),
          rofrEnabled: false,
          featureConfig: TRANSFER_FEATURE_CONFIG,
        },
      });
    }

    // ── Tenant 2 Holdings + Registry ──────────────────────────────────

    await seedHolding({
      tenantId: tenant2.id,
      userId: investor2.id,
      opportunityId: opp2.id,
      units: 500,
      acquisitionDate: new Date('2026-01-15'),
      refPrefix: 'CLIENTX',
      refSeq: 901,
      sealedBy: tenantAdmin2.id,
    });

    await seedHolding({
      tenantId: tenant2.id,
      userId: investor2b.id,
      opportunityId: opp2.id,
      units: 200,
      acquisitionDate: new Date('2026-02-01'),
      refPrefix: 'CLIENTX',
      refSeq: 902,
      sealedBy: tenantAdmin2.id,
    });

    await seedHolding({
      tenantId: tenant2.id,
      userId: investor2.id,
      opportunityId: opp2Locked.id,
      units: 300,
      acquisitionDate: new Date('2026-01-20'),
      refPrefix: 'CLIENTX',
      refSeq: 903,
      sealedBy: tenantAdmin2.id,
    });

    // ═══════════════════════════════════════════════════════════════════════
    // Summary
    // ═══════════════════════════════════════════════════════════════════════

    console.log(`
=== SEED COMPLETE ===

TENANT 1: openreal.io
  Super Admin:   admin@openreal.io / Admin123!
  Tenant Admin:  tenantadmin@openreal.io / TenantAdmin123!
  Investor 1:    investor@openreal.io / Investor123!   -> 500 units (London Office), 300 units (Logistics Hub LOCKED)
  Investor 2:    investor2@openreal.io / Investor123!  -> 200 units (London Office)
  Issuer:        issuer@openreal.io / Issuer123!
  SPV Manager:   spvmanager@openreal.io / SpvManager123!
  Compliance:    compliance@openreal.io / Compliance123!

  Opportunities:
    Central London Office Complex  — transfer ENABLED, no lockup, ROFR on (3 days)
    Abu Dhabi Logistics Hub        — transfer ENABLED, LOCKED until 2027-12-31

TENANT 2: clientx.openreal.io
  Tenant Admin:  admin@clientx.com / ClientAdmin123!
  Investor 1:    investor@clientx.com / ClientInvestor123!  -> 500 units (Dubai Marina), 300 units (DIFC Tower LOCKED)
  Investor 2:    investor2@clientx.com / ClientInvestor123! -> 200 units (Dubai Marina)
  Issuer:        issuer@clientx.com / ClientIssuer123!
  SPV Manager:   spvmanager@clientx.com / SpvManager123!
  Compliance:    compliance@clientx.com / Compliance123!

  Opportunities:
    Dubai Marina Mixed-Use Tower   — transfer ENABLED, no lockup, ROFR on (3 days)
    DIFC Commercial Tower          — transfer ENABLED, LOCKED until 2027-12-31

Swagger: https://openreal.io/api/docs
===================
`);

    await prisma.$disconnect();
    await pool.end();
  } catch (error) {
    console.error('Seed failed:', error);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  }
}

main();
