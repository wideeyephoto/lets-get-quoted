import { describe, it, expect, vi } from 'vitest';
import {
  SupabasePaidPlanMonthlyAllowanceResetWorkerStore,
} from '@/lib/billing/monthly-allowance-reset-worker';
import { createAdminClient } from '@/lib/auth';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

describe('monthly-allowance-reset-worker coverage', () => {
  it('throws on invalid claim batch data', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.mocked(createAdminClient).mockReturnValue({ rpc: mockRpc } as any);
    
    const store = new SupabasePaidPlanMonthlyAllowanceResetWorkerStore();
    
    // not array
    await expect(store.claimBatch(10)).rejects.toThrow('invalid data');
    
    // invalid batch
    mockRpc.mockResolvedValue({ data: [null], error: null });
    await expect(store.claimBatch(10)).rejects.toThrow('invalid row');
  });

  it('throws on invalid execute data', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.mocked(createAdminClient).mockReturnValue({ rpc: mockRpc } as any);
    const store = new SupabasePaidPlanMonthlyAllowanceResetWorkerStore();
    
    // no row
    mockRpc.mockResolvedValue({ data: null, error: null });
    await expect(store.execute({ claimToken: '123e4567-e89b-12d3-a456-426614174000', workspaceId: '123e4567-e89b-12d3-a456-426614174000', dueAt: '2020-01-01T00:00:00Z', attemptNumber: 1, leaseExpiresAt: '2020-01-01T00:00:00Z' })).rejects.toThrow('returned no row');
  });

  it('throws on invalid fail data', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.mocked(createAdminClient).mockReturnValue({ rpc: mockRpc } as any);
    const store = new SupabasePaidPlanMonthlyAllowanceResetWorkerStore();
    
    // no row
    mockRpc.mockResolvedValue({ data: null, error: null });
    await expect(store.fail({ claimToken: '123e4567-e89b-12d3-a456-426614174000', workspaceId: '123e4567-e89b-12d3-a456-426614174000', dueAt: '2020-01-01T00:00:00Z', attemptNumber: 1, leaseExpiresAt: '2020-01-01T00:00:00Z' }, 'worker_internal_error')).rejects.toThrow('returned no row');
  });
});
