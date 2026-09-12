import { describe, it, expect, vi } from 'vitest';
import { readImportFile } from '@/lib/read-import-file';
import * as importFormatsModule from '@/lib/import-formats';

vi.mock('@/lib/import-formats', () => ({
  gridToCsv: vi.fn((grid) => grid.map(r => r.join(',')).join('\n')),
  vcardsToCsv: vi.fn((vcard) => `vcard_csv:${vcard}`),
}));

vi.mock('read-excel-file/browser', () => ({
  default: vi.fn(async () => [
    ['Name', 'Age', 'Date'],
    ['John', 30, new Date('2023-01-01T00:00:00Z')],
    [null, undefined, false]
  ]),
}));

describe('Read Import File Lib', () => {
  it('reads vcf files', async () => {
    const file = new File(['BEGIN:VCARD'], 'contacts.vcf', { type: 'text/vcard' });
    const res = await readImportFile(file);
    expect(res).toBe('vcard_csv:BEGIN:VCARD');
  });

  it('reads xlsx files', async () => {
    const file = new File(['dummy xlsx data'], 'contacts.xlsx');
    const res = await readImportFile(file);
    
    // Check cellToString conversions
    const lines = res.split('\n');
    expect(lines[0]).toBe('Name,Age,Date');
    expect(lines[1]).toBe('John,30,2023-01-01');
    expect(lines[2]).toBe(',,false');
  });

  it('reads fallback text files', async () => {
    const file = new File(['a,b,c\n1,2,3'], 'contacts.csv');
    const res = await readImportFile(file);
    expect(res).toBe('a,b,c\n1,2,3');
  });
});
