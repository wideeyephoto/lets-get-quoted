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
