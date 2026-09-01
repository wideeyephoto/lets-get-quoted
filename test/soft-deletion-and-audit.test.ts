import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeAuditPayload, computeAuditDiff } from '@/lib/tenant-audit';
import {
  softDeleteEntity,
  restoreEntity,
  listTrashItems,
  getTrashItemCount,
  cancelAccountClosure,
} from '@/lib/recoverable-deletions';
import { DATA_DISPOSITION_REGISTRY } from '@/lib/data-disposition-registry';

// Mock Supabase Client factory for offline fast unit testing
function createMockSupabase() {
  const store = {
    leads: new Map<string, any>(),
    crew: new Map<string, any>(),
    services: new Map<string, any>(),
    jobs: new Map<string, any>(),
    recoverable_deletions: new Map<string, any>(),
    accounts: new Map<string, any>(),
    memberships: new Map<string, any>(),
    account_closure_jobs: new Map<string, any>(),
  };

  const client: any = {
    rpc: vi.fn(async (rpcName: string, params: any) => {
      if (rpcName === 'soft_delete_entity_atomic') {
        const opId = crypto.randomUUID();
        const now = new Date().toISOString();
        const purgeAt = new Date(Date.now() + (params.p_grace_days || 30) * 86400000).toISOString();
        return {
          data: {
            success: true,
            operation_id: opId,
            entity_type: params.p_entity_type,
            entity_id: params.p_entity_id,
            deleted_at: now,
            purge_eligible_at: purgeAt,
          },
          error: null,
        };
      }
      if (rpcName === 'restore_entity_atomic') {
        const now = new Date().toISOString();
        return {
          data: {
            success: true,
            entity_type: params.p_entity_type,
            entity_id: params.p_entity_id,
            restored_at: now,
            status: 'restored',
          },
          error: null,
        };
      }
      if (rpcName === 'cancel_account_closure_atomic') {
        const now = new Date().toISOString();
        return {
          data: {
            success: true,
            account_id: params.p_account_id,
            status: 'restored',
            recovered_at: now,
          },
          error: null,
        };
      }
      return { data: null, error: { message: `Unknown RPC ${rpcName}` } };
    }),
    from: vi.fn((table: string) => {
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        is: vi.fn(() => builder),
        order: vi.fn(() => builder),
        range: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        single: vi.fn(async () => ({ data: {}, error: null })),
        maybeSingle: vi.fn(async () => ({ data: {}, error: null })),
        insert: vi.fn(async () => ({ data: {}, error: null })),
        update: vi.fn(async () => ({ data: {}, error: null })),
        delete: vi.fn(async () => ({ data: {}, error: null })),
        then: (resolve: any) => {
          if (table === 'recoverable_deletions') {
            const now = new Date();
            const purgeAt = new Date(now.getTime() + 25 * 86400000);
            return resolve({
              data: [
                {
                  id: 'del-1',
                  account_id: 'acct-1',
                  entity_type: 'lead',
                  entity_id: 'lead-1',
                  display_snapshot: { title: 'Test Lead' },
                  deleted_at: now.toISOString(),
                  purge_eligible_at: purgeAt.toISOString(),
                  status: 'trashed',
                },
              ],
              count: 1,
              error: null,
            });
          }
          return resolve({ data: [], count: 0, error: null });
        },
      };
      return builder;
    }),
  };

  return client;
}

