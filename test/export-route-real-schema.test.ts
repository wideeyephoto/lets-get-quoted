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
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  range: vi.fn().mockResolvedValue({
                    data: [{ phone_number: '+15551234567', consent_scope: 'customer' }],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [{ id: 'row-1', name: 'Sample Item' }],
                error: null,
              }),
            }),
          }),
          in: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [{ id: 'item-1', invoice_id: 'row-1', description: 'Item 1', amount: 100 }],
                error: null,
              }),
            }),
          }),
        }),
      };
    }),
  };
  return { mockAdmin: admin };
});

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => mockAdmin,
}));

import { GET } from '../src/app/admin/accounts/[id]/export/route';

describe('account export keyset pagination and tables', () => {
  it('correctly exports records across single-key, account_id PK, and composite PK tables', async () => {
    const req = new NextRequest('http://localhost/admin/accounts/acc-123/export');
    const res = await GET(req, { params: Promise.resolve({ id: 'acc-123' }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.export_metadata.account_id).toBe('acc-123');
    expect(body.account.business_name).toBe('Test Contractor');
    expect(body.messaging_registrations).toHaveLength(1);
    expect(body.sms_consent_scopes).toHaveLength(1);
  });
});
