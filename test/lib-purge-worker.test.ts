import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runPurgeWorker } from '@/lib/purge-worker';
import { createAdminClient } from '@/lib/auth';
import { recordTenantAuditEvent } from '@/lib/tenant-audit';
import { claimClosureJob, processClosureJob, buildProductionClosureAdapters } from '@/lib/account-closure-orchestrator';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/tenant-audit', () => ({
  recordTenantAuditEvent: vi.fn(),
}));

vi.mock('@/lib/account-closure-orchestrator', () => ({
  claimClosureJob: vi.fn(),
  processClosureJob: vi.fn(),
  buildProductionClosureAdapters: vi.fn(),
}));

describe('Purge Worker Lib', () => {
  let supabaseMock: any;
  let queryMock: any;
  let storageMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    queryMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      single: vi.fn(),
    };

    storageMock = {
      remove: vi.fn(),
    };

    supabaseMock = {
      rpc: vi.fn(),
      from: vi.fn(() => queryMock),
      storage: {
        from: vi.fn(() => storageMock),
      }
    };

    (createAdminClient as any).mockReturnValue(supabaseMock);
    
    // Default mock behavior
    (claimClosureJob as any).mockResolvedValue(null);
  });

  it('handles claim errors gracefully', async () => {
    supabaseMock.rpc.mockResolvedValue({ error: new Error('rpc fail') });
    
    const res = await runPurgeWorker();
    expect(res.errors).toContain('Claim error: rpc fail');
    expect(res.purgedDeletionsCount).toBe(0);
  });

  it('skips legal hold accounts', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: [{ id: 'del1', account_id: 'acct1', entity_type: 'lead', entity_id: 'l1' }]
    });

    queryMock.single.mockResolvedValue({ data: { legal_hold: true } });
    
    const res = await runPurgeWorker();
    
    expect(queryMock.update).toHaveBeenCalledWith(expect.objectContaining({ purge_locked: false, legal_hold: true }));
    expect(queryMock.delete).not.toHaveBeenCalled();
    expect(res.purgedDeletionsCount).toBe(0);
  });

  it('purges items successfully', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: [{ 
        id: 'del1', 
        account_id: 'acct1', 
        entity_type: 'lead', 
        entity_id: 'l1',
        storage_manifest: [{ bucket: 'bucket1', path: 'file1.jpg' }]
      }]
    });

    queryMock.single.mockResolvedValue({ data: { legal_hold: false } });
    storageMock.remove.mockResolvedValue({ data: [] });
    
    const res = await runPurgeWorker();
    
    expect(supabaseMock.storage.from).toHaveBeenCalledWith('bucket1');
    expect(storageMock.remove).toHaveBeenCalledWith(['file1.jpg']);
    expect(supabaseMock.from).toHaveBeenCalledWith('leads');
    expect(queryMock.delete).toHaveBeenCalled();
    expect(queryMock.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'purged' }));
    expect(recordTenantAuditEvent).toHaveBeenCalled();
    expect(res.purgedDeletionsCount).toBe(1);
  });

  it('handles unsupported entity type', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: [{ id: 'del1', account_id: 'acct1', entity_type: 'unknown_type', entity_id: 'u1' }]
    });
    queryMock.single.mockResolvedValue({ data: { legal_hold: false } });

    const res = await runPurgeWorker();
    expect(res.errors[0]).toContain('Unsupported entity type: unknown_type');
  });

  it('processes closure job successfully', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: [] });
    
    (claimClosureJob as any).mockResolvedValue({ id: 'job1' });
    (processClosureJob as any).mockResolvedValue({ completed: true, errors: [] });
    
    const res = await runPurgeWorker();
    
    expect(res.processedClosureJobsCount).toBe(1);
    expect(buildProductionClosureAdapters).toHaveBeenCalled();
    expect(processClosureJob).toHaveBeenCalled();
  });

  it('bubbles up closure errors', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: [] });
    
    (claimClosureJob as any).mockResolvedValue({ id: 'job1' });
    (processClosureJob as any).mockResolvedValue({ completed: false, errors: ['bad stuff'] });
    
    const res = await runPurgeWorker();
    
    expect(res.processedClosureJobsCount).toBe(0);
    expect(res.errors).toContain('bad stuff');
  });
});
