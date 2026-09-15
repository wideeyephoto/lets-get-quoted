import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setCrewJobStatus } from '@/lib/crew-job-status';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

describe('Crew Job Status Lib', () => {
  let supabaseMock: any;
  let adminMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    supabaseMock = {
      rpc: vi.fn(),
    };

    adminMock = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null })
        })
      }),
    };

    const createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    (createAdminClientMock as any).mockReturnValue(adminMock);
  });

  describe('setCrewJobStatus', () => {
    it('uses rpc successfully', async () => {
      supabaseMock.rpc.mockResolvedValue({ error: null });
      await expect(setCrewJobStatus(supabaseMock, 'acct_1', 'job_1', 'in_progress')).resolves.toBeUndefined();
      expect(supabaseMock.rpc).toHaveBeenCalledWith('crew_set_job_status', { j: 'job_1', new_status: 'in_progress' });
    });

    it('throws real rpc error', async () => {
      supabaseMock.rpc.mockResolvedValue({ error: { message: 'Not allowed' } });
      await expect(setCrewJobStatus(supabaseMock, 'acct_1', 'job_1', 'in_progress')).rejects.toThrow('Not allowed');
    });

    it('falls back to admin if missing function', async () => {
      supabaseMock.rpc.mockResolvedValue({ error: { code: 'PGRST202' } }); // missing function
      
      adminMock.maybeSingle.mockResolvedValue({ data: { status: 'scheduled', started_at: null } });

      await setCrewJobStatus(supabaseMock, 'acct_1', 'job_1', 'in_progress');
      
      expect(adminMock.select).toHaveBeenCalledWith('status, started_at');
      expect(adminMock.update).toHaveBeenCalled();
      
      const updateArgs = adminMock.update.mock.calls[0][0];
      expect(updateArgs.status).toBe('in_progress');
      expect(updateArgs.started_at).toBeDefined(); // should stamp since it was null
    });

    it('does not restamp started_at on fallback', async () => {
      supabaseMock.rpc.mockResolvedValue({ error: { code: 'PGRST202' } }); // missing function
      
      adminMock.maybeSingle.mockResolvedValue({ data: { status: 'in_progress', started_at: '2023-01-01' } });

      await setCrewJobStatus(supabaseMock, 'acct_1', 'job_1', 'complete');
      
      const updateArgs = adminMock.update.mock.calls[0][0];
      expect(updateArgs.status).toBe('complete');
      expect(updateArgs.started_at).toBeUndefined(); // should not override existing date
    });

    it('throws if job not found on fallback', async () => {
      supabaseMock.rpc.mockResolvedValue({ error: { code: 'PGRST202' } });
      adminMock.maybeSingle.mockResolvedValue({ data: null });
      await expect(setCrewJobStatus(supabaseMock, 'acct_1', 'job_1', 'in_progress')).rejects.toThrow('Job not found.');
    });

    it('throws if job archived on fallback', async () => {
      supabaseMock.rpc.mockResolvedValue({ error: { code: 'PGRST202' } });
      adminMock.maybeSingle.mockResolvedValue({ data: { status: 'archived' } });
      await expect(setCrewJobStatus(supabaseMock, 'acct_1', 'job_1', 'in_progress')).rejects.toThrow('That job has been archived.');
    });

    it('throws if fallback update fails', async () => {
      supabaseMock.rpc.mockResolvedValue({ error: { code: 'PGRST202' } });
      adminMock.maybeSingle.mockResolvedValue({ data: { status: 'scheduled' } });
      adminMock.update.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: new Error('db fail') })
        })
      });
      await expect(setCrewJobStatus(supabaseMock, 'acct_1', 'job_1', 'in_progress')).rejects.toThrow('db fail');
    });
  });
});
