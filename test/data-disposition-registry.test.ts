import { describe, it, expect } from 'vitest';
import { DATA_DISPOSITION_REGISTRY, getExportableTables } from '../src/lib/data-disposition-registry';

describe('multidimensional data disposition registry', () => {
  it('covers core CRM, financial, communication, and audit tables', () => {
    const tables = Object.keys(DATA_DISPOSITION_REGISTRY);

    expect(tables).toContain('clients');
    expect(tables).toContain('leads');
    expect(tables).toContain('jobs');
    expect(tables).toContain('invoices');
    expect(tables).toContain('invoice_items');
    expect(tables).toContain('payments');
    expect(tables).toContain('voice_calls');
    expect(tables).toContain('sms_messages');
    expect(tables).toContain('sms_consent');
    expect(tables).toContain('crew');
    expect(tables).toContain('account_events');
  });

  it('enforces valid multidimensional attributes on all entries', () => {
    for (const [name, entry] of Object.entries(DATA_DISPOSITION_REGISTRY)) {
      expect(entry.tableName).toBe(name);
      expect(['direct_account_id', 'fk_chain', 'storage_path']).toContain(entry.relationship);
      expect(['delete', 'anonymize_columns', 'retain_immutable']).toContain(entry.localAction);
      expect(['full', 'redacted', 'exempt', 'internal_system']).toContain(entry.portability);
      expect(entry.retention).toBeDefined();
      expect(entry.retention.legalBasis).toBeDefined();
      expect(entry.retention.startEvent).toBeDefined();
      expect(entry.legalHoldBehavior).toBe('block_disposal_preserve_snapshot');
    }
  });

  it('correctly filters exportable tables for subject access requests', () => {
    const exportable = getExportableTables();
    expect(exportable).toContain('clients');
    expect(exportable).toContain('invoices');
    expect(exportable).toContain('voice_calls');
    expect(exportable).toContain('sms_messages');
    expect(exportable).not.toContain('webhook_failures'); // internal
    expect(exportable).not.toContain('account_events'); // internal system audit
  });
});
