import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDayPlanPrefs, savePreferredLast, NO_PREFS } from '@/lib/day-plan-prefs';

describe('Day Plan Prefs Lib', () => {
  let supabaseMock: any;
  let queryMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    queryMock = {
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    supabaseMock = {
      from: vi.fn(() => queryMock),
    };
    
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('getDayPlanPrefs', () => {
    it('returns empty if missing table', async () => {
      queryMock.maybeSingle.mockResolvedValue({ error: { code: '42P01' } });
      const res = await getDayPlanPrefs(supabaseMock, 'acct_1', '2023-01-01', null);
      expect(res).toEqual(NO_PREFS);
    });

    it('returns empty on error and logs', async () => {
      queryMock.maybeSingle.mockResolvedValue({ error: { code: '500', message: 'fail' } });
      const res = await getDayPlanPrefs(supabaseMock, 'acct_1', '2023-01-01', 'crew_1');
      expect(res).toEqual(NO_PREFS);
      expect(console.error).toHaveBeenCalled();
    });

    it('returns preferred last id', async () => {
      queryMock.maybeSingle.mockResolvedValue({ data: { preferred_last_id: 'job_1' } });
      const res = await getDayPlanPrefs(supabaseMock, 'acct_1', '2023-01-01', 'crew_1');
      expect(res).toEqual({ preferredLastId: 'job_1' });
    });
  });

  describe('savePreferredLast', () => {
    it('deletes row when clearing preference', async () => {
      queryMock.is.mockResolvedValue({ error: null });
      await savePreferredLast(supabaseMock, 'acct_1', '2023-01-01', null, null);
      expect(queryMock.delete).toHaveBeenCalled();
    });

    it('handles delete error gracefully', async () => {
      queryMock.is.mockResolvedValue({ error: { code: '500', message: 'fail' } });
      await savePreferredLast(supabaseMock, 'acct_1', '2023-01-01', null, null);
      expect(console.error).toHaveBeenCalled();
    });

    it('updates existing row successfully', async () => {
      queryMock.select.mockResolvedValue({ data: [{ id: '1' }], error: null });
      await savePreferredLast(supabaseMock, 'acct_1', '2023-01-01', 'crew_1', 'job_1');
      expect(queryMock.update).toHaveBeenCalled();
      expect(queryMock.insert).not.toHaveBeenCalled();
    });

    it('throws error if update fails', async () => {
      queryMock.select.mockResolvedValue({ data: null, error: { code: '500', message: 'fail' } });
      await expect(savePreferredLast(supabaseMock, 'acct_1', '2023-01-01', 'crew_1', 'job_1')).rejects.toThrow('Could not save that last stop.');
    });

    it('throws custom error if missing table on update', async () => {
      queryMock.select.mockResolvedValue({ data: null, error: { code: '42P01', message: 'fail' } });
      await expect(savePreferredLast(supabaseMock, 'acct_1', '2023-01-01', 'crew_1', 'job_1')).rejects.toThrow('Remembering a last stop needs the day-plan-prefs migration');
    });

    it('inserts if update touches zero rows', async () => {
      queryMock.select.mockResolvedValue({ data: [], error: null });
      queryMock.insert.mockResolvedValue({ error: null });
      await savePreferredLast(supabaseMock, 'acct_1', '2023-01-01', 'crew_1', 'job_1');
      expect(queryMock.insert).toHaveBeenCalled();
    });

    it('throws if missing table on insert', async () => {
      queryMock.select.mockResolvedValue({ data: [], error: null });
      queryMock.insert.mockResolvedValue({ error: { code: '42P01' } });
      await expect(savePreferredLast(supabaseMock, 'acct_1', '2023-01-01', 'crew_1', 'job_1')).rejects.toThrow('Remembering a last stop needs the day-plan-prefs migration');
    });

    it('throws if generic error on insert', async () => {
      queryMock.select.mockResolvedValue({ data: [], error: null });
      queryMock.insert.mockResolvedValue({ error: { code: '500', message: 'fail' } });
      await expect(savePreferredLast(supabaseMock, 'acct_1', '2023-01-01', 'crew_1', 'job_1')).rejects.toThrow('Could not save that last stop.');
    });

    it('retries update on unique violation during insert', async () => {
      let selectCallCount = 0;
      queryMock.select.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) return Promise.resolve({ data: [], error: null });
        if (selectCallCount === 2) return Promise.resolve({ data: [{ id: '2' }], error: null });
      });
      queryMock.insert.mockResolvedValue({ error: { code: '23505' } }); // unique violation

      await savePreferredLast(supabaseMock, 'acct_1', '2023-01-01', 'crew_1', 'job_1');
      expect(queryMock.update).toHaveBeenCalledTimes(2);
      expect(queryMock.insert).toHaveBeenCalledTimes(1);
    });

    it('throws if retry fails', async () => {
      let selectCallCount = 0;
      queryMock.select.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) return Promise.resolve({ data: [], error: null });
        if (selectCallCount === 2) return Promise.resolve({ data: null, error: { message: 'fail' } });
      });
      queryMock.insert.mockResolvedValue({ error: { code: '23505' } }); // unique violation

      await expect(savePreferredLast(supabaseMock, 'acct_1', '2023-01-01', 'crew_1', 'job_1')).rejects.toThrow('Could not save that last stop.');
    });
  });
});
