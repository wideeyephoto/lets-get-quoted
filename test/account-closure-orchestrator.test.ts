import { describe, it, expect, vi } from 'vitest';
import {
  encryptVendorHandles,
  decryptVendorHandles,
  requestAccountClosure,
  claimClosureJob,
  processClosureJob,
  type VendorHandles,
} from '../src/lib/account-closure-orchestrator';

describe('account closure orchestrator & encryption', () => {
  it('encrypts and decrypts operational vendor handles with AES-256-GCM', () => {
    const handles: VendorHandles = {
      stripeCustomerId: 'cus_12345',
      stripeSubscriptionId: 'sub_67890',
      quickbooksRealmId: 'realm_abc',
      storageFolderPrefix: 'acc_001',
      ownerUserIds: ['user_1', 'user_2'],
    };

    const encrypted = encryptVendorHandles(handles);
    expect(encrypted).toBeDefined();
    expect(encrypted).not.toContain('cus_12345'); // Not plaintext

    const decrypted = decryptVendorHandles(encrypted);
    expect(decrypted).toEqual(handles);
  });

  it('handles empty or malformed encrypted handle strings gracefully', () => {
    expect(decryptVendorHandles(null)).toBeNull();
    expect(decryptVendorHandles('')).toBeNull();
    expect(decryptVendorHandles('invalid:string')).toBeNull();
  });

  it('requestAccountClosure calls atomic RPC and returns jobId', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: 'job-123', error: null });
    const mockAdmin = { rpc: mockRpc } as any;

    const res = await requestAccountClosure(mockAdmin, {
      accountId: 'acc-123',
      requestedByRole: 'admin',
      requestedByUserId: 'admin-user-1',
      vendorHandles: {
        stripeCustomerId: 'cus_xyz',
      },
    });

    expect(res.jobId).toBe('job-123');
    expect(mockRpc).toHaveBeenCalledWith('request_account_closure_atomic', expect.objectContaining({
      p_account_id: 'acc-123',
      p_requested_by_role: 'admin',
      p_stripe_applicable: true,
      p_quickbooks_applicable: false,
    }));
  });

  it('claimClosureJob claims queued job with FOR UPDATE SKIP LOCKED via RPC', async () => {
    const mockClaimRpc = vi.fn().mockResolvedValue({
      data: [{ id: 'job-claimed', closure_subject_id: 'acc-123' }],
      error: null,
    });
    const mockAdmin = { rpc: mockClaimRpc } as any;

    const job = await claimClosureJob(mockAdmin, 'lease-token-123', 300);
    expect(job).toBeDefined();
    expect(job?.id).toBe('job-claimed');
    expect(mockClaimRpc).toHaveBeenCalledWith('claim_account_closure_job', {
      p_lease_token: 'lease-token-123',
      p_lease_duration_seconds: 300,
    });
  });

  it('processClosureJob executes local disposal and vendor cleanup, and preserves multi-tenant users', async () => {
    const jobRecord = {
      id: 'job-123',
      closure_subject_id: 'acc-123',
      local_disposal_state: 'pending',
      stripe_state: 'pending',
      quickbooks_state: 'pending',
      storage_state: 'not_applicable',
      auth_cleanup_state: 'pending',
      version: 1,
      encrypted_vendor_handles: encryptVendorHandles({
        stripeCustomerId: 'cus_123',
        quickbooksRealmId: 'realm_123',
        ownerUserIds: ['user-multi-tenant', 'user-single-tenant'],
      }),
    };

    const mockJobUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    const mockDeleteUser = vi.fn().mockResolvedValue({ error: null });

    const mockAdmin = {
      from: vi.fn((table: string) => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { legal_hold: false }, error: null }),
          }),
        }),
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      })),
      schema: vi.fn((schema: string) => {
        if (schema === 'audit') {
          return {
            from: (table: string) => {
              if (table === 'account_closure_jobs') {
                return {
                  select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({ data: jobRecord, error: null }),
                    }),
                  }),
                  update: mockJobUpdate,
                };
              }
              return {};
            },
          };
        }
        return {};
      }),
      rpc: vi.fn((fnName: string, args: any) => {
        if (fnName === 'check_user_active_memberships') {
          if (args.p_user_id === 'user-multi-tenant') {
            return Promise.resolve({ data: 2, error: null }); // Has 2 other active workspaces
          }
          if (args.p_user_id === 'user-single-tenant') {
            return Promise.resolve({ data: 0, error: null }); // Has 0 other active workspaces
          }
        }
        return Promise.resolve({ data: null, error: null });
      }),
      auth: {
        admin: {
          deleteUser: mockDeleteUser,
        },
      },
    } as any;

    const mockStripeCancel = vi.fn().mockResolvedValue(true);
    const mockQuickBooksRevoke = vi.fn().mockResolvedValue(true);

    const result = await processClosureJob(mockAdmin, 'job-123', {
      stripeCancel: mockStripeCancel,
      quickbooksRevoke: mockQuickBooksRevoke,
    });

    expect(result.success).toBe(true);
    expect(mockStripeCancel).toHaveBeenCalledWith('cus_123');
    expect(mockQuickBooksRevoke).toHaveBeenCalledWith('realm_123');

    // Verify multi-tenant user preservation:
    // Only 'user-single-tenant' (0 other active accounts) should be deleted!
    expect(mockDeleteUser).toHaveBeenCalledTimes(1);
    expect(mockDeleteUser).toHaveBeenCalledWith('user-single-tenant');
    expect(mockDeleteUser).not.toHaveBeenCalledWith('user-multi-tenant');
  });

  it('processClosureJob fails closed when membership check returns null', async () => {
    const jobRecord = {
      id: 'job-err',
      closure_subject_id: 'acc-err',
      local_disposal_state: 'completed',
      stripe_state: 'not_applicable',
      quickbooks_state: 'not_applicable',
      storage_state: 'not_applicable',
      auth_cleanup_state: 'pending',
      version: 1,
      encrypted_vendor_handles: encryptVendorHandles({
        ownerUserIds: ['user-indeterminate'],
      }),
    };

    const mockJobUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const mockDeleteUser = vi.fn().mockResolvedValue({ error: null });

    const mockAdmin = {
      schema: vi.fn(() => ({
        from: () => ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: jobRecord, error: null }),
            }),
          }),
          update: mockJobUpdate,
        }),
      })),
      rpc: vi.fn(() => Promise.resolve({ data: null, error: { message: 'Database error' } })),
      auth: { admin: { deleteUser: mockDeleteUser } },
    } as any;

    const result = await processClosureJob(mockAdmin, 'job-err');
    expect(result.success).toBe(false);
    // User must NOT be deleted!
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });
});
