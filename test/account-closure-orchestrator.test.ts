import { describe, it, expect, vi } from 'vitest';
import {
  encryptVendorHandles,
  decryptVendorHandles,
  requestAccountClosure,
  claimClosureJob,
  processClosureJob,
  type VendorHandles,
} from '../src/lib/account-closure-orchestrator';
import { runClosureWorkerBatch } from '../src/lib/account-closure-worker';

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
    expect(job!.id).toBe('job-claimed');
    expect(mockClaimRpc).toHaveBeenCalledWith('claim_account_closure_job', {
      p_lease_token: 'lease-token-123',
      p_lease_duration_seconds: 300,
    });
  });

  it('processClosureJob stops destructive disposal when account is under legal_hold', async () => {
    const jobRecord = {
      id: 'job-hold',
      closure_subject_id: 'acc-hold',
      local_disposal_state: 'pending',
      stripe_state: 'not_applicable',
      quickbooks_state: 'not_applicable',
      storage_state: 'not_applicable',
      auth_cleanup_state: 'not_applicable',
      version: 1,
      encrypted_vendor_handles: null,
    };

    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'account_closure_jobs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: jobRecord, error: null }),
              }),
            }),
          };
        }
        if (table === 'accounts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { legal_hold: true }, error: null }),
              }),
            }),
          };
        }
        return {};
      }),
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    } as any;

    const result = await processClosureJob(mockAdmin, 'job-hold');
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('active legal hold'))).toBe(true);
  });

  it('processClosureJob executes local disposal and vendor cleanup, and preserves multi-tenant users', async () => {
    let jobVersion = 1;
    const jobRecord = {
      id: 'job-123',
      closure_subject_id: 'acc-123',
      local_disposal_state: 'pending',
      stripe_state: 'pending',
      quickbooks_state: 'pending',
      storage_state: 'not_applicable',
      auth_cleanup_state: 'pending',
      version: jobVersion,
      encrypted_vendor_handles: encryptVendorHandles({
        stripeCustomerId: 'cus_123',
        quickbooksRealmId: 'realm_123',
        ownerUserIds: ['user-multi-tenant', 'user-single-tenant'],
      }),
    };

    const mockDeleteUser = vi.fn().mockResolvedValue({ error: null });

    let jobFetchCount = 0;
    const mockAdmin = {
      from: vi.fn((table: string) => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockImplementation(() => {
              if (table === 'accounts') return Promise.resolve({ data: { legal_hold: false }, error: null });
              if (jobFetchCount === 0) {
                jobFetchCount++;
                return Promise.resolve({ data: jobRecord, error: null });
              }
              return Promise.resolve({
                data: {
                  ...jobRecord,
                  local_disposal_state: 'completed',
                  stripe_state: 'success',
                  quickbooks_state: 'success',
                  storage_state: 'not_applicable',
                  auth_cleanup_state: 'success',
                },
                error: null,
              });
            }),
          }),
        }),
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      })),
      rpc: vi.fn((fnName: string, args: any) => {
        if (fnName === 'check_user_active_memberships') {
          if (args.p_user_id === 'user-multi-tenant') {
            return Promise.resolve({ data: 2, error: null }); // 2 other workspaces
          }
          if (args.p_user_id === 'user-single-tenant') {
            return Promise.resolve({ data: 0, error: null }); // 0 other workspaces
          }
        }
        if (fnName === 'update_closure_job_stage') {
          return Promise.resolve({ data: true, error: null });
        }
        if (fnName === 'complete_closure_job') {
          return Promise.resolve({ data: true, error: null });
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
    expect(result.completed).toBe(true);
    expect(mockStripeCancel).toHaveBeenCalledWith('cus_123');
    expect(mockQuickBooksRevoke).toHaveBeenCalledWith('realm_123');

    // Only user-single-tenant should be deleted from Auth!
    expect(mockDeleteUser).toHaveBeenCalledTimes(1);
    expect(mockDeleteUser).toHaveBeenCalledWith('user-single-tenant');
    expect(mockDeleteUser).not.toHaveBeenCalledWith('user-multi-tenant');
  });

  it('runClosureWorkerBatch claims and processes queued jobs', async () => {
    let claimCount = 0;
    const mockAdmin = {
      rpc: vi.fn((fnName: string) => {
        if (fnName === 'claim_account_closure_job') {
          if (claimCount === 0) {
            claimCount += 1;
            return Promise.resolve({ data: [{ id: 'job-batch-1', closure_subject_id: 'acc-1' }], error: null });
          }
          return Promise.resolve({ data: [], error: null });
        }
        if (fnName === 'update_closure_job_stage' || fnName === 'complete_closure_job') {
          return Promise.resolve({ data: true, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'job-batch-1',
                closure_subject_id: 'acc-1',
                local_disposal_state: 'completed',
                stripe_state: 'not_applicable',
                quickbooks_state: 'not_applicable',
                storage_state: 'not_applicable',
                auth_cleanup_state: 'not_applicable',
                version: 1,
                encrypted_vendor_handles: null,
                legal_hold: false,
              },
              error: null,
            }),
          }),
        }),
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      })),
    } as any;

    const workerResult = await runClosureWorkerBatch(mockAdmin, { maxBatch: 2 });
    expect(workerResult.claimed).toBe(1);
    expect(workerResult.completed).toBe(1);
  });
});
