import { describe, it, expect } from 'vitest';
import { gridToCsv, parseVcards, vcardsToCsv } from '@/lib/import-formats';
import { parseClientCsv } from '@/lib/client-import';

describe('gridToCsv', () => {
  it('serializes a simple grid', () => {
    expect(gridToCsv([['a', 'b'], ['1', '2']])).toBe('a,b\n1,2');
  });

  it('quotes cells with commas, quotes, or newlines and doubles quotes', () => {
    expect(gridToCsv([['x', '1 Maple, Royal Oak'], ['y', 'she said "hi"']])).toBe(
      'x,"1 Maple, Royal Oak"\ny,"she said ""hi"""',
    );
  });

  it('round-trips back through parseClientCsv', () => {
    const csv = gridToCsv([
      ['name', 'phone', 'email', 'address'],
      ['Jane Homeowner', '248-555-0199', 'jane@x.com', '1 Maple, Royal Oak MI'],
    ]);
    const { rows } = parseClientCsv(csv);
    expect(rows[0]).toEqual({ name: 'Jane Homeowner', phone: '248-555-0199', email: 'jane@x.com', address: '1 Maple, Royal Oak MI' });
  });
});

describe('parseVcards', () => {
  const vcf = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'FN:Jane Homeowner',
    'TEL;TYPE=CELL:(248) 555-0199',
    'EMAIL;TYPE=INTERNET:jane@email.com',
    'ADR;TYPE=HOME:;;1418 Maplewood Ave;Royal Oak;MI;48067;USA',
    'END:VCARD',
    'BEGIN:VCARD',
    'VERSION:3.0',
    'N:Ross;Mike;;;',
    'TEL:313-555-0142',
    'END:VCARD',
  ].join('\r\n');

  it('reads FN, first TEL/EMAIL, and joins the structured address', () => {
    const [jane] = parseVcards(vcf);
    expect(jane).toEqual({
      name: 'Jane Homeowner',
      phone: '(248) 555-0199',
      email: 'jane@email.com',
      address: '1418 Maplewood Ave, Royal Oak, MI, 48067, USA',
    });
  });

  it('builds a name from N when there is no FN, and leaves missing fields null', () => {
    const mike = parseVcards(vcf)[1];
    expect(mike).toEqual({ name: 'Mike Ross', phone: '313-555-0142', email: null, address: null });
  });

  it('unfolds continuation lines', () => {
    const folded = 'BEGIN:VCARD\r\nFN:Alexandra\r\n  Del Rio\r\nTEL:5550001\r\nEND:VCARD';
    expect(parseVcards(folded)[0].name).toBe('Alexandra Del Rio');
  });

  it('vcardsToCsv produces a header the client importer maps without AI', () => {
    const csv = vcardsToCsv(vcf);
    const { rows, headerUsed } = parseClientCsv(csv);
    expect(headerUsed).toBe(true);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Jane Homeowner');
  });
});
