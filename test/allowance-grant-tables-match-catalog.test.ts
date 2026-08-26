import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BILLING_PLANS } from '@/lib/billing/catalog';

/**
 * WHAT IS SOLD AND WHAT IS GRANTED HAVE TO BE THE SAME NUMBER.
 *
 * They were not. Both per-plan grant tables in SQL spelled Scale's monthly
 * allowance as Growth's -- 1,500 / 2,500 / 500 / 250 against a published
 * 3,000 / 5,000 / 1,000 / 500. Exactly half, on every line, on a $329 plan
 * sold against Growth's $129.
 *
 * Nothing errored, and nothing could have. The 2026-08-18 catalog change raised
 * Scale's published allowances and its feature_limits and left the grant tables
 * alone, and the two halves stayed internally consistent: the projector granted
 * 1,500 and the monthly reset re-granted 1,500. A subscriber would simply have
 * received less than the catalogue promised, for ever, with no failure anywhere
 * to notice.
 *
 * So this reads the numbers out of the migrations and holds them against
 * BILLING_PLANS, which is what the pricing page renders from.
 */

const MIGRATIONS = join(process.cwd(), 'migrations');

/**
 * The grant tables are `case <plan col> when 'solo' then A when 'growth' then B
 * when 'scale' then C end`, one per resource. Later migrations patch them by
 * exact text, so the LAST occurrence in filename order is what is live.
 *
 * Growth's four values are distinct (1500 / 2500 / 500 / 250), which is what
 * makes it possible to tell which resource a bare `when 'growth' ... when
 * 'scale' ...` fragment belongs to -- a patch quotes only the tail of the line.
 * If that ever stops being true this mapping is unsafe, so it is asserted.
 */
const RESOURCE_BY_GROWTH_VALUE: Record<number, keyof typeof RESOURCES> = {
  1_500: 'textCredits',
  2_500: 'marketingEmailSends',
  500: 'aiIntakeCredits',
  250: 'aiWritingDrafts',
};

const RESOURCES = {
  textCredits: 'text_segments',
  marketingEmailSends: 'marketing_email_sends',
  aiIntakeCredits: 'ai_intake_threads',
  aiWritingDrafts: 'ai_writing_drafts',
} as const;

type ResourceKey = keyof typeof RESOURCES;

function liveGrantValues(): Map<ResourceKey, { growth: number; scale: number }> {
  const found = new Map<ResourceKey, { growth: number; scale: number }>();
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8').replace(/\r\n/g, '\n');
    // Doubled quotes appear when the fragment is itself inside a SQL string, as
    // it is in a patch migration.
    for (const m of sql.matchAll(
      /when ''?growth''? then (\d+) when ''?scale''? then (\d+)/g,
    )) {
      const growth = Number(m[1]);
      const key = RESOURCE_BY_GROWTH_VALUE[growth];
      if (!key) continue;
      found.set(key, { growth, scale: Number(m[2]) });
    }
  }
  return found;
}

describe('the SQL grant tables agree with the price book', () => {
  const live = liveGrantValues();

  it('found a grant table for every metered resource', () => {
    // Guards the guard: a regex that stopped matching would make every
    // assertion below vacuous.
    expect([...live.keys()].sort()).toEqual(
      (Object.keys(RESOURCES) as ResourceKey[]).sort(),
    );
  });

  it("Growth's four values stay distinct, which is what makes the mapping safe", () => {
    const growthValues = (Object.keys(RESOURCES) as ResourceKey[])
      .map((key) => BILLING_PLANS.growth.allowances[key]);
    expect(new Set(growthValues).size).toBe(growthValues.length);
    // And the mapping table is built from those same numbers.
    for (const key of Object.keys(RESOURCES) as ResourceKey[]) {
      const growth = BILLING_PLANS.growth.allowances[key];
      expect(RESOURCE_BY_GROWTH_VALUE[growth], `growth ${growth}`).toBe(key);
    }
  });

  it('grants Scale exactly what Scale is sold', () => {
    for (const key of Object.keys(RESOURCES) as ResourceKey[]) {
      const sold = BILLING_PLANS.scale.allowances[key];
      expect(live.get(key)!.scale, `${RESOURCES[key]} for Scale`).toBe(sold);
    }
  });

  it('grants Growth exactly what Growth is sold', () => {
    for (const key of Object.keys(RESOURCES) as ResourceKey[]) {
      const sold = BILLING_PLANS.growth.allowances[key];
      expect(live.get(key)!.growth, `${RESOURCES[key]} for Growth`).toBe(sold);
    }
  });

  it('does not let Scale collapse back onto Growth', () => {
    // The failure mode was not a wrong number in isolation -- it was Scale
    // spelled as Growth. On a plan costing 2.5x as much, equal is the tell.
    for (const key of Object.keys(RESOURCES) as ResourceKey[]) {
      const { growth, scale } = live.get(key)!;
      expect(scale, `${RESOURCES[key]}: Scale must exceed Growth`).toBeGreaterThan(growth);
    }
  });

  it('keeps the comparison table honest about the same numbers', async () => {
    // The pricing page renders its own strings. A grant table that matches the
    // catalog while the page advertises something else is the same bug wearing
    // a different hat.
    const { COMPARISON_ROWS } = await import('@/app/pricing/pricing-catalog');
    const row = (label: string) => COMPARISON_ROWS.find((r) => r[0] === label);
    const scaleCell = (label: string) => row(label)?.[4];

    expect(scaleCell('Text credits'))
      .toBe(`${BILLING_PLANS.scale.allowances.textCredits.toLocaleString('en-US')}/month`);
    expect(scaleCell('Marketing email sends'))
      .toBe(`${BILLING_PLANS.scale.allowances.marketingEmailSends.toLocaleString('en-US')}/month`);
    expect(scaleCell('AI credits'))
      .toBe(`${(BILLING_PLANS.scale.allowances.aiIntakeCredits + BILLING_PLANS.scale.allowances.aiWritingDrafts).toLocaleString('en-US')}/month`);
  });
});
