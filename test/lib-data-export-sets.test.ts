import { describe, it, expect } from 'vitest';
import { parseExportSets, exportArchiveName } from '@/lib/data-export-sets';

describe('Data Export Sets Lib', () => {
  describe('parseExportSets', () => {
    it('returns all sets if empty', () => {
      const all = ['clients', 'services', 'jobs', 'invoices'];
      expect(parseExportSets('')).toEqual(all);
      expect(parseExportSets(null)).toEqual(all);
      expect(parseExportSets(undefined)).toEqual(all);
    });

    it('returns requested sets', () => {
      expect(parseExportSets('clients,jobs')).toEqual(['clients', 'jobs']);
    });

    it('ignores unknown sets', () => {
      expect(parseExportSets('clients,unknown,jobs')).toEqual(['clients', 'jobs']);
    });

    it('returns all if none of the requested sets match', () => {
      const all = ['clients', 'services', 'jobs', 'invoices'];
      expect(parseExportSets('unknown,bogus')).toEqual(all);
    });

    it('handles whitespace', () => {
      expect(parseExportSets(' clients ,  jobs  ')).toEqual(['clients', 'jobs']);
    });
  });

  describe('exportArchiveName', () => {
    it('returns formatted name', () => {
      expect(exportArchiveName('2023-01-01')).toBe('letsgetquoted-export-2023-01-01.zip');
    });
  });
});
