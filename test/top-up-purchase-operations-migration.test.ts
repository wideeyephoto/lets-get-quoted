import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PRICING_CATALOG_VERSION, TOP_UPS, type TopUpId } from '@/lib/billing/catalog';

const MIGRATION_FILE = '20260818190000_top_up_purchase_operations.sql';
const sql = readFileSync(join(process.cwd(), 'migrations', MIGRATION_FILE), 'utf8')
  .replace(/\r\n/g, '\n');
const compact = sql.replace(/\s+/g, ' ').toLowerCase();

/**
 * The catalog binding as it stands NOW, which is not only in the file above.
 *
 * 20260819180000 drops and recreates that constraint to admit the four voice
 * SKUs. Reading only the original file would fail for them while production
 * accepted them perfectly well — asserting against a superseded definition, and
 * the assertion would be the thing that was wrong.
 *
 * Newest-wins, so this reads the later migration when it defines the constraint.
 */
const BINDING_FILE = '20260819180000_top_up_ledger_voice_skus.sql';
const effectiveBinding = readFileSync(join(process.cwd(), 'migrations', BINDING_FILE), 'utf8')
  .replace(/\r\n/g, '\n')
  .replace(/\s+/g, ' ')
  .toLowerCase();
// Comments explain what this table is NOT, so statement-level assertions have to
// read the SQL rather than the prose around it.
const statements = sql
  .split(/\n/)
  .filter((line) => !line.trimStart().startsWith('--'))
  .join(' ')
  .replace(/\s+/g, ' ')
  .toLowerCase();

