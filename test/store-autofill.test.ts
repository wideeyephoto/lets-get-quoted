import { describe, it, expect } from 'vitest';
import { parseStoreProductUrl, getTodayDateString, searchStoreCatalog } from '../src/lib/store-autofill';

describe('store-autofill', () => {
  it('defaults purchase date to today in YYYY-MM-DD format', () => {
    const today = getTodayDateString();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const res = parseStoreProductUrl('https://www.homedepot.com/p/generic-drill/123456');
    expect(res.purchaseDate).toBe(today);
  });

  it('correctly parses a Home Depot Milwaukee Band Saw URL', () => {
    const url =
      'https://www.homedepot.com/p/Milwaukee-M18-FUEL-18V-Lithium-Ion-Brushless-Cordless-Deep-Cut-Band-Saw-Tool-Only-2729-20/205629470';
    const res = parseStoreProductUrl(url);

    expect(res.success).toBe(true);
    expect(res.retailer).toBe('Home Depot');
    expect(res.brand).toBe('Milwaukee');
    expect(res.name).toContain('Milwaukee');
    expect(res.name).toContain('Band Saw');
    expect(res.modelNumber).toBe('2729-20');
    expect(res.sku).toBe('205629470');
    expect(res.category).toBe('Cutting Tools');
    expect(res.purchasePrice).toBe(349);
    expect(res.imageUrl).toBe('/images/tools/milwaukee-bandsaw.jpg');
    expect(res.depreciationSchedule).toBe('de_minimis');
  });

  it('correctly parses a Lowe\'s DEWALT Drill URL', () => {
    const url =
      'https://www.lowes.com/pd/DEWALT-20V-MAX-1-2-in-Brushless-Cordless-Drill-Driver/1000135831';
    const res = parseStoreProductUrl(url);

    expect(res.success).toBe(true);
    expect(res.retailer).toBe("Lowe's");
    expect(res.brand).toBe('DEWALT');
    expect(res.sku).toBe('1000135831');
    expect(res.category).toBe('Power Tools');
    expect(res.purchasePrice).toBe(159);
    expect(res.notes).toContain("Lowe's");
  });

  it('gracefully handles uncataloged store URLs and extracts brand, model, and category', () => {
    const url =
      'https://www.homedepot.com/p/Makita-18V-LXT-Lithium-Ion-Cordless-6-1-2-in-Circular-Saw-XSS02Z/205479703';
    const res = parseStoreProductUrl(url);

    expect(res.success).toBe(true);
    expect(res.retailer).toBe('Home Depot');
    expect(res.brand).toBe('Makita');
    expect(res.modelNumber).toBe('XSS02Z');
    expect(res.sku).toBe('205479703');
    expect(res.category).toBe('Cutting Tools');
    expect(res.purchasePrice).toBeGreaterThan(0);
    expect(res.purchaseDate).toBe(getTodayDateString());
  });

  it('searches the store catalog for "pipe" and returns relevant Home Depot & Lowe\'s pipe tools', () => {
    const results = searchStoreCatalog('pipe');
    expect(results.length).toBeGreaterThan(0);
    const top = results[0];
    expect(top.success).toBe(true);
    expect(top.name.toLowerCase()).toContain('pipe');
    expect(['Home Depot', "Lowe's"]).toContain(top.retailer);
    expect(top.purchasePrice).toBeGreaterThan(0);
    expect(top.imageUrl).toBeTruthy();
  });

  it('searches for "drill" and returns cordless drills from DEWALT and Milwaukee', () => {
    const results = searchStoreCatalog('drill');
    expect(results.length).toBeGreaterThan(0);
    const brands = results.map((r) => r.brand);
    expect(brands).toContain('DEWALT');
    expect(results[0].category).toBe('Power Tools');
  });

  it('searches for "bandsaw" and returns Milwaukee Deep Cut Band Saw', () => {
    const results = searchStoreCatalog('bandsaw');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toContain('Band Saw');
    expect(results[0].brand).toBe('Milwaukee');
  });

  it('searches for "multimeter" and returns Klein Tools MM400', () => {
    const results = searchStoreCatalog('multimeter');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].brand).toContain('Klein');
  });

  it('correctly handles parseStoreProductUrl for keyword search "pipe"', () => {
    const res = parseStoreProductUrl('pipe');
    expect(res.success).toBe(true);
    expect(res.name.toLowerCase()).toContain('pipe');
    expect(res.brand).not.toBe('Commercial Brand'); // Must NOT be fake fallback
  });

  it('gracefully handles completely unmatched query', () => {
    const res = parseStoreProductUrl('xyzqwer1234notatool');
    expect(res.success).toBe(false);
  });
});
