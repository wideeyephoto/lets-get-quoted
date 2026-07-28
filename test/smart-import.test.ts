import { describe, it, expect } from 'vitest';
import {
  applyGenericMapping,
  deterministicGenericMapping,
  positionalGenericMapping,
  parseMoney,
  type ImportField,
} from '@/lib/smart-import';

const SERVICE_FIELDS: ImportField[] = [
  { key: 'name', label: 'Name', keywords: ['name', 'service', 'item'], hint: '', required: true },
  { key: 'unit_price', label: 'Price', keywords: ['unit price', 'price', 'rate', 'cost'], hint: '' },
  { key: 'unit', label: 'Unit', keywords: ['unit', 'per'], hint: '' },
  { key: 'description', label: 'Description', keywords: ['description', 'notes'], hint: '' },
];

describe('deterministicGenericMapping', () => {
  it('maps a clear header and stays confident when the required field is present', () => {
    const grid = [['Service', 'Unit Price', 'Unit'], ['Mowing', '45', 'visit']];
    expect(deterministicGenericMapping(grid, SERVICE_FIELDS)).toEqual({
      hasHeader: true,
      sources: { name: [0], unit_price: [1], unit: [2], description: [] },
    });
  });

  it('maps "Unit Price" to price (not unit) because unit_price is declared first', () => {
    const grid = [['Item', 'Unit Price'], ['Mowing', '45']];
    const m = deterministicGenericMapping(grid, SERVICE_FIELDS);
    expect(m?.sources.unit_price).toEqual([1]);
    expect(m?.sources.unit).toEqual([]);
  });

  it('returns null when the required field is not matched (escalate to AI)', () => {
    const grid = [['Price', 'Notes'], ['45', 'weekly']];
    expect(deterministicGenericMapping(grid, SERVICE_FIELDS)).toBeNull();
  });

  it('returns null when the first row looks like data', () => {
    expect(deterministicGenericMapping([['Mowing', '45']], SERVICE_FIELDS)).toBeNull();
  });
});

describe('applyGenericMapping', () => {
  it('composes fields and drops rows missing every required field', () => {
    const grid = [
      ['Service', 'Price', 'Unit'],
      ['Weekly Mow', '$45.00', 'visit'],
      ['', '99', 'each'], // no name -> dropped (name is required)
    ];
    const mapping = { hasHeader: true, sources: { name: [0], unit_price: [1], unit: [2], description: [] } };
    const rows = applyGenericMapping(grid, SERVICE_FIELDS, mapping);
    expect(rows).toEqual([{ name: 'Weekly Mow', unit_price: '$45.00', unit: 'visit', description: null }]);
  });

  it("respects a field's compose mode (comma-joins an address-style field)", () => {
    const fields: ImportField[] = [
      { key: 'name', label: 'Name', keywords: ['name'], hint: '', required: true },
      { key: 'address', label: 'Address', keywords: ['addr'], hint: '', compose: 'comma' },
    ];
    const grid = [['Acme', '12 Oak', 'Troy', 'MI']];
    const mapping = { hasHeader: false, sources: { name: [0], address: [1, 2, 3] } };
    expect(applyGenericMapping(grid, fields, mapping)[0]).toEqual({ name: 'Acme', address: '12 Oak, Troy, MI' });
  });
});

describe('positionalGenericMapping', () => {
  it('reads columns in field-declaration order', () => {
    const grid = [['Mowing', '45', 'visit']];
    expect(positionalGenericMapping(grid, SERVICE_FIELDS)).toEqual({
      hasHeader: false,
      sources: { name: [0], unit_price: [1], unit: [2], description: [] },
    });
  });
});

describe('parseMoney', () => {
  it('strips currency formatting and rounds to cents', () => {
    expect(parseMoney('$1,250.509')).toBe(1250.51);
    expect(parseMoney('45')).toBe(45);
    expect(parseMoney(null)).toBe(0);
    expect(parseMoney('free')).toBe(0);
  });
});
