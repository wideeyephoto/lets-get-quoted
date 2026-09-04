import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SERVICE_FIELDS } from '@/lib/import-fields';
import { importServices } from '@/lib/services';
import { deterministicGenericMapping } from '@/lib/smart-import';
import { priceBookItemsToCsv, normalizePriceBookOcr } from '@/lib/price-book-ocr';

describe('Services Price Book Remediation Suite', () => {
  describe('1. TradeCatalogHub Cleanup & Dark Mode (Issues 1-4)', () => {
    const hubContent = fs.readFileSync(
      path.resolve(__dirname, '../src/app/dashboard/services/TradeCatalogHub.tsx'),
      'utf-8'
    );

    it('cuts the dead-end estimator calculator tab and assembly calculations', () => {
      expect(hubContent).not.toContain('estimator_calculator');
      expect(hubContent).not.toContain('calculateMultiTierProposal');
      expect(hubContent).not.toContain('MOST POPULAR');
      expect(hubContent).not.toContain('Mansard / Complex');
    });

    it('cuts the simulated distributor master SKU catalog tab', () => {
      expect(hubContent).not.toContain('sku_catalog');
      expect(hubContent).not.toContain('dispatchOrderToABCSupply');
      expect(hubContent).not.toContain('Pre-mapped distributor part numbers');
      expect(hubContent).not.toContain('MASTER_TRADE_SKUS');
    });

    it('does not contain hardcoded light hex backgrounds or broken white-on-white table headers', () => {
      expect(hubContent).not.toContain("background: '#f1f5f9'");
      expect(hubContent).not.toContain("background: '#eff6ff'");
      expect(hubContent).not.toContain("background: '#f8fafc'");
      expect(hubContent).not.toContain("color: '#0f172a'");
      expect(hubContent).not.toContain("color: 'var(--text-muted, #64748b)'");
      expect(hubContent).toContain("color: 'var(--muted)'");
    });

    it('preserves the 21 trade starter packs with search capability', () => {
      expect(hubContent).toContain('TRADE_STARTER_CATALOGS');
      expect(hubContent).toContain('searchQuery');
      expect(hubContent).toContain('onLoadStarterPack');
      expect(hubContent).toContain('Trade Starter Packs');
    });
  });

  describe('2. Services Page Deduplication & Spelling (Issues 5 & 7)', () => {
    const pageContent = fs.readFileSync(
      path.resolve(__dirname, '../src/app/dashboard/services/page.tsx'),
      'utf-8'
    );

    it('eliminates the duplicate 21-pack starter pack section at the bottom of the page', () => {
      expect(pageContent).not.toContain('⚡ Add Trade Starter Packs');
      expect(pageContent).not.toContain('listTradeStarterCatalogs()');
    });

    it('corrects British spelling "labour" to standard US English "labor"', () => {
      expect(pageContent).not.toContain('Materials and labour');
      expect(pageContent).toContain('Materials and labor');
    });
  });

  describe('3. Import and AI OCR Cost Support (Issue 6)', () => {
    it('declares unit_cost in SERVICE_FIELDS with proper keywords', () => {
      const costField = SERVICE_FIELDS.find((f) => f.key === 'unit_cost');
      expect(costField).toBeDefined();
      expect(costField?.label).toBe('Your cost');
      expect(costField?.keywords).toContain('cost');
      expect(costField?.keywords).toContain('unit cost');
      expect(costField?.keywords).toContain('wholesale');
    });

    it('maps Cost column to unit_cost in CSV imports', () => {
      const grid = [
        ['Service', 'Price', 'Your Cost', 'Per', 'Description'],
        ['Gutter Cleaning', '180', '65', 'each', 'Clean gutters'],
      ];
      const mapping = deterministicGenericMapping(grid, SERVICE_FIELDS);
      expect(mapping?.sources.unit_price).toEqual([1]);
      expect(mapping?.sources.unit_cost).toEqual([2]);
    });

    it('importServices writes unit_cost when supplied', async () => {
      let insertedRecords: any[] = [];
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols === 'id') {
              return Promise.resolve({ data: [{ id: 'mock-1' }], error: null });
            }
            return {
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            };
          }),
          insert: vi.fn().mockImplementation((rows: any[]) => {
            insertedRecords = rows;
            return {
              select: vi.fn().mockResolvedValue({ data: rows.map((_, i) => ({ id: `id-${i}` })), error: null }),
            };
          }),
        }),
      } as any;

      const result = await importServices(mockSupabase, 'acc-123', [
        { name: 'Toilet Install', description: 'Install new toilet', unitPrice: 260, unitCost: 65, unit: 'each' },
        { name: 'Uncosted Diagnostic', description: 'Inspect lines', unitPrice: 95, unitCost: null, unit: 'hour' },
      ]);

      expect(result.imported).toBe(2);
      expect(insertedRecords.length).toBe(2);
      expect(insertedRecords[0].name).toBe('Toilet Install');
      expect(insertedRecords[0].unit_price).toBe(260);
      expect(insertedRecords[0].unit_cost).toBe(65);

      // Null cost preserved as null so margin shows "—" rather than false 100%
      expect(insertedRecords[1].name).toBe('Uncosted Diagnostic');
      expect(insertedRecords[1].unit_price).toBe(95);
      expect(insertedRecords[1].unit_cost).toBeNull();
    });

    it('preserves cost in priceBookItemsToCsv and normalizePriceBookOcr', () => {
      const ocrRaw = {
        items: [
          { name: 'Main Water Valve', unit_price: '$280.00', unit_cost: '$90.00', unit: 'each' },
        ],
        confidence: 0.95,
      };
      const normalized = normalizePriceBookOcr(ocrRaw);
      expect(normalized.items[0].unit_cost).toBe(90);
      expect(normalized.rawCsv).toContain('Main Water Valve,280,90,each,');
    });
  });
});
