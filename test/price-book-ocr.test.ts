import { describe, it, expect } from 'vitest';
import {
  priceBookItemsToCsv,
  normalizePriceBookOcr,
  readPriceBookOcr,
  type PriceBookOcrItem,
} from '@/lib/price-book-ocr';

describe('priceBookItemsToCsv', () => {
  it('formats clean CSV with standard headers', () => {
    const items: PriceBookOcrItem[] = [
      { name: 'Standard Service Call', unit_price: 125, unit: 'visit', description: 'Diagnostic inspection' },
      { name: '50-Gal Water Heater Install', unit_price: 1450, unit: 'job', description: 'Labor and standard fittings included' },
    ];
    const csv = priceBookItemsToCsv(items);
    expect(csv).toBe(
      'Name,Price,Unit,Description\n' +
      'Standard Service Call,125,visit,Diagnostic inspection\n' +
      '50-Gal Water Heater Install,1450,job,Labor and standard fittings included'
    );
  });

  it('escapes quotes, commas, and special characters properly in CSV', () => {
    const items: PriceBookOcrItem[] = [
      { name: 'Panel Upgrade, 200A (Square "D")', unit_price: 2200, unit: 'each', description: 'Includes main breaker, ground rods & permits' },
    ];
    const csv = priceBookItemsToCsv(items);
    expect(csv).toContain('"Panel Upgrade, 200A (Square ""D"")",2200,each,"Includes main breaker, ground rods & permits"');
  });

  it('handles null and missing price/unit/description values', () => {
    const items: PriceBookOcrItem[] = [
      { name: 'Custom Fabrication', unit_price: null, unit: null, description: null },
    ];
    const csv = priceBookItemsToCsv(items);
    expect(csv).toBe('Name,Price,Unit,Description\nCustom Fabrication,,each,');
  });
});

describe('normalizePriceBookOcr', () => {
  it('normalizes valid raw JSON items and unit variations', () => {
    const raw = {
      items: [
        { name: 'Emergency Dispatch', unit_price: '$175.00', unit: 'per visit', description: 'After-hours triage' },
        { name: 'Hardwood Flooring Install', unit_price: 8.5, unit: 'per sq ft', description: 'Nail-down installation' },
        { name: 'Master Electrician Labor', unit_price: 110, unit: 'hourly', description: 'Troubleshooting rate' },
        { name: 'Ceiling Fan Replacement', unit_price: 185, unit: 'flat rate', description: null },
        { name: 'Faucet Replacement', unit_price: 150, unit: 'each' },
        { name: '', unit_price: 99 }, // empty name -> dropped
      ],
      confidence: 0.95,
      unreadable: [],
    };

    const result = normalizePriceBookOcr(raw);
    expect(result.items.length).toBe(5);
    expect(result.confidence).toBe(0.95);

    expect(result.items[0]).toEqual({
      name: 'Emergency Dispatch',
      unit_price: 175,
      unit: 'visit',
      description: 'After-hours triage',
    });

    expect(result.items[1].unit).toBe('sqft');
    expect(result.items[1].unit_price).toBe(8.5);

    expect(result.items[2].unit).toBe('hour');
    expect(result.items[3].unit).toBe('job');
    expect(result.items[4].unit).toBe('each');

    expect(result.rawCsv).toContain('Emergency Dispatch,175,visit,After-hours triage');
  });

  it('handles empty or malformed input safely', () => {
    const result = normalizePriceBookOcr(null);
    expect(result.items).toEqual([]);
    expect(result.confidence).toBe(0.8);
    expect(result.rawCsv).toBe('Name,Price,Unit,Description');
  });

  it('clamps confidence to [0, 1] range', () => {
    expect(normalizePriceBookOcr({ confidence: 1.5 }).confidence).toBe(1);
    expect(normalizePriceBookOcr({ confidence: -0.2 }).confidence).toBe(0);
  });
});

describe('readPriceBookOcr', () => {
  it('returns null when dataUrl is not an image', async () => {
    const res = await readPriceBookOcr({ dataUrl: 'data:text/plain;base64,invalid' });
    expect(res).toBeNull();
  });
});
