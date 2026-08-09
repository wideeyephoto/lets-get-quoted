import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QUICK_STOP_REFUND_TIERS, type RefundTiers } from '@/lib/quick-stop-refunds';
import { renderRefundPolicy, refundPolicyWarnings, NO_SHOW_POLICY_SENTENCE, CONTRACTOR_REFUND_SCOPE_NOTE } from '@/lib/quick-stop-policy';

const tiers = (over: Partial<RefundTiers> = {}): RefundTiers => ({ ...QUICK_STOP_REFUND_TIERS, ...over });
const ZERO = { grace: 0, beforeEnRoute: 0, afterEnRoute: 0, afterArrived: 0 };

// The whole policy as one blob, for "does it say this anywhere" assertions.
const text = (t: RefundTiers) => renderRefundPolicy(t).lines.join(' ');

const read = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8');

describe('renderRefundPolicy — the default tiers still say what the old hardcoded copy said', () => {
  // The paragraph this replaced read: "Cancellation refunds: full within 5
  // minutes of paying, 75% before the tech is en route, 25% once en route, none
  // after arrival. If the tech misses the window, report a no-show within 2
  // hours for a full refund." On a default account the generated policy has to
  // make every one of those claims, or the fix has changed the terms rather
  // than just stopped lying about them.
  const policy = renderRefundPolicy(tiers());

  it('full refund within the 5-minute window', () => {
    expect(policy.lines).toContain('Cancel within 5 minutes of paying and you get a full refund.');
  });

  it('75% before the tech sets off', () => {
    expect(policy.lines).toContain('Cancel after that but before the tech sets off and you get 75% back.');
  });

  it('25% once en route, nothing once arrived', () => {
    expect(policy.lines).toContain('Cancel once the tech is en route and you get 25% back.');
    expect(policy.lines).toContain('Cancel once the tech has arrived and you get nothing back.');
  });

  it('carries the no-show rule, naming the 2 hours from the END of the window', () => {
    expect(policy.lines).toContain(NO_SHOW_POLICY_SENTENCE);
    expect(NO_SHOW_POLICY_SENTENCE).toMatch(/2 hours after the end of your arrival window/);
  });

  it('states the contractor-fault outcomes that override the tiers', () => {
    const blob = text(tiers());
    expect(blob).toMatch(/If the contractor cancels, you get a full refund\./);
    expect(blob).toMatch(/arrival window passes and nobody has arrived, you get a full refund/);
  });

  it('a default account has nothing to warn its contractor about', () => {
    expect(policy.warnings).toEqual([]);
  });
});

describe('renderRefundPolicy — the numbers are read, not assumed', () => {
  it('an account with its own tiers gets its own sentences', () => {
    const lines = renderRefundPolicy(tiers({ withinGraceMinutes: 20, grace: 100, beforeEnRoute: 50, afterEnRoute: 10, afterArrived: 0 })).lines;
    expect(lines).toContain('Cancel within 20 minutes of paying and you get a full refund.');
    expect(lines).toContain('Cancel after that but before the tech sets off and you get 50% back.');
    expect(lines).toContain('Cancel once the tech is en route and you get 10% back.');
  });

  it('one minute is not "1 minutes"', () => {
    expect(text(tiers({ withinGraceMinutes: 1 }))).toContain('Cancel within 1 minute of paying');
  });

  it('a zero-length free-cancel window is not described as if it existed', () => {
    const lines = renderRefundPolicy(tiers({ withinGraceMinutes: 0 })).lines;
    expect(lines.some((l) => l.includes('of paying and you get'))).toBe(false);
    // ...and the next sentence loses its now-dangling "after that".
    expect(lines).toContain('Cancel before the tech sets off and you get 75% back.');
  });
});

describe('all four at zero — a strictly non-refundable fee', () => {
  const policy = renderRefundPolicy(tiers(ZERO));

  it('tells the customer it is non-refundable, in that word', () => {
    expect(text(tiers(ZERO))).toContain('non-refundable');
  });

  it('raises exactly one severe warning, and says non-refundable there too', () => {
    expect(policy.warnings).toHaveLength(1);
    expect(policy.warnings[0].severity).toBe('severe');
    expect(policy.warnings[0].key).toBe('non-refundable');
    expect(policy.warnings[0].message).toContain('non-refundable');
  });

  it('the contractor-fault refunds survive — they are not the customer tiers', () => {
    expect(policy.lines).toContain(NO_SHOW_POLICY_SENTENCE);
    expect(text(tiers(ZERO))).toContain('If the contractor cancels, you get a full refund.');
  });
});

