import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadClientDetail } from '@/lib/client-detail';

describe('office clients comprehensive verification', () => {
  const read = (relPath: string) =>
    readFileSync(join(process.cwd(), relPath), 'utf8').replace(/\r\n/g, '\n');

  describe('API route: src/app/api/clients/[id]/detail/route.ts', () => {
    const route = read('src/app/api/clients/[id]/detail/route.ts');

    it('permits office members with clients.read without 307 redirect loops', () => {
      expect(route).toContain("membership.role === 'office'");
      expect(route).toContain("held.has('clients.read')");
      expect(route).toContain('canReadClients');
      expect(route).not.toContain("membership.role !== 'owner'");
    });

    it('passes isOwner flag to loadClientDetail', () => {
      expect(route).toContain('loadClientDetail(supabase, membership.accountId, params.id, { isOwner })');
    });

    it('returns JSON errors with proper 401 and 403 status codes', () => {
      expect(route).toContain("status: 401");
      expect(route).toContain("status: 403");
      expect(route).toContain("status: 404");
    });
  });

  describe('financial data protection in loadClientDetail', () => {
    it('bypasses getClientStatement and masks financial fields when isOwner is false', async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'clients') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: {
                        id: 'client-123',
                        account_id: 'acc-1',
                        name: 'Jane Doe',
                        phone: '555-1234',
                        email: 'jane@example.com',
                        address: '123 Main St, Springfield, IL',
                        notes: 'Friendly customer',
                        created_at: '2026-01-15T12:00:00Z',
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'jobs') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    order: () => Promise.resolve({
                      data: [
                        {
                          id: 'job-1',
                          ref: 'JOB-001',
                          status: 'completed',
                          quoted_amount: 1500,
                          created_at: '2026-02-01T12:00:00Z',
                          scheduled_for: '2026-02-05T12:00:00Z',
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'leads') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    is: () => ({
                      not: () => Promise.resolve({ count: 0, error: null }),
                    }),
                  }),
                }),
              }),
            };
          }
          throw new Error(`Unexpected table queried: ${table}`);
        }),
      };

      const detail = await loadClientDetail(
        mockSupabase as any,
        'acc-1',
        'client-123',
        { isOwner: false },
      );

      expect(detail).not.toBeNull();
      expect(detail?.name).toBe('Jane Doe');
      expect(detail?.jobCount).toBe(1);
      expect(detail?.totals.quotedLabel).toBe('$1,500.00');
      // Financial isolation: paid and outstanding must be masked rather than false "$0.00"
      expect(detail?.totals.paidLabel).toBe('—');
      expect(detail?.totals.outstandingLabel).toBe('—');
      expect(detail?.payments).toEqual([]);
      expect(detail?.jobs[0].paidLabel).toBe('—');
      expect(detail?.jobs[0].balanceLabel).toBe('—');
    });
  });

  describe('view switching: src/app/dashboard/view-actions.ts', () => {
    const viewActions = read('src/app/dashboard/view-actions.ts');

    it('allows office members with clients.read to persist clients view', () => {
      const fn = viewActions.slice(viewActions.indexOf('export async function setClientsViewAction'));
      const endOfFn = fn.slice(0, fn.indexOf('}'));
      expect(endOfFn).toContain("requireOfficeContext('clients.read')");
      expect(endOfFn).not.toContain('requireOwnerContext()');
    });
  });

  describe('customer book page & duplicate actions', () => {
    const page = read('src/app/dashboard/clients/page.tsx');
    const form = read('src/app/dashboard/clients/DuplicateGroupForm.tsx');

    it('withholds mergeClientsAction from non-owner office users in page.tsx', () => {
      expect(page).toContain("requireOfficeContext('clients.read')");
      expect(page).toContain("mergeAction={role === 'owner' ? mergeClientsAction : undefined}");
    });

    it('supports dismissing duplicate suggestions without merge capability in DuplicateGroupForm.tsx', () => {
      expect(form).toContain('action || dismissAction');
      expect(form).toContain('Merging requires owner access.');
      expect(form).toContain('Not duplicates');
      expect(form).toContain('required={Boolean(action)}');
    });
  });

  describe('portal revocation, client import, and statements permissions', () => {
    const portalActions = read('src/app/dashboard/clients/[id]/portal-actions.ts');
    const importPage = read('src/app/dashboard/clients/import/page.tsx');
    const statementPage = read('src/app/dashboard/clients/[id]/statement/page.tsx');
    const clientDetailPage = read('src/app/dashboard/clients/[id]/page.tsx');

    it('allows clients.write to revoke client portal access', () => {
      expect(portalActions).toContain("requireOfficeContext('clients.write')");
      expect(portalActions).not.toContain('requireOwnerContext()');
    });

    it('allows clients.write to open the client import page', () => {
      expect(importPage).toContain("requireOfficeContext('clients.write')");
      expect(importPage).not.toContain('requireOwnerContext()');
    });

    it('allows payments.read or reports.read to access client statement page', () => {
      expect(statementPage).toContain("requireOfficeContextAny('payments.read', 'reports.read')");
      expect(statementPage).not.toContain('requireOwnerContext()');
    });

    it('shows statement button in client detail page to owner and users with payment/report read', () => {
      expect(clientDetailPage).toContain("capabilities.has('payments.read') || capabilities.has('reports.read')");
    });
  });

  describe('client pagination and statement fee scoping in src/lib/clients.ts', () => {
    const clientsSource = read('src/lib/clients.ts');

    it('defaults fetchAll to true in listClientsWithStats', () => {
      expect(clientsSource).toContain('const fetchAll = options?.fetchAll ?? true;');
    });

    it('re-instantiates query ranges cleanly inside fetchAllPages closures', () => {
      expect(clientsSource).toMatch(/fetchAllPages<Client>\(\(from, to\) =>\s*applyTestRecordFilter\(supabase\.from\('clients'\)/);
      expect(clientsSource).toMatch(/fetchAllPages<\{ client_id: string[\s\S]*?applyTestRecordFilter\(\s*supabase\s*\.from\('jobs'\)/);
    });

    it('scopes extra_stop_requests fee query to client payments and accountId in chunks', () => {
      const block = clientsSource.slice(
        clientsSource.indexOf('const feePaymentIds'),
        clientsSource.indexOf('const paidByJob'),
      );
      expect(block).toContain("eq('account_id', accountId)");
      expect(block).toContain(".in('payment_id', chunk)");
      expect(block).toContain('chunkSize = 200');
    });
  });

  describe('migration: 20260905100000_office_enable_client_duplicate_dismissals_and_portal.sql', () => {
    const migration = read(
      'migrations/20260905100000_office_enable_client_duplicate_dismissals_and_portal.sql',
    );

    it('configures clients.read and clients.write RLS policies for duplicate dismissals and portal access', () => {
      expect(migration).toContain("office_can(account_id, 'clients.read')");
      expect(migration).toContain("office_can(account_id, 'clients.write')");
      expect(migration).toContain('client_duplicate_dismissals_select');
      expect(migration).toContain('client_duplicate_dismissals_modify');
      expect(migration).toContain('client_portal_access_select');
      expect(migration).toContain('client_portal_access_modify');
    });
  });
});
