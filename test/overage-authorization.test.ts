import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  OVERAGE_AUTHORIZATION_TEXT,
  OVERAGE_AUTHORIZATION_TEXT_SHA256,
  OVERAGE_AUTHORIZATION_VERSION,
  OVERAGE_CAP_MAX_CENTS,
} from '@/lib/billing/overage-consent';
import {
  OVERAGE_SELF_SERVE_FLAG as FLAG,
  overageSelfServeEnabled,
  readableOverageError,
  setWorkspaceOverageAuthorization,
  validateCapCents,
} from '@/lib/billing/overage-authorization';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
const MIGRATION = read('migrations', '20260822100000_overage_self_serve_authorization.sql');
const PANEL = read('src', 'app', 'dashboard', 'settings', 'OverageAuthorizationPanel.tsx');
const ACTION = read('src', 'app', 'dashboard', 'settings', 'overage-actions.ts');

let saved: string | undefined;
beforeEach(() => { saved = process.env[FLAG]; process.env[FLAG] = '1'; });
afterEach(() => {
  if (saved === undefined) delete process.env[FLAG];
  else process.env[FLAG] = saved;
});

/** Records what reached the RPC without needing a database. */
function spyClient(result: { data?: unknown; error?: { message: string } | null } = { data: {}, error: null }) {
  const rpc = vi.fn(async () => result);
  return { client: { rpc } as never, rpc };
}

describe('the consent digest is a hash of the words on screen', () => {
  it('matches the text it claims to describe', () => {
    // A hardcoded digest that drifted from its text would be WORSE than none:
    // it would look like proof of something nobody agreed to.
    expect(createHash('sha256').update(OVERAGE_AUTHORIZATION_TEXT, 'utf8').digest('hex'))
      .toBe(OVERAGE_AUTHORIZATION_TEXT_SHA256);
  });

  it('is the shape the database will accept', () => {
    expect(OVERAGE_AUTHORIZATION_TEXT_SHA256).toMatch(/^[0-9a-f]{64}$/);
    expect(MIGRATION).toContain("p_terms_sha256 !~ '^[0-9a-f]{64}$'");
  });

  it('says the three things that are load-bearing', () => {
    // Each of these is a promise the code keeps, and a customer who was not
    // told is a customer who was surprised by their own bill.
    expect(OVERAGE_AUTHORIZATION_TEXT).toContain('never beyond it');
    expect(OVERAGE_AUTHORIZATION_TEXT).toContain('refused rather than partly charged');
    expect(OVERAGE_AUTHORIZATION_TEXT).toContain('does not reverse usage already recorded');
  });

  it('is shown in full, not summarised behind a link', () => {
    expect(PANEL).toContain('OVERAGE_AUTHORIZATION_TEXT.split');
    expect(PANEL).not.toMatch(/Read the (full )?terms|see our terms/i);
  });
});

