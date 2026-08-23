import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The seat number on the invite screen must be the one the database enforces.
 *
 * The office seat limit is `plan allowance + purchased seats`. The RPC that
 * refuses an invitation computes exactly that:
 *
 *   v_limit := <feature_limits.office_users>
 *            + public.workspace_purchased_capacity_units(p_account_id, 'office_users')
 *
 * The team screen read `feature_limits.office_users` on its own, so a PURCHASED
 * seat was invisible: the page kept reporting every seat in use and kept the
 * invite button disabled — on the one surface whose job is to let somebody spend
 * the seat they just paid for.
 *
 * This is the same defect already fixed on the Plan & usage card, whose own
 * comment records it: "Plan allowance PLUS anything bought. The database has
 * always counted the sum; this row read the plan alone, so a purchased seat
 * worked and was invisible on the one screen that states what you are entitled
 * to." That screen only DESCRIBES entitlement. This one GATES it.
 *
 * office_seat_usage() is that arithmetic, already deployed and — until this —
 * called by nothing in the app.
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

const stripComments = (source: string) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !/^\s*\/\//.test(line))
  .join('\n');

describe('the office invite screen counts purchased seats', () => {
  const CODE = stripComments(read('src/lib/office-team.ts'));

  it('asks the database for the limit rather than deriving it', () => {
    expect(CODE).toContain("rpc('office_seat_usage'");
    expect(CODE).toContain('office_limit');
  });

  it('does not use the plan allowance as the limit on its own', () => {
    // The plan number survives only as a FALLBACK when the RPC cannot be
    // reached. If it ever becomes the seat limit again, a bought seat goes
    // invisible again.
    expect(CODE).toContain('const planLimit =');
    expect(CODE).not.toMatch(/const seatLimit = typeof raw === 'number'/);
  });

  it('falls back to the plan number rather than to no limit', () => {
    // A null seatLimit reads as "no limit" and ENABLES the invite button. The
    // database would still refuse, so it is not a hole — but showing the plan
    // number is a better answer than showing none.
    expect(CODE).toMatch(/\?\s*\(rpcLimit as number\)\s*:\s*planLimit/);
  });

  it('still counts the owner against the seat', () => {
    // Guards the guard. If seatsUsed ever stopped including the owner, the
    // screen would offer a seat that the RPC then refuses — the mirror image of
    // the bug above, and just as confusing.
    expect(CODE).toContain('seatsUsed: members.length');
  });
});
