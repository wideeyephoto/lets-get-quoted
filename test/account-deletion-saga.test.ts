import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAccountClosureSaga, KNOWN_STORAGE_BUCKETS } from '@/lib/account-deletion-saga';

describe('executeAccountClosureSaga', () => {
  let mockAdmin: any;
  let updatePayloads: Record<string, any>;

  beforeEach(() => {
    updatePayloads = {};
    mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'accounts') {
          return {
            update: vi.fn((payload) => {
              updatePayloads[table] = payload;
              return { eq: vi.fn().mockResolvedValue({ error: null }) };
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: { code: '23503', message: 'foreign_key_violation' } }),
            }),
          };
        }
        if (table === 'quickbooks_connections') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { refresh_token: 'qb_refresh_123' }, error: null }),
              }),
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === 'memberships') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [{ user_id: 'usr_1' }] }),
                select: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'workspace_purchased_capacity') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: [] }),
              }),
            }),
          };
        }
        return {
          update: vi.fn((payload) => {
            updatePayloads[table] = payload;
            return { eq: vi.fn().mockResolvedValue({ error: null }) };
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [] }),
          }),
        };
      }),
      storage: {
        from: vi.fn(() => ({
          list: vi.fn().mockResolvedValue({ data: [{ name: 'logo.png', id: 'file_1' }] }),
          remove: vi.fn().mockResolvedValue({ error: null }),
        })),
      },
      auth: {
        admin: {
          deleteUser: vi.fn().mockResolvedValue({ error: null }),
        },
      },
    };
  });

  it('contains insurance-proof bucket and does NOT contain nonexistent insurance bucket', () => {
    expect(KNOWN_STORAGE_BUCKETS).toContain('insurance-proof');
    expect(KNOWN_STORAGE_BUCKETS).not.toContain('insurance');
  });

  it('updates real-schema columns on clients, leads, jobs, crew, payments, and invoices', async () => {
    const result = await executeAccountClosureSaga(mockAdmin, 'acct_123');

    expect(result.success).toBe(true);
    expect(result.anonymized).toBe(true);
    expect(result.retainedLedger).toBe(true);
    expect(result.hardDeleted).toBe(false);
    expect(result.errors).toHaveLength(0);

    // Assert exact real-schema payload matches
    expect(updatePayloads['clients']).toEqual({
      name: '[Deleted Customer]',
      phone: null,
      email: null,
      address: null,
      notes: null,
    });

    expect(updatePayloads['leads']).toEqual({
      name: '[Deleted Lead]',
      phone: null,
      email: null,
      address: null,
      message: null,
      photo_paths: [],
      quote_visit: null,
      triage: null,
    });

    expect(updatePayloads['jobs']).toEqual({
      client_name: '[Deleted Customer]',
      client_phone: null,
      client_email: null,
      address: null,
      scope: null,
      certificate: null,
      photo_paths: [],
    });

    expect(updatePayloads['crew']).toEqual({
      name: '[Deleted Crew Member]',
      phone: '+10000000000',
      email: null,
      photo_path: null,
    });

    expect(updatePayloads['payments']).toEqual({
      homeowner_phone: null,
      label: '[Redacted Payment]',
    });

    expect(updatePayloads['invoices']).toEqual({
      signer_name: '[Redacted]',
    });
  });

  it('captures database update errors and sets success = false without throwing or giving false success', async () => {
    mockAdmin.from = vi.fn((table: string) => {
      if (table === 'accounts') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: { code: '23503', message: 'foreign_key_violation' } }),
          }),
        };
      }
      if (table === 'clients') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: { message: 'Database connection dropped', code: '08006' } }),
          }),
        };
      }
      return {
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            in: vi.fn().mockResolvedValue({ data: [] }),
          }),
        }),
      };
    });

    const result = await executeAccountClosureSaga(mockAdmin, 'acct_fail');

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes('Anonymize clients failed'))).toBe(true);
  });
});
