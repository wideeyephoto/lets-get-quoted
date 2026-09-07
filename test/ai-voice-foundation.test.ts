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

describe('receipt replays resume unfinished settlement', () => {
  const route = () => read('src', 'app', 'api', 'voice', 'receipt', 'route.ts');
  const processor = () => read('src', 'lib', 'voice', 'receipt-processing.ts');
  const leads = () => read('src', 'lib', 'leads.ts');

  it('does not confuse an inbox duplicate with completed work', () => {
    expect(route()).not.toMatch(/if\s*\(\s*!inserted\s*\)/);
    expect(route()).toContain('processVoiceReceipt(admin, voiceEventId, receipt)');
  });

  it('claims before settlement and completes only after settlement returns', () => {
    const source = processor();
    expect(source.indexOf('await store.claim(eventId)'))
      .toBeLessThan(source.indexOf('await settle(admin, receipt'));
    expect(source.indexOf('await settle(admin, receipt'))
      .toBeLessThan(source.indexOf('await store.complete(claim)'));
  });

  it('idempotently reuses the lead created by a prior ambiguous attempt', () => {
    expect(leads()).toContain("onConflict: 'source_voice_event_id'");
    expect(leads()).toContain('ignoreDuplicates: true');
    expect(leads()).toContain(".eq('source_voice_event_id', voiceEventId)");
    expect(read('src', 'lib', 'voice', 'settlement.ts'))
      .toContain('sourceVoiceEventId: options.voiceEventId');
  });
});

describe('the voice SKUs exist, and cannot be bought', () => {
  it('names both, so the price book is not carried in a conversation', async () => {
    const { TOP_UPS } = await import('@/lib/billing/catalog');
    // Three SKUs, not one: the published price differs by plan and every
    // mechanism downstream binds one price to one SKU -- the Stripe seeder mints
    // a Price per entry, and the purchase ledger CHECKs one unit_amount_cents
    // per top_up_id. A single entry made that constraint unsatisfiable for two
    // plans out of three.
    expect(TOP_UPS.ai_voice_flex).toMatchObject({ priceCents: 6_900, units: 100 });
    expect(TOP_UPS.ai_voice_solo).toMatchObject({ priceCents: 5_900, units: 100 });
    expect(TOP_UPS.ai_voice_growth).toMatchObject({ priceCents: 5_500, units: 200 });
    for (const id of ['ai_voice_flex', 'ai_voice_solo', 'ai_voice_growth'] as const) {
      expect(TOP_UPS[id]).toMatchObject({
        recurring: true, fulfillment: 'recurring_capacity', resourceCode: 'voice_minutes',
      });
      // Each is eligible on exactly its own plan; Scale includes voice already.
      expect(TOP_UPS[id].eligiblePlans).toHaveLength(1);
      expect(TOP_UPS[id].eligiblePlans).not.toContain('scale');
    }
    expect(TOP_UPS.voice_minutes_100).toMatchObject({
      priceCents: 3_500, recurring: false, fulfillment: 'usage_credit', resourceCode: 'voice_minutes',
    });
  });

  it('withholds all four voice SKUs from sale', async () => {
    const { SELLABLE_TOP_UP_IDS, TOP_UPS_WITHHELD } = await import('@/lib/billing/catalog');
    for (const id of ['ai_voice_flex', 'ai_voice_solo', 'ai_voice_growth', 'voice_minutes_100']) {
      expect(SELLABLE_TOP_UP_IDS, id).not.toContain(id);
      expect(TOP_UPS_WITHHELD, id).toHaveProperty(id);
    }
  });

  it('prices overage at the top-up rate, never above it', async () => {
    const { TOP_UPS } = await import('@/lib/billing/catalog');
    const { OVERAGE_RATE_MILLICENTS } = await import('@/lib/billing/usage-overage');
    const pack = TOP_UPS.voice_minutes_100;
    const packRate = (pack.priceCents * 1000) / pack.units;
    // The invariant every rate here obeys: planning ahead must never cost more
    // than not planning ahead. Voice is the one where they are equal.
    expect(OVERAGE_RATE_MILLICENTS.voice_minutes).toBe(35_000);
    expect(OVERAGE_RATE_MILLICENTS.voice_minutes).toBeLessThanOrEqual(packRate);
  });

  it('keeps a margin against the measured provider cost', async () => {
    const { OVERAGE_RATE_MILLICENTS } = await import('@/lib/billing/usage-overage');
    // $0.1666/min: AI runtime $0.1600 + inbound PSTN $0.0066, measured.
    const costMillicents = 16_660;
    expect(OVERAGE_RATE_MILLICENTS.voice_minutes).toBeGreaterThan(costMillicents);
  });
});

describe('the receipt route can be diagnosed without leaking anything', () => {
  const route = () => readFileSync(
    join(process.cwd(), 'src', 'app', 'api', 'voice', 'receipt', 'route.ts'), 'utf8');

  it('tells an unset credential apart from a wrong one', () => {
    // These were the same bodyless 401 once, and an operator with a Vercel
    // Sensitive variable -- write-only, unreadable by anyone -- had no way to
    // tell "never reached the build" from "does not match".
    const source = route();
    expect(source).toContain("status: 503");
    expect(source).toContain("error: 'not_configured'");
  });

  it('never puts either credential in the response', () => {
    const source = route();
    const unauthorized = source.slice(source.indexOf('if (!auth.ok)'));
    // The 401 body is null. Everything diagnostic goes to webhook_failures,
    // which only the service role can read.
    expect(unauthorized).toContain('new NextResponse(null, { status: 401 })');
    expect(unauthorized).not.toMatch(/NextResponse\.json\([^)]*expected/);
  });

  it('logs only a fixed auth reason, never credential material or a fingerprint', () => {
    const source = route();
    expect(source).toContain('Voice receipt authentication failed: ${auth.reason}');
    expect(source).not.toContain("digest('hex').slice(0, 8)");
    expect(source).not.toContain('username matches');
    expect(source).not.toContain('password differs');
    expect(source).not.toContain('request.headers.get(\'authorization\')');
  });
});
