import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_FILE = '20260815222334_billing_audit_guards.sql';
const sql = readFileSync(join(process.cwd(), 'migrations', MIGRATION_FILE), 'utf8')
  .replace(/\r\n/g, '\n');
const compact = sql.replace(/\s+/g, ' ').toLowerCase();

describe('billing audit guard migration', () => {
  it('is transactional', () => {
    expect(compact).toContain('begin;');
    expect(compact.trimEnd().endsWith('commit;')).toBe(true);
  });

  it('freezes durable operation identity and blocks deletion', () => {
    for (const field of [
      'account_id', 'payment_id', 'operation_type', 'operation_id', 'charge_model',
      'stripe_account_id', 'stripe_idempotency_key', 'request_fingerprint', 'metadata', 'created_at',
    ]) {
      expect(compact).toContain(`old.${field} is distinct from new.${field}`);
    }
    expect(compact).toContain('billing payment operation audit rows cannot be deleted');
    expect(compact).toContain('billing payment operation provider object is immutable once assigned');
    expect(compact).toContain('billing payment operation attempt count cannot decrease');
    expect(compact).toContain('billing_payment_operations_terminal_timestamp_check');
  });

  it('permits only explicit operation recovery and completion transitions', () => {
    for (const transition of [
      "old.state = 'claimed' and new.state in ('submitted', 'failed', 'indeterminate')",
      "old.state = 'submitted' and new.state in ('succeeded', 'failed', 'indeterminate')",
      "old.state = 'indeterminate' and new.state in ('submitted', 'succeeded', 'failed')",
      "old.state = 'failed' and new.state in ('claimed', 'submitted')",
    ]) {
      expect(compact).toContain(transition);
    }
  });

  it('keeps event payloads append-only while allowing one-time workspace resolution', () => {
    expect(compact).toContain('billing event audit rows cannot be deleted');
    expect(compact).toContain('billing event identity and payload are immutable');
    expect(compact).toContain('old.account_id is not null and old.account_id is distinct from new.account_id');
    expect(compact).toContain('old.billing_subscription_id is not null and old.billing_subscription_id is distinct from new.billing_subscription_id');
    expect(compact).toContain('billing event attempt count cannot decrease');
  });

  it('permits only claim, completion, failure, retry, and ignore event transitions', () => {
    for (const transition of [
      "old.processing_status = 'received' and new.processing_status in ('processing', 'ignored')",
      "old.processing_status = 'processing' and new.processing_status in ('processed', 'failed', 'ignored')",
      "old.processing_status = 'failed' and new.processing_status in ('processing', 'ignored')",
    ]) {
      expect(compact).toContain(transition);
    }
  });
});
