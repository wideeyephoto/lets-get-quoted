import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SELLABLE_TOP_UP_IDS, TOP_UPS, TOP_UPS_WITHHELD } from '@/lib/billing/catalog';

/**
 * The half that turns a paid capacity purchase into a ledger row.
 *
 * Source assertions. The behaviour is verified for real by
 * scripts/verify-top-up-capacity-grant.mjs, which boots PostgreSQL 17, creates
 * the projector from its own migration, applies this patch to it and exercises
 * the grant, the replay and both refusals. What lives here is the part a real
 * engine cannot check: that the patch anchors still exist in the source it will
 * be applied to, and that measuring and granting did not quietly put the SKU on
 * sale.
 */

const MIGRATIONS = join(process.cwd(), 'migrations');
const FILE = '20260819010000_top_up_capacity_grant.sql';
const PROJECTOR = '20260818160000_top_up_projection_shape.sql';

const read = (name: string) => readFileSync(join(MIGRATIONS, name), 'utf8').replace(/\r\n/g, '\n');

const sql = read(FILE);
const projector = read(PROJECTOR);
const statements = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

describe('the capacity grant migration', () => {
  it('is one exact timestamped, transactional migration', () => {
    expect(FILE).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    expect(sql).toContain('begin;');
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
  });

  it('patches the projector from its own live source rather than retyping it', () => {
    // Retyping would silently overwrite whatever is actually deployed. The house
    // pattern reads pg_get_functiondef and replaces inside it.
    expect(statements).toContain('pg_get_functiondef');
    expect(statements).toContain('project_stripe_platform_top_up_event(uuid,uuid,jsonb)');
    expect(statements).not.toMatch(/create or replace function public\.project_stripe_platform_top_up_event/);
  });

  it('normalises CRLF before matching, which production needed once already', () => {
    expect(statements).toContain('pg_catalog.chr(13) || pg_catalog.chr(10)');
  });

  it('returns early when it has already been applied', () => {
    expect(statements).toContain("strpos(v_before, 'top_up_capacity_granted') > 0");
  });

  it('refuses a drifted source instead of half-patching it', () => {
    expect(statements).toContain('top-up projector source contract drifted');
    expect(statements).toContain("errcode = '55000'");
  });
});

describe('the patch anchors', () => {
  /**
   * Each anchor must appear exactly once in the projector's own migration. If an
   * edit to 20260818160000 ever moves or duplicates one of these, this fails here
   * -- at the point somebody can still fix it -- rather than at 55000 during a
   * production migration.
   */
  const anchors: ReadonlyArray<readonly [string, string]> = [
    ['the local declarations', '  v_applied boolean;\nbegin'],
    ['the outcome whitelist', "       'capacity_fulfillment_deferred') then"],
    ['the event-type possibility check', "('fulfillment_withheld', 'capacity_fulfillment_deferred')"],
    ['the branch insertion point', "    v_status := 'processed';\n  else"],
  ];

  for (const [label, anchor] of anchors) {
    it(`finds ${label} exactly once in the projector`, () => {
      expect(projector.split(anchor)).toHaveLength(2);
    });

    it(`patches ${label}`, () => {
      // The migration builds multi-line needles from chr(10), so only the first
      // line appears as one literal. Single quotes are doubled inside it.
      const firstLine = anchor.split('\n')[0].replace(/'/g, "''");
      expect(statements).toContain(firstLine);
    });
  }
});

describe('what the grant writes', () => {
  it('writes the capacity ledger', () => {
    expect(statements).toContain('insert into public.workspace_purchased_capacity');
  });

  it('takes livemode from the event, never from the projection payload', () => {
    // A mode is an identity. The one on the row Stripe signed is the only one
    // that cannot be talked into disagreeing with the money.
    expect(statements).toContain('v_event.livemode, v_subscription');
    expect(statements).not.toContain("p_projection ->> ''livemode''");
  });

  it('keys idempotency on the subscription, not the Session', () => {
    // A Session is projected once; the subscription outlives it and sends its
    // own events. Keying on the Session would double-grant on a renewal.
    expect(statements).toContain('c.stripe_subscription_id = v_subscription');
    expect(statements).toContain('top_up_capacity_already_granted');
  });

  it('refuses a capacity grant with no subscription to cancel later', () => {
    expect(statements).toContain('top-up capacity projection is incomplete');
    expect(statements).toContain('sub_[A-Za-z0-9]{8,}');
  });

  it('asserts the credit path survived the patch', () => {
    expect(statements).toContain('public.grant_usage_credits(');
    expect(statements).toContain('top-up projector lost the usage-credit path');
    expect(statements).toContain('top-up projector lost its claim lock');
  });
});

describe('what this migration deliberately does not do', () => {
  it('grants without cancelling, so a capacity SKU needs the lifecycle sweep too', () => {
    // Granting is half the rail: this migration writes a row on payment and
    // nothing in THIS file cancels one when the subscription lapses. That is
    // still true, and it is why a capacity SKU cannot go on sale on the strength
    // of this migration alone -- the emptier lives in the capacity lifecycle
    // sweep, and the counter must decline to count what it marked canceled.
    expect(sql).not.toMatch(/status\s*=\s*'canceled'/i);

    // Asserted by fulfillment kind rather than by id, so a NEW capacity SKU
    // cannot quietly become sellable by being added to the catalog.
    //
    // crew_user used to be the one exception, named here rather than
    // pattern-matched, because it went on sale on 2026-08-20 once the sweep and
    // the `active`/`past_due` counter were verified. It came back on 2026-08-23:
    // fulfilment was never the problem, CANCELLATION was, and nothing in the
    // product can end a top-up subscription. So there is no exception now, and
    // the rule is the plain one -- no recurring_capacity SKU is sellable.
    const withheldCapacitySkus = Object.values(TOP_UPS)
      .filter((sku) => sku.fulfillment === 'recurring_capacity' && sku.id !== 'crew_user')
      .map((sku) => sku.id);
    expect(withheldCapacitySkus.length).toBeGreaterThan(0);
    for (const id of withheldCapacitySkus) {
      expect(TOP_UPS_WITHHELD, `${id} is a withheld capacity SKU`).toHaveProperty(id);
      expect(SELLABLE_TOP_UP_IDS).not.toContain(id);
    }
    expect(SELLABLE_TOP_UP_IDS).toContain('crew_user');
  });

  it('says so in the file, so the next reader is not surprised', () => {
    expect(sql).toContain('WHAT THIS STILL DOES NOT DO');
  });
});
