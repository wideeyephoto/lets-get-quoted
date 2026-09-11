import { describe, it, expect, vi } from 'vitest';
import {
  SupabaseConnectedPaymentProjectionStore,
} from '@/lib/billing/connected-payment-event-projector';
import { createAdminClient } from '@/lib/auth';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

describe('connected-payment-event-projector coverage', () => {
  it('throws on invalid claim data', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.mocked(createAdminClient).mockReturnValue({ rpc: mockRpc } as any);
    const store = new SupabaseConnectedPaymentProjectionStore();
    
    await expect(store.claim('123e4567-e89b-12d3-a456-426614174000')).rejects.toThrow('claim status');
  });

  it('throws on invalid plan data', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.mocked(createAdminClient).mockReturnValue({ rpc: mockRpc } as any);
    const store = new SupabaseConnectedPaymentProjectionStore();
    
    await expect(store.plan({ billingEventId: '123e4567-e89b-12d3-a456-426614174000', claimToken: '123e4567-e89b-12d3-a456-426614174000' })).rejects.toThrow('projection kind');
  });

  it('throws on invalid resolveBinding data', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.mocked(createAdminClient).mockReturnValue({ rpc: mockRpc } as any);
    const store = new SupabaseConnectedPaymentProjectionStore();
    
    await expect(store.resolveBinding({
      billingEventId: '123e4567-e89b-12d3-a456-426614174000', 
      claimToken: '123e4567-e89b-12d3-a456-426614174000',
      evidence: { workspaceId: '123e4567-e89b-12d3-a456-426614174000', paymentId: '123e4567-e89b-12d3-a456-426614174000', operationId: 'foo' } as any
    })).rejects.toThrow('payment status');
  });

  it('throws on invalid project data', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.mocked(createAdminClient).mockReturnValue({ rpc: mockRpc } as any);
    const store = new SupabaseConnectedPaymentProjectionStore();
    
    await expect(store.project({
      billingEventId: '123e4567-e89b-12d3-a456-426614174000', 
      claimToken: '123e4567-e89b-12d3-a456-426614174000',
      projection: {} as any
    })).rejects.toThrow('processing status');
  });
});
