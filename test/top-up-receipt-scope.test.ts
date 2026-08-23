import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  CONNECTED_PAYMENT_EVENT_TYPES,
  PLATFORM_SUBSCRIPTION_EVENT_TYPES,
  PLATFORM_TOP_UP_EVENT_TYPES,
} from '@/lib/billing/stripe-event-inbox';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = read('migrations/20260818140000_top_up_receipt_scope.sql');
const INBOX = read('src/lib/billing/stripe-event-inbox.ts');

describe('the top-up receipt scope', () => {
  it('accepts exactly the one-off Checkout types a purchase produces', () => {
    expect([...PLATFORM_TOP_UP_EVENT_TYPES]).toEqual([
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'checkout.session.async_payment_failed',
      'checkout.session.expired',
    ]);
  });

  it('declares the same types the migration admits', () => {
    // Code and constraint disagreeing here means an event the route accepts and
    // the database then rejects — a 500 on a paid purchase.
    //
    // The migration builds its constraint inside a SQL string literal, so every
    // quote is doubled on disk. Undo that before comparing, rather than writing
    // the assertion against an escaping artefact.
    const unescaped = MIGRATION.replace(/''/g, "'");
    for (const type of PLATFORM_TOP_UP_EVENT_TYPES) {
      expect(unescaped, `${type} missing from the migration`).toContain(`'${type}'::text`);
    }
  });

  it('overlaps connected-payment types, which is why scope is declared not inferred', () => {
    // The same checkout.session.completed means "a contractor was paid" under one
    // scope and "a workspace bought credits" under the other. They bind to
    // different columns, so the route must state which it is.
    const shared = PLATFORM_TOP_UP_EVENT_TYPES.filter(
      (t) => (CONNECTED_PAYMENT_EVENT_TYPES as readonly string[]).includes(t),
    );
    expect(shared.length).toBeGreaterThan(0);
    expect(INBOX).toContain("if (expectedScope === 'platform_top_up')");
  });

  it('shares no type with the subscription scope', () => {
    for (const type of PLATFORM_TOP_UP_EVENT_TYPES) {
      expect(PLATFORM_SUBSCRIPTION_EVENT_TYPES as readonly string[]).not.toContain(type);
    }
  });

  it('is receipt-only: the migration forbids any projected shape', () => {
    // Landing receipt before projection means a paid top-up cannot be lost while
    // the projector is unwritten, and cannot be half-projected either — there is
    // no legal projected shape for this scope to write.
    expect(MIGRATION).toContain('projection_schema_version is null');
    expect(MIGRATION).toContain('projection_applied is null');
    expect(MIGRATION).toContain('projection_result is null');
    expect(MIGRATION).toContain('processed_at is null');
  });

  it('extends the existing constraints instead of retyping them', () => {
    // Two of the four are hundreds of characters of nested boolean logic.
    // Retyping one to add a branch is how a subtle inversion gets introduced.
    expect(MIGRATION).toContain('pg_get_constraintdef');
    expect(MIGRATION).toContain('or %s');
    // And it proves the outcome rather than assuming it.
    expect(MIGRATION).toContain('expected 4 constraints to admit platform_top_up');
  });

  it('binds to the platform, never to a connected account', () => {
    expect(MIGRATION).toContain('(provider_account_id is null)');
  });
});
