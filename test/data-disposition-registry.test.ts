import { describe, it, expect } from 'vitest';
import { DATA_DISPOSITION_REGISTRY, getExportableTables } from '../src/lib/data-disposition-registry';

describe('multidimensional data disposition registry', () => {
  it('covers core Account, CRM, financial, communication, and workforce tables', () => {
    const tables = Object.keys(DATA_DISPOSITION_REGISTRY);

    expect(tables).toContain('accounts');
    expect(tables).toContain('clients');
    expect(tables).toContain('leads');
    expect(tables).toContain('jobs');
    expect(tables).toContain('invoices');
    expect(tables).toContain('invoice_items');
    expect(tables).toContain('payments');
    expect(tables).toContain('voice_calls');
    expect(tables).toContain('sms_messages');
    expect(tables).toContain('sms_consent');
    expect(tables).toContain('messaging_registrations');
    expect(tables).toContain('messaging_registration_applications');
    expect(tables).toContain('crew');
    expect(tables).toContain('account_events');
  });

  it('enforces valid multidimensional attributes on all entries', () => {
    for (const [name, entry] of Object.entries(DATA_DISPOSITION_REGISTRY)) {
      expect(entry.tableName).toBe(name);
      expect(['direct_account_id', 'account_primary_key', 'fk_chain', 'storage_path', 'system_global']).toContain(entry.relationship);
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
    expect(exportable).toContain('accounts');
    expect(exportable).toContain('clients');
    expect(exportable).toContain('invoices');
    expect(exportable).toContain('voice_calls');
    expect(exportable).toContain('sms_messages');
    expect(exportable).toContain('messaging_registrations');
    expect(exportable).toContain('messaging_registration_applications');
    expect(exportable).not.toContain('account_events'); // internal system audit
  });
});
