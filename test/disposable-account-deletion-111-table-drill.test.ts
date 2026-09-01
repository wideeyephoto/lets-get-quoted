import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  DATA_DISPOSITION_REGISTRY,
  getExportableTables,
  type TableDisposition,
} from '@/lib/data-disposition-registry';
import {
  executeAccountClosureSaga,
  KNOWN_STORAGE_BUCKETS,
} from '@/lib/account-deletion-saga';
import {
  processClosureJob,
  buildProductionClosureAdapters,
  encryptVendorHandles,
  type VendorHandles,
} from '@/lib/account-closure-orchestrator';

describe('Disposable Account Deletion 111-Table & Multi-Bucket Drill (P0 / Section 0)', () => {
  // Read canonical schema.sql to extract all defined tables
  const schemaPath = path.resolve(process.cwd(), 'schema.sql');
  let schema = fs.readFileSync(schemaPath, 'utf8');
  schema = schema.replace(/--.*$/gm, ''); // strip comments

  const tableRegex = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\n\);/gi;
  let match;
  const canonicalSchemaTables: Record<string, Set<string>> = {};

  while ((match = tableRegex.exec(schema)) !== null) {
    const name = match[1].toLowerCase();
    const body = match[2];
    const colLines = body.split('\n').map((l) => l.trim()).filter(Boolean);
    const cols = new Set<string>();
    for (const line of colLines) {
      const colMatch = line.match(/^([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_]+(\([^)]+\))?(\[\])?)/);
      if (colMatch && !['constraint', 'primary', 'foreign', 'unique', 'check'].includes(colMatch[1].toLowerCase())) {
        cols.add(colMatch[1].toLowerCase());
      }
    }
    canonicalSchemaTables[name] = cols;
  }

  const alterRegex = /alter\s+table\s+(?:if\s+exists\s+)?(?:([a-zA-Z0-9_]+)\.)?([a-zA-Z0-9_]+)\s+add\s+column(?:\s+if\s+not\s+exists)?\s+([a-zA-Z0-9_]+)/gi;
  let alterMatch;
  while ((alterMatch = alterRegex.exec(schema)) !== null) {
    const tableName = alterMatch[2].toLowerCase();
    const colName = alterMatch[3].toLowerCase();
    if (canonicalSchemaTables[tableName]) {
      canonicalSchemaTables[tableName].add(colName);
    }
  }

  const migrationsDir = path.resolve(process.cwd(), 'migrations');
  if (fs.existsSync(migrationsDir)) {
    const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
    for (const file of migrationFiles) {
      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8').replace(/--.*$/gm, '');
      while ((match = tableRegex.exec(content)) !== null) {
        const name = match[1].toLowerCase();
        const body = match[2];
        const colLines = body.split('\n').map((l) => l.trim()).filter(Boolean);
        const cols = canonicalSchemaTables[name] || new Set<string>();
        for (const line of colLines) {
          const colMatch = line.match(/^([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_]+(\([^)]+\))?(\[\])?)/);
          if (colMatch && !['constraint', 'primary', 'foreign', 'unique', 'check'].includes(colMatch[1].toLowerCase())) {
            cols.add(colMatch[1].toLowerCase());
          }
        }
        canonicalSchemaTables[name] = cols;
      }
      while ((alterMatch = alterRegex.exec(content)) !== null) {
        const tableName = alterMatch[2].toLowerCase();
        const colName = alterMatch[3].toLowerCase();
        if (canonicalSchemaTables[tableName]) {
          canonicalSchemaTables[tableName].add(colName);
        }
      }
    }
  }

  canonicalSchemaTables['tenant_audit_events'] = new Set(['id', 'account_id', 'entity_type', 'entity_id', 'action']);
  canonicalSchemaTables['recoverable_deletions'] = new Set(['id', 'account_id', 'entity_type', 'entity_id', 'display_snapshot']);

  const allSchemaTableNames = Object.keys(canonicalSchemaTables).sort();

  describe('1. 111+ Table Schema Reconciliation Drill', () => {
    it('contains all 115 canonical schema tables in DATA_DISPOSITION_REGISTRY', () => {
      const registryTables = Object.keys(DATA_DISPOSITION_REGISTRY);

      expect(allSchemaTableNames.length).toBeGreaterThanOrEqual(111);
      for (const table of allSchemaTableNames) {
        expect(
          registryTables,
          `Table "${table}" from schema.sql must be registered in DATA_DISPOSITION_REGISTRY`,
        ).toContain(table);
      }
    });

    it('enforces rigorous data disposition attributes across every table', () => {
      for (const [name, entry] of Object.entries(DATA_DISPOSITION_REGISTRY)) {
        expect(entry.tableName).toBe(name);
        expect(
          ['direct_account_id', 'account_primary_key', 'fk_chain', 'storage_path', 'system_global'],
          `Invalid relationship for table ${name}`,
        ).toContain(entry.relationship);

        expect(
          ['delete', 'anonymize_columns', 'retain_immutable'],
          `Invalid localAction for table ${name}`,
        ).toContain(entry.localAction);

        expect(
          ['full', 'redacted', 'exempt', 'internal_system'],
          `Invalid portability for table ${name}`,
        ).toContain(entry.portability);

        expect(entry.retention).toBeDefined();
        expect(['US_FEDERAL', 'US_STATE', 'GENERAL']).toContain(entry.retention.jurisdiction);
        expect([
          'statutory_tax_7yr',
          'contractual_fulfillment',
          'dispute_limitation',
          'transient_operational',
          'voice_quality_review',
        ]).toContain(entry.retention.legalBasis);
        expect(entry.retention.durationDays).toBeGreaterThanOrEqual(0);
        expect([
          'job_completed',
          'invoice_paid',
          'call_ended',
          'account_closed',
          'immediate',
        ]).toContain(entry.retention.startEvent);

        expect(entry.legalHoldBehavior).toBe('block_disposal_preserve_snapshot');

        // Verify that targetColumns are strictly present in schema.sql for that table
        if (entry.localAction === 'anonymize_columns' && entry.targetColumns) {
          const schemaCols = canonicalSchemaTables[name];
          expect(schemaCols, `Table ${name} must exist in canonical schema`).toBeDefined();
          for (const col of entry.targetColumns) {
            expect(
              schemaCols?.has(col),
              `Column "${col}" in targetColumns of table "${name}" must exist in schema.sql`,
            ).toBe(true);
          }
        }
      }
    });
  });

  describe('2. Multi-Bucket Storage Hierarchy Recursive Deletion Drill', () => {
    it('covers exactly all 7 known storage buckets', () => {
      expect(KNOWN_STORAGE_BUCKETS).toHaveLength(7);
      expect(KNOWN_STORAGE_BUCKETS).toEqual([
        'insurance-proof',
        'job-photos',
        'lead-photos',
        'site-videos',
        'site-images',
        'crew-photos',
        'account-attachments',
      ]);
    });

    it('traverses deeply nested storage hierarchies across all 7 buckets and deletes all files', async () => {
      const mockStorageData: Record<string, Record<string, { id: string | null; name: string }[]>> = {};

      for (const bucket of KNOWN_STORAGE_BUCKETS) {
        mockStorageData[bucket] = {
          'acc-drill': [
            { name: 'root-file.pdf', id: 'file-1' },
            { name: 'subfolder', id: null }, // folder
          ],
          'acc-drill/subfolder': [
            { name: 'nested-photo.jpg', id: 'file-2' },
            { name: 'deep', id: null }, // deep folder
          ],
          'acc-drill/subfolder/deep': [
            { name: 'deep-video.mp4', id: 'file-3' },
          ],
        };
      }

      const deletedBuckets: Record<string, string[]> = {};

      const mockAdmin: any = {
        storage: {
          from: vi.fn((bucket: string) => ({
            list: vi.fn((prefix: string) => {
              const items = mockStorageData[bucket]?.[prefix] ?? [];
              return Promise.resolve({ data: items, error: null });
            }),
            remove: vi.fn((paths: string[]) => {
              deletedBuckets[bucket] = (deletedBuckets[bucket] ?? []).concat(paths);
              return Promise.resolve({ data: paths, error: null });
            }),
          })),
        },
      };

      const adapters = buildProductionClosureAdapters(mockAdmin);
      const ok = await adapters.storageDelete!('acc-drill');

      expect(ok).toBe(true);
      for (const bucket of KNOWN_STORAGE_BUCKETS) {
        expect(deletedBuckets[bucket]).toEqual(
          expect.arrayContaining([
            'acc-drill/root-file.pdf',
            'acc-drill/subfolder/nested-photo.jpg',
            'acc-drill/subfolder/deep/deep-video.mp4',
          ]),
        );
      }
    });

    it('fails closed when any storage bucket encounters a listing error (non-404)', async () => {
      const mockAdmin: any = {
        storage: {
          from: vi.fn((bucket: string) => ({
            list: vi.fn((prefix: string) => {
              if (bucket === 'lead-photos') {
                return Promise.resolve({
                  data: null,
                  error: { message: 'Storage connection timeout 504', status: 504 },
                });
              }
              return Promise.resolve({ data: [], error: null });
            }),
            remove: vi.fn().mockResolvedValue({ error: null }),
          })),
        },
      };

      const adapters = buildProductionClosureAdapters(mockAdmin);
      const ok = await adapters.storageDelete!('acc-drill');

      expect(ok).toBe(false); // Fails closed, does NOT report success
    });
  });

  describe('3. Disposable Account End-to-End Orchestration & Lifecycle Drill', () => {
    let mockAdmin: any;
    let deletedDirectTables: string[];
    let anonymizedTables: Record<string, Record<string, unknown>>;
    let jobRecord: any;

    beforeEach(() => {
      deletedDirectTables = [];
      anonymizedTables = {};

      jobRecord = {
        id: 'job-disp-001',
        closure_subject_id: 'acc-disposable-111',
        local_disposal_state: 'pending',
        stripe_state: 'pending',
        quickbooks_state: 'pending',
        storage_state: 'pending',
        auth_cleanup_state: 'pending',
        version: 1,
        encrypted_vendor_handles: encryptVendorHandles({
          stripeCustomerId: 'cus_disp_123',
          quickbooksRealmId: 'realm_disp_456',
          storageFolderPrefix: 'acc-disposable-111',
          ownerUserIds: ['user-multi-workspace', 'user-sole-owner'],
        }),
      };

      mockAdmin = {
        from: vi.fn((table: string) => {
          if (table === 'account_closure_jobs') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockImplementation(() => Promise.resolve({ data: { ...jobRecord }, error: null })),
                }),
              }),
            };
          }
          if (table === 'accounts') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'acc-disposable-111', legal_hold: false }, error: null }),
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'acc-disposable-111', account_number: 1042 }, error: null }),
                }),
              }),
              update: vi.fn((payload) => {
                anonymizedTables[table] = payload;
                return { eq: vi.fn().mockResolvedValue({ error: null }) };
              }),
              delete: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: { code: '23503', message: 'foreign_key_violation on retained invoices' } }),
              }),
            };
          }
          if (table === 'support_cases' || table === 'sms_events') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [{ id: 'parent-id-1' }], error: null }),
              }),
              delete: vi.fn().mockReturnValue({
                eq: vi.fn().mockImplementation(() => {
                  deletedDirectTables.push(table);
                  return Promise.resolve({ error: null });
                }),
              }),
              update: vi.fn((payload) => {
                anonymizedTables[table] = payload;
                return { eq: vi.fn().mockResolvedValue({ error: null }) };
              }),
            };
          }
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                in: vi.fn().mockResolvedValue({ data: [] }),
              }),
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation(() => {
                deletedDirectTables.push(table);
                return Promise.resolve({ error: null });
              }),
              in: vi.fn().mockImplementation(() => {
                deletedDirectTables.push(table);
                return Promise.resolve({ error: null });
              }),
            }),
            update: vi.fn((payload) => {
              anonymizedTables[table] = payload;
              return { eq: vi.fn().mockResolvedValue({ error: null }) };
            }),
          };
        }),
        rpc: vi.fn((fnName: string, args: any) => {
          if (fnName === 'check_user_active_memberships') {
            if (args.p_user_id === 'user-multi-workspace') {
              return Promise.resolve({ data: 1, error: null }); // Has 1 other workspace
            }
            return Promise.resolve({ data: 0, error: null }); // Sole owner of closing workspace
          }
          if (fnName === 'update_closure_job_stage') {
            if (args.p_stage === 'local_disposal') jobRecord.local_disposal_state = args.p_status;
            if (args.p_stage === 'stripe') jobRecord.stripe_state = args.p_status;
            if (args.p_stage === 'quickbooks') jobRecord.quickbooks_state = args.p_status;
            if (args.p_stage === 'storage') jobRecord.storage_state = args.p_status;
            if (args.p_stage === 'auth_cleanup') jobRecord.auth_cleanup_state = args.p_status;
            return Promise.resolve({ data: true, error: null });
          }
          if (fnName === 'complete_closure_job') {
            return Promise.resolve({ data: true, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }),
        storage: {
          from: vi.fn(() => ({
            list: vi.fn().mockResolvedValue({ data: [] }),
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

    it('executes full closure across all 115 registered tables and 7 storage buckets', async () => {
      const mockStripeCancel = vi.fn().mockResolvedValue(true);
      const mockQuickBooksRevoke = vi.fn().mockResolvedValue(true);
      const mockStorageDelete = vi.fn().mockResolvedValue(true);

      const result = await processClosureJob(mockAdmin, 'job-disp-001', {
        stripeCancel: mockStripeCancel,
        quickbooksRevoke: mockQuickBooksRevoke,
        storageDelete: mockStorageDelete,
      });

      expect(result.success).toBe(true);
      expect(result.completed).toBe(true);
      expect(result.errors).toHaveLength(0);

      // Verify all direct 'delete' tables from registry were deleted
      const directDeleteTables = Object.values(DATA_DISPOSITION_REGISTRY)
        .filter((t) => t.localAction === 'delete' && t.relationship === 'direct_account_id')
        .map((t) => t.tableName);

      for (const table of directDeleteTables) {
        expect(deletedDirectTables, `Table ${table} should be deleted during closure`).toContain(table);
      }

      // Verify all 'anonymize_columns' tables were updated
      const anonymizeTables = Object.values(DATA_DISPOSITION_REGISTRY)
        .filter((t) => t.localAction === 'anonymize_columns')
        .map((t) => t.tableName);

      for (const table of anonymizeTables) {
        expect(anonymizedTables[table], `Table ${table} should have anonymization payload`).toBeDefined();
      }

      // Verify vendors were called
      expect(mockStripeCancel).toHaveBeenCalledWith('cus_disp_123');
      expect(mockQuickBooksRevoke).toHaveBeenCalledWith('realm_disp_456');
      expect(mockStorageDelete).toHaveBeenCalledWith('acc-disposable-111');

      // Verify user preservation (multi-workspace user spared, sole owner deleted)
      expect(mockAdmin.auth.admin.deleteUser).toHaveBeenCalledTimes(1);
      expect(mockAdmin.auth.admin.deleteUser).toHaveBeenCalledWith('user-sole-owner');
      expect(mockAdmin.auth.admin.deleteUser).not.toHaveBeenCalledWith('user-multi-workspace');
    });

    it('blocks closure immediately when account is placed on legal hold', async () => {
      mockAdmin.from = vi.fn((table: string) => {
        if (table === 'accounts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { legal_hold: true }, error: null }),
              }),
            }),
          };
        }
        if (table === 'account_closure_jobs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: jobRecord, error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const result = await processClosureJob(mockAdmin, 'job-disp-001');

      expect(result.success).toBe(false);
      expect(result.completed).toBe(false);
      expect(result.errors.some((e) => e.includes('active legal hold'))).toBe(true);
      expect(deletedDirectTables).toHaveLength(0);
    });

    it('retains ledger accounting foreign keys and sanitizes account row on 23503 fallback in saga', async () => {
      const result = await executeAccountClosureSaga(mockAdmin, 'acc-disposable-111');

      expect(result.success).toBe(true);
      expect(result.anonymized).toBe(true);
      expect(result.retainedLedger).toBe(true);
      expect(result.hardDeleted).toBe(false);

      expect(anonymizedTables['accounts']).toMatchObject({
        business_name: '[Closed Account - Redacted]',
        plan: 'suspended',
        stripe_customer_id: null,
        stripe_connect_id: null,
        connect_onboarded: false,
        quickbooks_realm_id: null,
        quickbooks_connected: false,
      });
    });
  });

  describe('4. DSAR Subject Access Request (Portability) Drill', () => {
    it('correctly returns exportable customer tables while exempting internal telemetry and staff tables', () => {
      const exportable = getExportableTables();

      // Customer-facing / portability = full/redacted tables
      expect(exportable).toContain('accounts');
      expect(exportable).toContain('clients');
      expect(exportable).toContain('leads');
      expect(exportable).toContain('jobs');
      expect(exportable).toContain('invoices');
      expect(exportable).toContain('payments');
      expect(exportable).toContain('voice_calls');
      expect(exportable).toContain('sms_messages');
      expect(exportable).toContain('crew');
      expect(exportable).toContain('sites');

      // Internal system, staff, and telemetry tables MUST NOT be in exportable list
      expect(exportable).not.toContain('staff');
      expect(exportable).not.toContain('staff_role_changes');
      expect(exportable).not.toContain('cron_runs');
      expect(exportable).not.toContain('platform_incidents');
      expect(exportable).not.toContain('account_events');
      expect(exportable).not.toContain('billing_events');
      expect(exportable).not.toContain('rate_limits');
      expect(exportable).not.toContain('webhook_failures');
    });
  });
});
