import { describe, it, expect } from 'vitest';
import { toClientRows } from '@/lib/client-rows';

describe('Client Rows Lib', () => {
  describe('toClientRows', () => {
    it('handles empty clients array', () => {
      expect(toClientRows([])).toEqual([]);
    });

    it('formats a client row correctly', () => {
      const rows = toClientRows([{
        id: '1',
        name: 'John Doe',
        phone: '1234567890',
        email: 'test@example.com',
        address: '123 Main St',
        jobCount: 2,
        totalValue: 50000,
        lastJobAt: '2023-01-01',
        nextJobAt: null,
        lastVisitAt: null,
        unscheduledJobs: 0
      } as any]);

      expect(rows.length).toBe(1);
      const row = rows[0];
      
      expect(row.id).toBe('1');
      expect(row.initials).toBe('JD');
      expect(row.isRepeat).toBe(true);
      expect(row.phoneLabel).toBe('123-456-7890');
      expect(row.contactLine).toBe('123-456-7890 · test@example.com');
      expect(row.jobsLabel).toBe('2 jobs');
      expect(row.totalLabel).toBe('$50,000');
      expect(row.lastLabel).toMatch(/Jan 1, 2023|Dec 31, 2022/);
      expect(row.search).toContain('john doe');
      expect(row.search).toContain('1234567890');
      expect(row.search).toContain('test@example.com');
    });

    it('handles missing data', () => {
      const rows = toClientRows([{
        id: '2',
        name: 'Jane',
        phone: null,
        email: null,
        address: null,
        jobCount: 1,
        totalValue: 0,
        lastJobAt: null,
      } as any]);

      expect(rows[0].initials).toBe('J');
      expect(rows[0].isRepeat).toBe(false);
      expect(rows[0].contactLine).toBe('No contact on file');
      expect(rows[0].jobsLabel).toBe('1 job');
      expect(rows[0].lastLabel).toBe('—');
    });
  });
});
