import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8');
}

/**
 * The AI Voice Receptionist rail, built in the order docs/ai-voice-v1-decisions.md
 * section 9 sets out: contracts before the provider. This file grows with it.
 *
 * Nothing here tests behaviour yet, because there is no behaviour yet. What it
 * pins are the things that fail silently and late if they drift.
 */
describe('the AI voice failure log can record a failure', () => {
  const migration = () => read('migrations', '20260819100000_webhook_source_ai_voice.sql');

  it('has a value of its own, distinct from the dial-and-forward rail', () => {
    // 'sms_voice' is the existing rail that rings the contractor's real line. An
    // AI receptionist answers instead: different payloads, different provider
    // surface. The Command Center renders `source` directly, so sharing a value
    // would make a signature failure on one indistinguishable from the other at
    // the only place anybody looks.
    expect(read('src', 'lib', 'webhook-failures.ts')).toContain("| 'ai_voice'");
    expect(migration()).toContain("'ai_voice'");
  });

  it('widens the constraint in a MIGRATION, not only in schema.sql', () => {
    // schema.sql and migrations/ genuinely diverge in this repo -- accounts.
    // call_tracking_number exists in schema.sql and in no migration, so
    // migrations/ alone against a fresh database does not produce it. The
    // parity test in test/sms-provider.test.ts reads schema.sql, so on its own
    // it would pass for a constraint no migration ever widens.
    expect(migration()).toMatch(/alter table webhook_failures\s+add constraint/);
    expect(read('schema.sql')).toContain("'ai_voice'");
  });

  it('keeps every value that was already legal', () => {
    // Existing rows carry these and the constraint must not refuse the table's
    // own past. Dropping one would not rewrite history, only make it unreadable.
    const sql = migration();
    for (const value of [
      'stripe', 'resend', 'twilio_inbound', 'twilio_status',
      'sms_inbound', 'sms_status', 'sms_voice',
    ]) {
      expect(sql, `${value} was dropped from the constraint`).toContain(`'${value}'`);
    }
  });

  it('proves the widened constraint admits the value before committing', () => {
    // The constraint is one long string literal. Asserting on it from inside the
    // same transaction is the difference between "the text was edited" and "the
    // database accepts it".
    expect(migration()).toContain('does not admit ai_voice');
    expect(migration()).toContain('pg_get_constraintdef');
  });

  it('lands before anything writes the value, which is why the order is free', () => {
    // logWebhookFailure swallows its own insert error, so a CHECK violation does
    // not throw, does not retry, and surfaces nowhere. Applying the migration
    // while nothing writes 'ai_voice' costs nothing; the reverse order silently
    // stops recording failures on a brand-new webhook.
    const writers = ['src/lib/webhook-failures.ts'];
    for (const file of writers) {
      const source = read(...file.split('/'));
      expect(source).not.toMatch(/source:\s*'ai_voice'/);
    }
    expect(migration()).toContain('APPLY THIS BEFORE');
  });
});

describe('the receipt boundary settles only calls LGQ admitted', () => {
  const migration = () => read('migrations', '20260819120000_voice_event_inbox.sql');

  // Proven end to end against a real PostgreSQL 17 by
  // scripts/verify-voice-event-inbox.mjs (npm run test:pg17:voice-inbox), 23/23.
  // These are the cheap half, and they run in the default suite.

  it('binds an unadmitted receipt to no workspace', () => {
    // The measured provider sends no signature and offers no signing secret, so
    // the transport cannot be what a bill rests on. This is what can: a receipt
    // whose call id matches no admission reaches no ledger function.
    const sql = migration();
    expect(sql).toContain('create table if not exists public.voice_call_admissions');
    expect(sql).toContain('provider_call_id = p_provider_call_id');
    expect(sql).toContain("v_status := 'ignored'");
  });

  it('keeps an unexplained receipt rather than dropping it', () => {
    // Silently discarding one would hide an attack and a misconfiguration
    // equally well.
    expect(migration()).toMatch(/still (written|stored)|worth being able to find/);
  });

  it('refuses a receipt that changed between deliveries', () => {
    // A retry is byte-identical. Anything else would let a second delivery
    // restate what a call cost after the first was settled.
    expect(migration()).toContain('different immutable input');
  });

  it('checks the two identifiers a signature would otherwise cover', () => {
    expect(migration()).toContain('project does not match this deployment');
    expect(migration()).toContain('space does not match this deployment');
  });

  it('keeps the event type in the dedupe key', () => {
    // One receipt per call today, so the bare call id would be unique -- and a
    // second event type would then collide with the first and be rejected as a
    // duplicate of something it is not.
    expect(migration()).toContain("v_event_id := p_provider_call_id || ':' || p_event_type");
  });

  it('asserts the RPC handles every event type its own table admits', () => {
    // 20260818170000 exists because those two lists drifted: a verified delivery
    // reached the RPC, came back 22023, became a 500, and was retried forever.
    // Mutation-checked -- widening only the table CHECK fails the migration with
    // "does not handle event type call_started, which its table admits".
    const sql = migration();
    expect(sql).toContain('does not handle event type %, which its table admits');
    expect(sql).toContain('pg_get_constraintdef');
  });

  it('keeps transcripts away from every browser role', () => {
    const sql = migration();
    expect(sql).toContain('alter table public.voice_events enable row level security');
    expect(sql).toContain('revoke all on table public.voice_events from public, anon, authenticated');
    expect(sql).not.toMatch(/create policy[\s\S]*voice_events/i);
    expect(sql).toMatch(/grant execute on function public\.ingest_voice_event[\s\S]{0,120}to service_role/);
  });
});