describe('refundPolicyWarnings — settings a customer would find unreasonable', () => {
  it('no free-cancel window at all is severe, and names the tier they drop to', () => {
    const warnings = refundPolicyWarnings({ withinGraceMinutes: 0, grace: 0, beforeEnRoute: 75, afterEnRoute: 25, afterArrived: 0 });
    const w = warnings.find((x) => x.key === 'no-free-cancel-window');
    expect(w?.severity).toBe('severe');
    expect(w?.message).toContain('75% back');
  });

  it('a zero-percent grace tier inside a real window is not the no-free-cancel case', () => {
    // grace 0 but a 5-minute window: computeCustomerRefundPercent really does
    // return 0 in those 5 minutes, so this is caught by the tiers going UP
    // afterwards, not by the free-cancel rule.
    const warnings = refundPolicyWarnings({ withinGraceMinutes: 5, grace: 0, beforeEnRoute: 75, afterEnRoute: 25, afterArrived: 0 });
    expect(warnings.some((w) => w.key === 'no-free-cancel-window')).toBe(false);
    expect(warnings.some((w) => w.key.startsWith('refund-rises:'))).toBe(true);
  });

  it('nothing back before you have even set off is severe', () => {
    const warnings = refundPolicyWarnings({ withinGraceMinutes: 5, grace: 100, beforeEnRoute: 0, afterEnRoute: 0, afterArrived: 0 });
    const w = warnings.find((x) => x.key === 'nothing-before-en-route');
    expect(w?.severity).toBe('severe');
  });

  it('a refund that climbs as the job progresses warns, and names both numbers', () => {
    const warnings = refundPolicyWarnings({ withinGraceMinutes: 5, grace: 100, beforeEnRoute: 25, afterEnRoute: 75, afterArrived: 0 });
    const w = warnings.find((x) => x.key === 'refund-rises:before-en-route-after-en-route');
    expect(w?.severity).toBe('warn');
    expect(w?.message).toContain('75% once you are en route');
    expect(w?.message).toContain('only 25% before you set off');
  });

  it('an unreachable grace tier is not compared — a 0-minute window has no tier to be wrong about', () => {
    const warnings = refundPolicyWarnings({ withinGraceMinutes: 0, grace: 0, beforeEnRoute: 75, afterEnRoute: 25, afterArrived: 0 });
    expect(warnings.some((w) => w.key === 'refund-rises:grace-before-en-route')).toBe(false);
  });

  it('every warning reads without its colour — the leading clause carries it', () => {
    // The severity is a styling hint only. If a message ever needs its colour to
    // be understood, this is the test that should have stopped it.
    const warnings = refundPolicyWarnings({ withinGraceMinutes: 0, grace: 0, beforeEnRoute: 0, afterEnRoute: 50, afterArrived: 0 });
    expect(warnings.length).toBeGreaterThan(0);
    for (const w of warnings) {
      expect(w.message.length).toBeGreaterThan(60);
      expect(w.key).not.toBe('');
    }
  });
});

describe('the no-show sentence says whose no-show it is', () => {
  it('the contractor-facing note names the contractor, and rules the customer out', () => {
    expect(CONTRACTOR_REFUND_SCOPE_NOTE).toContain('you never arrived');
    expect(CONTRACTOR_REFUND_SCOPE_NOTE).toContain('Only the customer can report one');
    expect(CONTRACTOR_REFUND_SCOPE_NOTE).toMatch(/customer who is not home is not a no-show/);
  });

  it('the configurator no longer says the ambiguous version', () => {
    const src = read('src/app/dashboard/quick-stops/QuickStopConfigurator.tsx');
    expect(src).not.toContain('verified no-shows are always refunded in full');
    expect(src).toContain('CONTRACTOR_REFUND_SCOPE_NOTE');
  });
});

describe('the customer status page renders the real policy', () => {
  const src = read('src/app/quick-stop/[id]/page.tsx');

  it('no longer hardcodes the default tiers', () => {
    expect(src).not.toContain('75% before the tech is en route');
    expect(src).not.toContain('25% once en route');
  });

  it('loads the account tiers and renders the generated lines', () => {
    expect(src).toContain('loadRefundTiers');
    expect(src).toContain('renderRefundPolicy');
    expect(src).toMatch(/refundPolicy\.lines\.map/);
  });

  it('shows the contractor warnings to nobody', () => {
    // warnings are advice to the account owner about their own terms; the
    // customer must never be handed "this is unfair to you" on the page that is
    // asking them to accept it.
    expect(src).not.toContain('warnings');
  });
});

describe('the configurator surfaces the warnings under the refund inputs', () => {
  const src = read('src/app/dashboard/quick-stops/QuickStopConfigurator.tsx');

  it('computes them live from the five inputs', () => {
    expect(src).toContain('refundPolicyWarnings');
    expect(src).toContain('refundWarnings');
    // Controlled, or the warnings could never update as the numbers are typed.
    expect(src).toContain('value={refunds.beforeEnRoute}');
  });

  it('distinguishes severe from mild by a word, not only by a class', () => {
    expect(src).toContain("warning.severity === 'severe' ? 'is-severe' : 'is-warn'");
    expect(src).toMatch(/Unfair to the customer:/);
    expect(src).toMatch(/Check this:/);
  });

  it('the two levels are styled apart by more than hue', () => {
    const css = read('src/app/globals.css');
    expect(css).toContain('.refund-warnings li.is-severe');
    expect(css).toContain('.refund-warnings li.is-warn');
    expect(css).toMatch(/\.refund-warnings li\.is-severe \{[^}]*border-left: 4px solid/);
    expect(css).toMatch(/\.refund-warnings li\.is-warn \{[^}]*border-left: 3px dashed/);
  });
});
