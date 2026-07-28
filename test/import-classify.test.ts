import { describe, it, expect } from 'vitest';
import { classifyGrid, roughRowCount } from '@/lib/import-classify';

const h = (header: string[], ...data: string[][]): string[][] => [header, ...data];

describe('classifyGrid', () => {
  it('classifies a contact list as clients', () => {
    expect(classifyGrid(h(['Name', 'Phone', 'Email', 'Address']))).toBe('clients');
  });

  it('classifies a price list as services', () => {
    expect(classifyGrid(h(['Service', 'Unit Price', 'Unit']))).toBe('services');
    expect(classifyGrid(h(['Item', 'Rate']))).toBe('services');
  });

  it('classifies a jobs export by scope/job words', () => {
    expect(classifyGrid(h(['Customer', 'Address', 'Scope', 'Status', 'Date', 'Amount']))).toBe('jobs');
  });

  it('classifies an invoice list — by an explicit invoice word or customer+money', () => {
    expect(classifyGrid(h(['Customer', 'Invoice #', 'Date', 'Total', 'Status']))).toBe('invoices');
    expect(classifyGrid(h(['Customer', 'Date', 'Amount', 'Paid']))).toBe('invoices');
  });

  it('does not misread a "unit price" service header as a price/invoice list', () => {
    // has no phone/email + a price/unit -> services, not invoices
    expect(classifyGrid(h(['Product', 'Unit Price']))).toBe('services');
  });

  it('defaults a headerless / unrecognized file to clients', () => {
    expect(classifyGrid([['Jane Doe', '248-555-0100', 'jane@x.com']])).toBe('clients');
  });
});

describe('roughRowCount', () => {
  it('counts data rows, excluding a detected header', () => {
    expect(roughRowCount(h(['Name', 'Phone'], ['Jane', '1'], ['Mike', '2']))).toBe(2);
  });
  it('counts every row when there is no header', () => {
    expect(roughRowCount([['Jane', '248-555-0100'], ['Mike', '313-555-0100']])).toBe(2);
  });
});