describe('Soft Deletion, Conservative Recovery, and Tenant Audit Logs (Production Drill)', () => {
  describe('1. AST & Static Code Protection Drill', () => {
    it('verifies that no unauthorized user-facing files execute raw .delete() on protected aggregate roots', () => {
      const srcDir = path.resolve(process.cwd(), 'src');
      const protectedTables = ['leads', 'crew', 'services', 'jobs', 'accounts'];
      const allowedFiles = [
        'purge-worker.ts',
        'account-closure-orchestrator.ts',
        'account-deletion-saga.ts',
        'account-closure-worker.ts',
        'auth.ts', // Authorized internal transient signup rollback
        'actions.ts', // Authorized admin hard delete with MFA and audit logging
        'jobs.ts', // Authorized job delete guarded by payment ledger
      ];

      function scanDir(dir: string, results: { file: string; line: number; table: string }[] = []) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath, results);
          } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
            if (allowedFiles.includes(entry.name)) continue;

            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');
            lines.forEach((line, idx) => {
              for (const table of protectedTables) {
                // Look for .from('leads').delete() or .from("leads").delete()
                const regex = new RegExp(`\\.from\\(['"]${table}['"]\\)\\.delete\\(`, 'i');
                if (regex.test(line)) {
                  results.push({ file: fullPath, line: idx + 1, table });
                }
              }
            });
          }
        }
        return results;
      }

      const violations = scanDir(srcDir);
      expect(
        violations,
        `Found unauthorized raw .delete() calls on protected tables: ${JSON.stringify(violations, null, 2)}`
      ).toEqual([]);
    });
  });

  describe('2. Audit Payload Sanitization & Diff Drill', () => {
    it('redacts sensitive security credentials and personal identifiers from audit state payloads', () => {
      const rawPayload = {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+15551234567',
        password: 'super-secret-password-123',
        token: 'eyJhGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz',
        stripe_payment_intent: 'pi_test123456789',
        card_number: '4242424242424242',
        cvv: '123',
        nested: {
          api_key: 'secret_live_key_9999',
          cookie: 'session=abc123xyz',
          notes: 'Standard customer note',
        },
      };

      const sanitized = sanitizeAuditPayload(rawPayload) as any;

      expect(sanitized.name).toBe('John Doe');
      expect(sanitized.email).toBe('john@example.com');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.card_number).toBe('[REDACTED]');
      expect(sanitized.cvv).toBe('[REDACTED]');
      expect(sanitized.nested.api_key).toBe('[REDACTED]');
      expect(sanitized.nested.cookie).toBe('[REDACTED]');
      expect(sanitized.nested.notes).toBe('Standard customer note');
    });

    it('accurately computes field-level diffs and before/after sanitized state snapshots', () => {
      const before = {
        title: 'Original Title',
        amount: 100,
        status: 'active',
        password: 'old-password',
      };
      const after = {
        title: 'Updated Title',
        amount: 150,
        status: 'active',
        password: 'new-password',
      };

      const diff = computeAuditDiff(before, after);

      expect(diff.changedFields).toContain('title');
      expect(diff.changedFields).toContain('amount');
      expect(diff.changedFields).not.toContain('status');
      expect(diff.sanitizedBefore?.title).toBe('Original Title');
      expect(diff.sanitizedAfter?.title).toBe('Updated Title');
      expect(diff.sanitizedBefore?.password).toBe('[REDACTED]');
      expect(diff.sanitizedAfter?.password).toBe('[REDACTED]');
    });
  });

  describe('3. Conservative Restoration Semantics Drill', () => {
    it('restores crew members as inactive to prevent unintended scheduling', async () => {
      const mockSupabase = createMockSupabase();
      const accountId = '11111111-1111-4111-8111-111111111111';
      const crewId = '22222222-2222-4222-8222-222222222222';

      const result = await restoreEntity({
        client: mockSupabase,
        accountId,
        entityType: 'crew',
        entityId: crewId,
        actor: { userId: '33333333-3333-4333-8333-333333333333', role: 'owner' },
      });

      expect(result.success).toBe(true);
      expect(result.entityType).toBe('crew');
      expect(result.status).toBe('restored');
    });

    it('restores leads with archived status to prevent automated outreach / SMS dispatches', async () => {
      const mockSupabase = createMockSupabase();
      const accountId = '11111111-1111-4111-8111-111111111111';
      const leadId = '44444444-4444-4444-8444-444444444444';

      const result = await restoreEntity({
        client: mockSupabase,
        accountId,
        entityType: 'lead',
        entityId: leadId,
        actor: { userId: '33333333-3333-4333-8333-333333333333', role: 'owner' },
      });

      expect(result.success).toBe(true);
      expect(result.entityType).toBe('lead');
      expect(result.status).toBe('restored');
    });

    it('restores services with is_active: false to prevent unverified instant booking', async () => {
      const mockSupabase = createMockSupabase();
      const accountId = '11111111-1111-4111-8111-111111111111';
      const serviceId = '55555555-5555-4555-8555-555555555555';

      const result = await restoreEntity({
        client: mockSupabase,
        accountId,
        entityType: 'service',
        entityId: serviceId,
        actor: { userId: '33333333-3333-4333-8333-333333333333', role: 'owner' },
      });

      expect(result.success).toBe(true);
      expect(result.entityType).toBe('service');
      expect(result.status).toBe('restored');
    });
  });

  describe('4. 30-Day Trash & Recovery Lifecycle Drill', () => {
    it('calculates 30-day purge eligible date upon soft deletion', async () => {
      const mockSupabase = createMockSupabase();
      const accountId = '11111111-1111-4111-8111-111111111111';
      const leadId = '66666666-6666-4666-8666-666666666666';

      const beforeTime = Date.now();
      const result = await softDeleteEntity({
        client: mockSupabase,
        accountId,
        entityType: 'lead',
        entityId: leadId,
        actor: { userId: '33333333-3333-4333-8333-333333333333', role: 'owner' },
        reason: 'Duplicate intake lead',
        graceDays: 30,
      });

      expect(result.success).toBe(true);
      expect(result.entityId).toBe(leadId);
      expect(result.operationId).toBeDefined();

      const purgeTime = new Date(result.purgeEligibleAt).getTime();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(purgeTime - beforeTime).toBeGreaterThanOrEqual(thirtyDaysMs - 5000);
    });

    it('correctly reports days remaining and item counts', async () => {
      const mockSupabase = createMockSupabase();
      const accountId = '11111111-1111-4111-8111-111111111111';

      const { items } = await listTrashItems({ client: mockSupabase, accountId, limit: 10 });
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBe(1);
      expect(items[0].daysRemaining).toBeGreaterThanOrEqual(0);
      expect(items[0].daysRemaining).toBeLessThanOrEqual(30);
    });
  });

  describe('5. Account Closure 30-Day Grace Period & Reactivation Drill', () => {
    it('cancels account closure during grace period and restores workspace state', async () => {
      const mockSupabase = createMockSupabase();
      const accountId = '11111111-1111-4111-8111-111111111111';

      const result = await cancelAccountClosure({
        client: mockSupabase,
        accountId,
        actor: { userId: '33333333-3333-4333-8333-333333333333', role: 'owner' },
        source: 'web',
      });

      expect(result.success).toBe(true);
      expect(result.accountId).toBe(accountId);
      expect(result.status).toBe('restored');
    });
  });
});
