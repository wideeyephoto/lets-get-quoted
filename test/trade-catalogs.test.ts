import { describe, it, expect } from 'vitest';
import {
  TRADE_STARTER_CATALOGS,
  listTradeStarterCatalogs,
  getStarterCatalogByTrade,
} from '../src/lib/trade-catalogs';

describe('Trade Starter Catalogs', () => {
  it('provides rich starter catalogs across essential contractor trades', () => {
    const catalogs = listTradeStarterCatalogs();
    expect(catalogs.length).toBeGreaterThanOrEqual(8);

    const tradeKeys = Object.keys(TRADE_STARTER_CATALOGS);
    expect(tradeKeys).toContain('plumbing');
    expect(tradeKeys).toContain('electrical');
    expect(tradeKeys).toContain('hvac');
    expect(tradeKeys).toContain('landscaping');
    expect(tradeKeys).toContain('roofing');
    expect(tradeKeys).toContain('painting');
    expect(tradeKeys).toContain('handyman');
    expect(tradeKeys).toContain('pressure_washing');
    expect(tradeKeys).toContain('holiday_lighting');
    expect(tradeKeys).toContain('lawn_care');
    expect(tradeKeys).toContain('mosquito_tick_control');
    expect(tradeKeys).toContain('air_duct_cleaning');
    expect(tradeKeys).toContain('pond_services');
  });

  it('every starter item has valid price, cost, unit, and healthy margin', () => {
    for (const catalog of listTradeStarterCatalogs()) {
      expect(catalog.items.length).toBeGreaterThanOrEqual(4);
      for (const item of catalog.items) {
        expect(item.name.length).toBeGreaterThan(3);
        expect(item.unitPrice).toBeGreaterThan(0);
        expect(item.unitCost).toBeGreaterThan(0);
        expect(item.unitPrice).toBeGreaterThan(item.unitCost); // Profit margin > 0
        expect(['each', 'hour', 'sqft', 'visit', 'job']).toContain(item.unit);
      }
    }
  });

  it('retrieves trade catalog by ID safely', () => {
    const plumbing = getStarterCatalogByTrade('plumbing');
    expect(plumbing).toBeDefined();
    expect(plumbing?.name).toBe('Plumbing & Gas');
    expect(plumbing?.items.some((i) => i.name.includes('Water Heater'))).toBe(true);

    const unknown = getStarterCatalogByTrade('underwater_welding');
    expect(unknown).toBeNull();
  });
});
