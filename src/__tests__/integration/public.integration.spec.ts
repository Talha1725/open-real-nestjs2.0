// Integration test — requires: docker services running, seed data applied, app running on port 3000

import { describe, it, expect } from 'vitest';
import { api } from '../helpers/api.js';

describe('Public Endpoints', () => {
  it('GET /public/market-overview returns the current public market payload', async () => {
    const { status, data } = await api('GET', '/public/market-overview');

    expect(status).toBe(200);
    expect(data.platform.kpis).toBeDefined();
    expect(typeof data.platform.kpis.totalOpportunities).toBe('number');
    expect(typeof data.platform.kpis.totalAssetValue).toBe('number');
    expect(typeof data.platform.kpis.totalInvestors).toBe('number');
    expect(typeof data.platform.kpis.averageInvestment).toBe('number');
    expect(Array.isArray(data.platform.assetClassDistribution)).toBe(true);
    expect(Array.isArray(data.platform.regionDistribution)).toBe(true);
    expect(data.platform.recentActivity).toBeDefined();

    expect(Array.isArray(data.platform.topOpportunities)).toBe(true);
    expect(JSON.stringify(data)).not.toContain('issuerOrgId');
  });

  it('GET /public/market-overview includes portal navigation metadata', async () => {
    const { status, data } = await api('GET', '/public/market-overview');

    expect(status).toBe(200);
    expect(data.portal).toBeDefined();
    expect(data.portal.parentSection).toBe('Market Overview');
    expect(data.portal.hierarchy).toBeDefined();
    expect(Array.isArray(data.portal.routeAliases)).toBe(true);
    expect(Array.isArray(data.portal.publicSafeRules)).toBe(true);
    expect(Array.isArray(data.portal.navigation)).toBe(true);
    expect(data.portal.navigation.length).toBeGreaterThanOrEqual(5);
  });

  it('GET /public/market/portal returns the structured market portal manifest', async () => {
    const { status, data } = await api('GET', '/public/market/portal');

    expect(status).toBe(200);
    expect(data.parentSection).toBe('Market Overview');
    expect(Array.isArray(data.navigation)).toBe(true);
    expect(Array.isArray(data.routeGroups)).toBe(true);
    expect(Array.isArray(data.publicSafeRules)).toBe(true);
  });

  it('GET /public/market/news returns a market news feed', async () => {
    const { status, data } = await api('GET', '/public/market/news');

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('title');
      expect(data[0]).toHaveProperty('summary');
      expect(data[0]).toHaveProperty('timestamp');
    }
  });

  it('GET /public/market/asset-screener returns public screening data', async () => {
    const { status, data } = await api('GET', '/public/market/asset-screener');

    expect(status).toBe(200);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.meta).toBeDefined();
    expect(data.filters).toBeDefined();
  });

  it('GET /public/market/asset-classes returns reusable category data', async () => {
    const { status, data } = await api('GET', '/public/market/asset-classes');

    expect(status).toBe(200);
    expect(data.section).toBe('asset-classes');
    expect(Array.isArray(data.navigation)).toBe(true);
    expect(Array.isArray(data.rankingTable)).toBe(true);
    expect(data.pageType).toBe('market-category');
  });

  it('GET /public/market/credit returns a category page template', async () => {
    const { status, data } = await api('GET', '/public/market/credit');

    expect(status).toBe(200);
    expect(data.section).toBe('credit');
    expect(data.publicSafe).toBe(true);
    expect(data.categoryHeader).toBeDefined();
    expect(data.pageTemplate).toBe('category-template');
    expect(data.routeAlias).toBe('/public/market/category/credit');
  });

  it('GET /public/market/category/credit returns the generic category page alias', async () => {
    const { status, data } = await api('GET', '/public/market/category/credit');

    expect(status).toBe(200);
    expect(data.section).toBe('credit');
    expect(data.routeAlias).toBe('/public/market/category/credit');
  });

  it('GET /public/education returns published articles', async () => {
    const { status, data } = await api('GET', '/public/education');

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(1);
    expect(data[0]).toHaveProperty('title');
    expect(data[0]).toHaveProperty('slug');
  });

  it('GET /public/education/:slug returns a single article', async () => {
    const { status, data } = await api(
      'GET',
      '/public/education/what-is-real-world-asset-investing',
    );

    expect(status).toBe(200);
    expect(data.title).toBe('What is Real World Asset Investing?');
    expect(data.body).toBeDefined();
    expect(data.category).toBe('EDUCATION');
  });

  it('GET /public/education/:slug returns 404 for unknown slug', async () => {
    const { status } = await api('GET', '/public/education/nonexistent-slug');
    expect(status).toBe(404);
  });

  it('GET /public/legal/terms returns legal content', async () => {
    const { status, data } = await api('GET', '/public/legal/terms');

    expect(status).toBe(200);
    expect(data.slug).toBe('terms');
    expect(data.content).toBeDefined();
  });

  it('GET /support/faq returns FAQ articles', async () => {
    const { status, data } = await api('GET', '/support/faq');

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });
});