describe('the switch is off unless it is exactly on', () => {
  it('treats every value other than the string 1 as off', () => {
    expect(overageSelfServeEnabled({})).toBe(false);
    expect(overageSelfServeEnabled({ [FLAG]: '1' })).toBe(true);
    for (const value of ['0', '', 'true', 'TRUE', 'yes', '1 ', '01']) {
      expect(overageSelfServeEnabled({ [FLAG]: value }), value).toBe(false);
    }
  });

  it('refuses to call the database at all while off', async () => {
    delete process.env[FLAG];
    const { client, rpc } = spyClient();
    const result = await setWorkspaceOverageAuthorization({
      supabase: client, accountId: 'acct', enabled: true, capCents: 5000,
    });
    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('is checked in the OPERATION, not only where the button is drawn', () => {
    // The cancellation flag was checked solely in its server action, which made
    // it a gate on one route rather than on the effect. Same mistake available
    // here, so the action deliberately does NOT re-check it.
    expect(ACTION).not.toContain('overageSelfServeEnabled(');
  });
});

describe('what reaches the database', () => {
  it('sends the version and digest the caller never supplies', async () => {
    const { client, rpc } = spyClient();
    await setWorkspaceOverageAuthorization({
      supabase: client, accountId: 'acct_1', enabled: true, capCents: 5000,
    });
    expect(rpc).toHaveBeenCalledWith('set_workspace_overage_authorization', {
      p_account_id: 'acct_1',
      p_enabled: true,
      p_cap_cents: 5000,
      p_terms_version: OVERAGE_AUTHORIZATION_VERSION,
      p_terms_sha256: OVERAGE_AUTHORIZATION_TEXT_SHA256,
    });
  });

  it('nulls the cap when switching off, whatever the form still held', async () => {
    // A stale number left in a disabled form must not land in an append-only
    // evidence row as a limit somebody chose.
    const { client, rpc } = spyClient();
    await setWorkspaceOverageAuthorization({
      supabase: client, accountId: 'acct_1', enabled: false, capCents: 9999,
    });
    expect((rpc.mock.calls[0] as unknown as [string, Record<string, unknown>])[1].p_cap_cents).toBeNull();
  });

  it('never passes an admin client -- the function reads auth.uid()', () => {
    // A service-role client presents no user, so the owner check inside the
    // function would refuse everybody. The action must hand over the session.
    expect(ACTION).toContain('supabase, accountId, enabled, capCents');
    expect(ACTION).not.toMatch(/setWorkspaceOverageAuthorization\(\{\s*supabase:\s*admin/);
  });
});

describe('the cap, and the unit it is in', () => {
  it('accepts whole cents inside the range the database allows', () => {
    expect(validateCapCents(1)).toBe(1);
    expect(validateCapCents(5000)).toBe(5000);
    expect(validateCapCents(OVERAGE_CAP_MAX_CENTS)).toBe(OVERAGE_CAP_MAX_CENTS);
  });

  it('refuses zero, negatives, fractions and anything past the ceiling', () => {
    for (const bad of [0, -1, 12.5, OVERAGE_CAP_MAX_CENTS + 1, NaN, Infinity, null, undefined, '5000']) {
      expect(validateCapCents(bad as never), String(bad)).toBeNull();
    }
  });

  it('keeps its ceiling in step with the migration that enforces it', () => {
    // Two numbers in two languages. If they drift, the form accepts something
    // the database then rejects with a code the customer never asked about.
    expect(MIGRATION).toContain(`if v_cap > ${OVERAGE_CAP_MAX_CENTS} then`);
    expect(MIGRATION).toContain(`'max_cap_cents', ${OVERAGE_CAP_MAX_CENTS}`);
  });

  it('converts dollars to cents in exactly one place', () => {
    // The contractor types dollars, the column stores cents. Every extra site
    // that repeats the conversion is a site that can forget it.
    expect(ACTION).toContain('Math.round(dollars * 100)');
    expect(PANEL).not.toContain('* 100');
  });
});

describe('errors say what a contractor can do about them', () => {
  it('translates every code the function can raise', () => {
    const cases: Array<[string, RegExp]> = [
      ['overage_forbidden', /only the owner/i],
      ['overage_cap_required', /spending limit/i],
      ['overage_cap_too_large', /\$10,000/],
      ['overage_terms_missing', /problem on our side/i],
      ['overage_terms_digest_invalid', /problem on our side/i],
      ['overage_intent_required', /problem on our side/i],
    ];
    for (const [code, expected] of cases) {
      expect(readableOverageError(`error: ${code}`), code).toMatch(expected);
    }
  });

  it('covers every code the migration actually raises', () => {
    // Written against the SQL rather than a list somebody maintains by hand: a
    // new raise with no translation would otherwise reach a customer raw.
    const raised = [...MIGRATION.matchAll(/raise exception '([a-z_]+)'/g)].map((m) => m[1]);
    expect(raised.length).toBeGreaterThan(0);
    for (const code of new Set(raised)) {
      expect(readableOverageError(code), code).not.toMatch(/try again in a moment/i);
    }
  });

  it('never echoes a raw database string at somebody', () => {
    expect(readableOverageError('P0001 something_unmapped')).not.toContain('P0001');
    expect(readableOverageError('')).toMatch(/could not be saved/i);
  });
});

describe('the control is not offered on a state nobody could read', () => {
  it('renders no switch when the overage read failed', () => {
    const section = read('src', 'app', 'dashboard', 'settings', 'PlanUsageSection.tsx');
    // The unreadable branch returns before the panel is reachable. Offering a
    // switch there would show "off" from a failed query and invite somebody to
    // re-enable something already on, at a limit they did not pick.
    const unreadableAt = section.indexOf('if (!overage.readable)');
    const firstPanelAt = section.indexOf('<OverageAuthorizationPanel');
    expect(unreadableAt).toBeGreaterThan(-1);
    expect(firstPanelAt).toBeGreaterThan(unreadableAt);
  });
});
