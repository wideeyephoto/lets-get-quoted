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
    expect(exportable).toContain('billing_subscriptions');
    expect(exportable).toContain('client_portal_access');
    expect(exportable).toContain('quickbooks_connections');
    expect(exportable).toContain('webhook_subscriptions');
    expect(exportable).toContain('support_case_notes');

    // Internal system audit & staff notes must NOT be exported
    expect(exportable).not.toContain('account_events');
    expect(exportable).not.toContain('account_notes');
    expect(exportable).not.toContain('account_tags');
  });

  it('strictly excludes internal staff notes and tags from portability export', () => {
    expect(DATA_DISPOSITION_REGISTRY.account_notes.portability).toBe('internal_system');
    expect(DATA_DISPOSITION_REGISTRY.account_tags.portability).toBe('internal_system');
  });

  it('guarantees every table marked full or redacted is in getExportableTables()', () => {
    const exportableSet = new Set(getExportableTables());
    for (const [name, entry] of Object.entries(DATA_DISPOSITION_REGISTRY)) {
      if (entry.portability === 'full' || entry.portability === 'redacted') {
        expect(exportableSet.has(name)).toBe(true);
      } else {
        expect(exportableSet.has(name)).toBe(false);
      }
    }
  });

  it('enforces non-empty exportRedactions on all tables marked redacted', () => {
    for (const [name, entry] of Object.entries(DATA_DISPOSITION_REGISTRY)) {
      if (entry.portability === 'redacted') {
        expect(entry.exportRedactions).toBeDefined();
        expect(Array.isArray(entry.exportRedactions)).toBe(true);
        expect(entry.exportRedactions!.length).toBeGreaterThan(0);
      }
    }

    // Specific key checks for secret/credential fields
    expect(DATA_DISPOSITION_REGISTRY.client_portal_access.exportRedactions).toContain('token_hash');
    expect(DATA_DISPOSITION_REGISTRY.billing_subscriptions.exportRedactions).toContain('stripe_subscription_id');
    expect(DATA_DISPOSITION_REGISTRY.billing_subscriptions.exportRedactions).toContain('stripe_customer_id');
    expect(DATA_DISPOSITION_REGISTRY.quickbooks_connections.exportRedactions).toContain('access_token');
    expect(DATA_DISPOSITION_REGISTRY.quickbooks_connections.exportRedactions).toContain('refresh_token');
    expect(DATA_DISPOSITION_REGISTRY.webhook_subscriptions.exportRedactions).toContain('secret_hash');
    expect(DATA_DISPOSITION_REGISTRY.support_case_notes.exportRedactions).toContain('body');
  });
});
