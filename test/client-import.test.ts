import { describe, it, expect } from 'vitest';
import { parseCsv, parseClientCsv } from '@/lib/client-import';

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles quoted fields with commas and escaped quotes', () => {
    expect(parseCsv('name,note\n"Smith, Jane","she said ""hi"""')).toEqual([
      ['name', 'note'],
      ['Smith, Jane', 'she said "hi"'],
    ]);
  });

  it('handles newlines inside quotes and CRLF line endings', () => {
    expect(parseCsv('a,b\r\n"line1\nline2",z')).toEqual([
      ['a', 'b'],
      ['line1\nline2', 'z'],
    ]);
  });

  it('drops wholly-empty rows (e.g. a trailing newline)', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('parseClientCsv — header detection', () => {
  it('maps named header columns in any order', () => {
    const csv = 'Email,Full Name,Phone Number,Street Address\njane@x.com,Jane Homeowner,248-555-0199,"1 Maple, Royal Oak MI"';
    const { rows, headerUsed } = parseClientCsv(csv);
    expect(headerUsed).toBe(true);
    expect(rows).toEqual([
      { name: 'Jane Homeowner', phone: '248-555-0199', email: 'jane@x.com', address: '1 Maple, Royal Oak MI' },
    ]);
  });

  it('reads positionally (name, phone, email, address) when there is no header', () => {
    const csv = 'Jane Homeowner,248-555-0199,jane@x.com,1 Maple St\nMike Ross,313-555-0142,mike@x.com,';
    const { rows, headerUsed } = parseClientCsv(csv);
    expect(headerUsed).toBe(false);
    expect(rows[0]).toEqual({ name: 'Jane Homeowner', phone: '248-555-0199', email: 'jane@x.com', address: '1 Maple St' });
    expect(rows[1]).toEqual({ name: 'Mike Ross', phone: '313-555-0142', email: 'mike@x.com', address: null });
  });

  it('treats a first row containing digits/@ as data, not a header', () => {
    // No header line — the very first row is a real customer.
    const { rows, headerUsed } = parseClientCsv('Bob Vila,5175550000,bob@x.com,10 Oak');
    expect(headerUsed).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Bob Vila');
  });

  it('skips wholly-empty data rows but keeps rows with only a name', () => {
    const csv = 'name,phone,email\nJane,,\n,,\nMike,313-555-0142,';
    const { rows } = parseClientCsv(csv);
    expect(rows.map((r) => r.name)).toEqual(['Jane', 'Mike']);
  });

  it('returns nothing for empty input', () => {
    expect(parseClientCsv('').rows).toEqual([]);
    expect(parseClientCsv('   \n  ').rows).toEqual([]);
  });
});
