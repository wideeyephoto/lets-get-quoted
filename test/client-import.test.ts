import { describe, it, expect } from 'vitest';
import {
  parseCsv,
  parseClientCsv,
  parseTable,
  applyMapping,
  deterministicMapping,
  positionalMapping,
  columnLabels,
  type ColumnMapping,
} from '@/lib/client-import';

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

describe('parseTable — delimiter detection', () => {
  it('parses tab-separated data (an Excel/Sheets paste)', () => {
    expect(parseTable('name\tphone\nJane\t2485550199')).toEqual([
      ['name', 'phone'],
      ['Jane', '2485550199'],
    ]);
  });

  it('parses semicolon-separated data', () => {
    expect(parseTable('name;email\nJane;jane@x.com')).toEqual([
      ['name', 'email'],
      ['Jane', 'jane@x.com'],
    ]);
  });

  it('still parses commas, and keeps commas inside quotes', () => {
    expect(parseTable('name,address\nJane,"1 Maple, Royal Oak MI"')).toEqual([
      ['name', 'address'],
      ['Jane', '1 Maple, Royal Oak MI'],
    ]);
  });
});

describe('applyMapping — composing fields from columns', () => {
  it('joins split First + Last into name and street/city/state/zip into address', () => {
    // Columns: 0 First, 1 Last, 2 Phone, 3 Street, 4 City, 5 State, 6 Zip
    const grid = [
      ['First', 'Last', 'Phone', 'Street', 'City', 'State', 'Zip'],
      ['Jane', 'Homeowner', '248-555-0199', '1418 Maplewood Ave', 'Royal Oak', 'MI', '48067'],
    ];
    const mapping: ColumnMapping = {
      hasHeader: true,
      sources: { name: [0, 1], phone: [2], email: [], address: [3, 4, 5, 6] },
    };
    expect(applyMapping(grid, mapping)).toEqual([
      { name: 'Jane Homeowner', phone: '248-555-0199', email: null, address: '1418 Maplewood Ave, Royal Oak, MI, 48067' },
    ]);
  });

  it('takes the first non-empty phone when several phone columns are mapped', () => {
    const grid = [
      ['Name', 'Home', 'Cell'],
      ['Mike Ross', '', '313-555-0142'],
    ];
    const mapping: ColumnMapping = {
      hasHeader: true,
      sources: { name: [0], phone: [1, 2], email: [], address: [] },
    };
    expect(applyMapping(grid, mapping)[0]).toEqual({ name: 'Mike Ross', phone: '313-555-0142', email: null, address: null });
  });

  it('drops rows with no name, phone, or email', () => {
    const grid = [
      ['Jane', '248-555-0199', ''],
      ['', '', ''],
    ];
    const mapping: ColumnMapping = {
      hasHeader: false,
      sources: { name: [0], phone: [1], email: [2], address: [] },
    };
    expect(applyMapping(grid, mapping)).toHaveLength(1);
  });
});

describe('deterministicMapping — confident header only', () => {
  it('maps a clear header with a name and a contact column', () => {
    const grid = [['Full Name', 'Phone Number', 'Email'], ['Jane', '248-555-0199', 'jane@x.com']];
    expect(deterministicMapping(grid)).toEqual({
      hasHeader: true,
      sources: { name: [0], phone: [1], email: [2], address: [] },
    });
  });

  it('returns null when the header has no recognizable contact column (escalate to AI)', () => {
    const grid = [['Client', 'Notes'], ['Jane', 'nice yard']];
    expect(deterministicMapping(grid)).toBeNull();
  });

  it('returns null when the first row is data, not a header', () => {
    const grid = [['Bob Vila', '5175550000', 'bob@x.com']];
    expect(deterministicMapping(grid)).toBeNull();
  });
});

describe('positionalMapping + columnLabels', () => {
  it('reads columns positionally as name, phone, email, address', () => {
    const grid = [['Jane', '248-555-0199', 'jane@x.com', '1 Maple']];
    expect(positionalMapping(grid)).toEqual({
      hasHeader: false,
      sources: { name: [0], phone: [1], email: [2], address: [3] },
    });
  });

  it('labels columns by header title, falling back to "Column N"', () => {
    const grid = [['Full Name', '', 'Email'], ['Jane', 'x', 'jane@x.com']];
    expect(columnLabels(grid, true)).toEqual(['Full Name', 'Column 2', 'Email']);
    expect(columnLabels(grid, false)).toEqual(['Column 1', 'Column 2', 'Column 3']);
  });
});
