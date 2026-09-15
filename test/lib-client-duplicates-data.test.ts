import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listDuplicateDismissals } from '@/lib/client-duplicates-data';

describe('Client Duplicates Data Lib', () => {
  let adminMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    adminMock = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    };
  });

  describe('listDuplicateDismissals', () => {
    it('returns empty set on error', async () => {
      adminMock.eq.mockResolvedValue({ data: null, error: new Error('fail') });
      const res = await listDuplicateDismissals(adminMock, 'acct_1');
      expect(res.size).toBe(0);
    });

    it('returns set of member keys', async () => {
      adminMock.eq.mockResolvedValue({ data: [{ member_key: 'key1' }, { member_key: 'key2' }] });
      const res = await listDuplicateDismissals(adminMock, 'acct_1');
      expect(res.size).toBe(2);
      expect(res.has('key1')).toBe(true);
      expect(res.has('key2')).toBe(true);
    });
  });
});
