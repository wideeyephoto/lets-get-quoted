import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PLATFORM_TOP_UP_EVENT_TYPES } from '@/lib/billing/stripe-event-inbox';

const MIGRATION_FILE = '20260818170000_top_up_inbox_ingest_scope.sql';
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

const sql = read(`migrations/${MIGRATION_FILE}`);
const compact = sql.replace(/\s+/g, ' ').toLowerCase();
const INBOX_MIGRATION = read('migrations/20260815231620_stripe_event_inbox.sql');

describe('the top-up inbox ingest scope', () => {
  it('is one exact timestamped, transactional migration ordered after the receipt scope', () => {
    expect(MIGRATION_FILE).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    expect(MIGRATION_FILE > '20260818140000_top_up_receipt_scope.sql').toBe(true);
    expect(compact.startsWith('-- let the inbox rpc accept the scope its table already accepts.')).toBe(true);
    expect(compact).toContain('begin;');
    expect(compact.trimEnd().endsWith('commit;')).toBe(true);
  });

  it('patches the function from its own live source instead of retyping it', () => {
    expect(compact).toContain('pg_get_functiondef');
    expect(compact).toContain('$needle$');
    expect(compact).toContain('$replacement$');
    // Fail closed on a drifted body rather than silently rewriting it.
    expect(compact).toContain('stripe event inbox scope dispatch source contract drifted');
    expect(compact).toContain('is distinct from pg_catalog.length(v_old)');
    // A whole re-declaration of the function would be a retype, not a patch.
    expect(compact).not.toContain('create or replace function public.ingest_stripe_event_inbox');
  });

  it('is a no-op on a database that already has the branch', () => {
    // The replacement ends with the anchor it replaced, so without this guard a
    // second apply appends a second, unreachable copy of the branch.
    expect(compact).toContain("if pg_catalog.strpos(v_before, 'platform_top_up') > 0 then return; end if;");
  });

  it('names the function with the signature it actually has', () => {
    // A regprocedure cast with the wrong argument list fails at apply time.
    expect(compact).toContain(
      "'public.ingest_stripe_event_inbox(text,text,text,text,boolean,text,timestamptz,jsonb)'",
    );
    expect(INBOX_MIGRATION).toContain('create or replace function public.ingest_stripe_event_inbox(');
    for (const parameter of [
      'p_provider_event_id text',
      'p_event_type text',
      'p_event_scope text',
      'p_provider_account_id text',
      'p_livemode boolean',
      'p_api_version text',
      'p_provider_created_at timestamptz',
      'p_payload jsonb',
    ]) {
      expect(INBOX_MIGRATION, `${parameter} must still be the signature`).toContain(parameter);
    }
  });

  it('admits exactly the four one-off Checkout types the receipt scope permits', () => {
    for (const type of PLATFORM_TOP_UP_EVENT_TYPES) {
      expect(compact, `${type} must be admitted`).toContain(`'${type}'`);
    }
    expect(compact).toContain('unsupported platform top-up event type');
  });

  it('keeps a top-up bound to the platform, never to a connected account', () => {
    expect(compact).toContain('if p_provider_account_id is not null then');
    expect(compact).toContain('platform top-up events must not contain event.account');
  });

  it('pins the data object type so a mismatched payload cannot land', () => {
    expect(compact).toContain("v_expected_object_type := 'checkout.session'");
  });

  it('proves the outcome rather than assuming it', () => {
    expect(compact).toContain('inbox ingest does not admit platform_top_up');
    expect(compact).toContain('inbox ingest top-up branch is incomplete');
    expect(compact).toContain('inbox ingest lost an existing scope branch');
    // The two scopes that already existed must still be refused correctly.
    expect(compact).toContain('unsupported platform subscription event type');
    expect(compact).toContain('connected-account payment events require a valid event.account');
    expect(compact).toContain('unsupported stripe event scope');
  });

  it('compares line endings on LF on both sides, so transport cannot block it', () => {
    // pg_get_functiondef returns a plpgsql body verbatim, line endings included.
    // The stored body depends on how the prerequisite was applied (20260817120000
    // repaired CRLF bodies), and this file's depend on how it reached the server:
    // pasting it into a browser SQL editor can turn every LF into CRLF. Normalise
    // both, or the needle is unmatchable for reasons that are purely transport.
    expect(sql).not.toContain('\r');
    expect(compact).toContain('v_before := pg_catalog.replace(v_before, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10))');
    expect(compact).toContain('v_old := pg_catalog.replace(v_old, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10))');
    const runner = read('scripts/run-migration.mjs');
    expect(runner).toContain("replace(/\\r\\n/g, '\\n')");
  });
});
