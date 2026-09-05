import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockAdmin } = vi.hoisted(() => {
  const admin = {
    from: vi.fn((table: string) => {
      if (table === 'accounts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'acc-123', business_name: 'Test Contractor' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'messaging_registrations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ account_id: 'acc-123', status: 'approved' }],
              error: null,
            }),
          }),
        };
      }
      if (table === 'sms_consent_scopes') {
        const queryChain: Record<string, unknown> = {
          range: vi.fn().mockResolvedValue({
            data: [{ phone_number: '+15551234567', consent_scope: 'customer' }],
            error: null,
          }),
        };
        queryChain.order = vi.fn().mockReturnValue(queryChain);
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue(queryChain),
          }),
        };
      }
      if (table === 'admin_actions') {
        return {
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      const queryBuilder: Record<string, unknown> = {
        limit: vi.fn().mockResolvedValue({
          data: [{ id: 'row-1', name: 'Sample Item' }],
          error: null,
        }),
        range: vi.fn().mockResolvedValue({
          data: [{ id: 'row-1', name: 'Sample Item' }],
          error: null,
        }),
      };
      queryBuilder.order = vi.fn().mockReturnValue(queryBuilder);
      queryBuilder.gt = vi.fn().mockReturnValue(queryBuilder);

      const inQueryBuilder: Record<string, unknown> = {
        limit: vi.fn().mockResolvedValue({
          data: [{ id: 'item-1', invoice_id: 'row-1', description: 'Item 1', amount: 100 }],
          error: null,
        }),
        range: vi.fn().mockResolvedValue({
          data: [{ id: 'item-1', invoice_id: 'row-1', description: 'Item 1', amount: 100 }],
          error: null,
        }),
      };
      inQueryBuilder.order = vi.fn().mockReturnValue(inQueryBuilder);

      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue(queryBuilder),
          in: vi.fn().mockReturnValue(inQueryBuilder),
        }),
      };

    }),
  };
  return { mockAdmin: admin };
});

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => mockAdmin,
  requirePermission: vi.fn((permission: string) => {
    if (permission !== 'account.export') {
      throw new Error(`Forbidden: missing ${permission}`);
    }
    return Promise.resolve({
      adminEmail: 'founder@letsgetquoted.com',
      role: 'super_admin',
      staff: { id: 'staff-1', role: 'super_admin', active: true },
      permission: 'account.export',
    });
  }),
}));

import { GET } from '../src/app/admin/accounts/[id]/export/route';

describe('account export keyset pagination and tables', () => {
  it('correctly exports records across single-key, account_id PK, and composite PK tables with staff authentication', async () => {
    const req = new NextRequest('http://localhost/admin/accounts/acc-123/export');
    const res = await GET(req, { params: Promise.resolve({ id: 'acc-123' }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.export_metadata.account_id).toBe('acc-123');
    expect(body.export_metadata.exported_by).toBe('founder@letsgetquoted.com');
    expect(body.account.business_name).toBe('Test Contractor');
    expect(body.messaging_registrations).toHaveLength(1);
    expect(body.sms_consent_scopes).toHaveLength(1);
  });

  it('rejects unauthenticated callers when requirePermission throws', async () => {
    const { requirePermission } = await import('@/lib/auth');
    vi.mocked(requirePermission).mockRejectedValueOnce(new Error('Unauthorized: No active staff session'));

    const req = new NextRequest('http://localhost/admin/accounts/acc-123/export');
    await expect(GET(req, { params: Promise.resolve({ id: 'acc-123' }) })).rejects.toThrow('Unauthorized');
  });

  it('rejects inactive staff members when requirePermission throws inactive error', async () => {
    const { requirePermission } = await import('@/lib/auth');
    vi.mocked(requirePermission).mockRejectedValueOnce(new Error('Forbidden: staff account is deactivated'));

    const req = new NextRequest('http://localhost/admin/accounts/acc-123/export');
    await expect(GET(req, { params: Promise.resolve({ id: 'acc-123' }) })).rejects.toThrow('deactivated');
  });

  it('rejects staff lacking account.export permission', async () => {
    const { requirePermission } = await import('@/lib/auth');
    vi.mocked(requirePermission).mockRejectedValueOnce(new Error('Forbidden: missing account.export'));

    const req = new NextRequest('http://localhost/admin/accounts/acc-123/export');
    await expect(GET(req, { params: Promise.resolve({ id: 'acc-123' }) })).rejects.toThrow('missing account.export');
  });

  it('records an audit trail entry in admin_actions on successful export', async () => {
    const req = new NextRequest('http://localhost/admin/accounts/acc-123/export');
    const res = await GET(req, { params: Promise.resolve({ id: 'acc-123' }) });
    expect(res.status).toBe(200);

    expect(mockAdmin.from).toHaveBeenCalledWith('admin_actions');
  });
});


