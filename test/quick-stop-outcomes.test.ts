import { describe, it, expect } from 'vitest';
import {
  QUICK_STOP_OUTCOMES,
  QUICK_STOP_OUTCOME,
  allowedQuickStopOutcomes,
  isQuickStopOutcome,
} from '@/lib/quick-stop-outcomes';
import { permissionsFor, STAFF_ROLES, type StaffRole } from '@/lib/staff';

// The shipped hole these cover: every outcome of the "Resolve / adjudicate"
// dropdown sat behind account.support, which four of six roles hold — while two
// of the outcomes issue a 100% Stripe refund and one of those also locks the
// account. So a support user could refund any Quick Stop fee, repeatedly,
// without holding money.refund, while the refund box on the same page correctly
// refused them.

const may = (role: StaffRole) => allowedQuickStopOutcomes(permissionsFor(role));

describe('the outcomes that move money', () => {
  it('need money.refund, both of them', () => {
    expect(QUICK_STOP_OUTCOME.no_show.permissions).toContain('money.refund');
    expect(QUICK_STOP_OUTCOME.contractor_cancel.permissions).toContain('money.refund');
  });

  // The lock writes the same two account columns lockQuickStopAction gates on
  // account.enforce, at a tier the console's own lock form cannot even express.
  it('and no-show also needs account.enforce, because it locks the account', () => {
    expect(QUICK_STOP_OUTCOME.no_show.permissions).toContain('account.enforce');
  });

  it('while the record-keeping ones stay on account.support', () => {
    expect(QUICK_STOP_OUTCOME.completed.permissions).toEqual(['account.support']);
    expect(QUICK_STOP_OUTCOME.disputed.permissions).toEqual(['account.support']);
  });
});

describe('what each role may actually submit', () => {
  // The regression: support could refund. It must not be able to again.
  it('support can record an outcome but cannot refund one', () => {
    expect(may('support')).toEqual(['completed', 'disputed']);
  });

  it('ops and read_only likewise cannot refund', () => {
    expect(may('ops')).toEqual(['completed', 'disputed']);
    expect(may('read_only')).toEqual([]);
  });

  // Finance holds money.refund but not account.enforce, so it gets the refund
  // that is only a refund and not the one that also locks an account.
  it('finance can cancel-with-refund but not confirm a no-show', () => {
    expect(may('finance')).toEqual(['contractor_cancel', 'completed', 'disputed']);
  });

  // Risk holds account.enforce but not money.refund. Neither refunding outcome
  // is available to it — no-show needs BOTH, so holding one is not enough.
  it('risk holds half of what a no-show needs, which is not enough', () => {
    expect(may('risk')).toEqual(['completed', 'disputed']);
  });

  it('only super_admin can do all four', () => {
    expect(may('super_admin')).toEqual([...QUICK_STOP_OUTCOMES]);
    const others = STAFF_ROLES.filter((r) => r !== 'super_admin');
    for (const role of others) expect(may(role).length).toBeLessThan(QUICK_STOP_OUTCOMES.length);
  });
});

describe('the dropdown and the gate cannot disagree', () => {
  // The property that makes the extraction worth it: anything the UI offers a
  // role, the server accepts from that role, and vice versa.
  it('offers a role exactly the outcomes whose permissions it holds', () => {
    for (const role of STAFF_ROLES) {
      const granted = permissionsFor(role);
      const offered = new Set(may(role));
      for (const key of QUICK_STOP_OUTCOMES) {
        const serverWouldAccept = QUICK_STOP_OUTCOME[key].permissions.every((p) => granted.includes(p));
        expect(offered.has(key)).toBe(serverWouldAccept);
      }
    }
  });
});

describe('reading an outcome off a form', () => {
  it('accepts the four and nothing else', () => {
    for (const key of QUICK_STOP_OUTCOMES) expect(isQuickStopOutcome(key)).toBe(true);
    // 'refund' and 'cancel' are the plausible near misses; an unrecognised
    // value must never fall through to a branch that picks its own permission.
    for (const bad of ['', 'refund', 'cancel', 'no-show', 'NO_SHOW', 'toString'])
      expect(isQuickStopOutcome(bad)).toBe(false);
  });
});