function functionDefinition(name: string): string {
  const start = compact.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} must be defined`).toBeGreaterThanOrEqual(0);
  const next = compact.indexOf('create or replace function public.', start + 1);
  return compact.slice(start, next < 0 ? compact.length : next);
}

describe('the top-up purchase operation ledger', () => {
  it('is one exact timestamped, transactional migration', () => {
    expect(MIGRATION_FILE).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    expect(compact.startsWith('-- claim one top-up purchase intent exactly once, before stripe is asked.')).toBe(true);
    expect(compact).toContain('begin;');
    expect(compact.trimEnd().endsWith('commit;')).toBe(true);
  });

  it('makes a double-submitted form idempotent on the client intent', () => {
    // Without this, one intent becomes two Checkout Sessions, and paying both
    // grants twice -- correctly, by the projector's own per-Session rules.
    expect(compact).toContain(
      'constraint billing_top_up_purchase_business_key_unique unique (account_id, operation_id)',
    );
    const definition = functionDefinition('claim_stripe_top_up_purchase');
    expect(definition).toContain("'replayed'::text");
    expect(definition).toContain('top-up purchase intent was reused with different purchase data');
  });

  it('binds every recorded amount to the published catalog', () => {
    // A row cannot record a price the catalog does not carry. EVERY SKU is
    // listed, sellable or not: the price book is published, and which may be
    // SOLD is the application's decision, not a shape needing a migration.
    //
    // This is the assertion that caught the voice SKUs being added to the
    // catalog with no migration behind them — a checkout that would have failed
    // at insert, for a price the database had never been told about.
    for (const id of Object.keys(TOP_UPS) as TopUpId[]) {
      const sku = TOP_UPS[id];
      expect(effectiveBinding, `${id} must be bound to its published price`).toContain(
        `(top_up_id = '${id}' and resource_code = '${sku.resourceCode}'`
        + ` and units = ${sku.units} and unit_amount_cents = ${sku.priceCents})`,
      );
      // And the id must be admitted at all. The allowlist and the binding are
      // separate constraints, and 20260818170000 exists because two lists like
      // these drifted apart once already.
      expect(effectiveBinding, `${id} must be in the allowlist`).toContain(`'${id}'`);
    }
  });

  it('pins the catalog version the code is currently on', () => {
    expect(compact).toContain(`check (catalog_version = '${PRICING_CATALOG_VERSION}')`);
  });

  it('records the submission before Stripe is called', () => {
    // The only reason a crash mid-call is distinguishable from never trying.
    const definition = functionDefinition('begin_stripe_top_up_purchase_submission');
    expect(definition).toContain("state = 'submitted'");
    expect(definition).toContain('submission_started_at = pg_catalog.now()');
    expect(definition).toContain('attempt_count = o.attempt_count + 1');
  });

  it('keeps the claim on an indeterminate outcome', () => {
    // A Session may exist. Releasing the claim would invite a second one.
    expect(compact).toContain(
      "state = 'indeterminate' and claim_token is not null",
    );
    const definition = functionDefinition('mark_stripe_top_up_purchase_indeterminate');
    expect(definition).not.toContain('claim_token = null');
  });

  it('stops at checkout_created and leaves the money to the projector', () => {
    expect(compact).toContain("state in ('claimed', 'submitted', 'checkout_created', 'indeterminate', 'failed')");
    // Two ledgers deciding whether credit was granted is how they disagree.
    expect(statements).not.toContain('usage_credit_lots');
    expect(statements).not.toContain('grant_usage_credits');
    expect(statements).not.toContain('billing_events');
  });

  it('cannot be used as the connected-payment ledger in disguise', () => {
    // billing_payment_operations requires payment_id, charge_model 'direct' and
    // a connected acct_. A platform top-up has none of the three.
    expect(statements).not.toContain('payment_id');
    expect(statements).not.toContain('charge_model');
    expect(statements).not.toContain("~ '^acct_");
  });

  it('refuses a Session id from the wrong Stripe mode', () => {
    expect(compact).toContain("(livemode and provider_object_id ~ '^cs_live_[a-za-z0-9_]+$')");
    expect(compact).toContain("(not livemode and provider_object_id ~ '^cs_test_[a-za-z0-9_]+$')");
  });

  it('is append-only, with one legal path through the states', () => {
    expect(compact).toContain('top-up purchase operations cannot be deleted');
    expect(compact).toContain('top-up purchase operation identity is immutable');
    expect(compact).toContain('top-up purchase checkout session is immutable once recorded');
    expect(compact).toContain(
      "(old.state = 'claimed' and new.state in ('submitted', 'failed'))",
    );
    expect(compact).toContain(
      "(old.state = 'submitted' and new.state in ('checkout_created', 'failed', 'indeterminate'))",
    );
    expect(compact).toContain(
      "(old.state = 'indeterminate' and new.state in ('checkout_created', 'failed'))",
    );
  });

  it('is service-role only, with row level security and no policy', () => {
    expect(compact).toContain('alter table public.billing_top_up_purchase_operations enable row level security');
    expect(compact).not.toMatch(/create policy[^;]*billing_top_up_purchase_operations/);
    // The trigger guard is revoked outright: a trigger fires without an EXECUTE
    // check, so nobody needs to be able to call it directly.
    expect(compact).toContain(
      'revoke all on function public.protect_billing_top_up_purchase_operation() from public, anon, authenticated',
    );
  });

  const privileged: Array<[string, string]> = [
    ['claim_stripe_top_up_purchase', 'uuid, text, text, text, bigint, text, boolean, text, text, bigint, text'],
    ['begin_stripe_top_up_purchase_submission', 'uuid, uuid, text'],
    ['complete_stripe_top_up_purchase', 'uuid, uuid, text'],
    ['mark_stripe_top_up_purchase_indeterminate', 'uuid, uuid, text'],
    ['fail_stripe_top_up_purchase', 'uuid, uuid, text'],
  ];

  it.each(privileged)('%s is pinned, schema-qualified, and service-role only', (name, signature) => {
    const definition = functionDefinition(name);
    expect(definition).toContain('security definer');
    expect(definition).toContain("set search_path = ''");
    expect(definition).toContain("set timezone to 'utc'");

    const qualified = `public.${name}(${signature})`;
    expect(compact).toContain(`revoke all on function ${qualified} from public, anon, authenticated, service_role`);
    expect(compact).toContain(`grant execute on function ${qualified} to service_role`);
  });
});
