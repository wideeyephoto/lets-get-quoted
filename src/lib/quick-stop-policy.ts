// The words for the refund policy — the customer-facing sentences, and the
// warnings a contractor should see about their own settings.
//
// This exists because the Quick Stop status page used to print the DEFAULT
// tiers as fixed prose ("75% before the tech is en route") no matter what the
// account had actually configured. An account running 0/0/0/0 told a paying
// customer they would get 75% back and then refunded nothing. That is a
// misrepresented payment term, so the sentences now come from the same numbers
// the refund actually uses.
//
// The one rule this file lives by: every sentence must describe what
// computeCustomerRefundPercent (src/lib/quick-stop-refunds.ts) will really do,
// in the order it really checks. It is a rendering of that function, never a
// second implementation of the policy that can drift away from it.
//
// TYPE-ONLY import, and it has to stay that way: quick-stop-refunds.ts pulls in
// Stripe (via @/lib/payments), Resend and Twilio, and this module is imported by
// QuickStopConfigurator, which is a 'use client' component. A value import would
// drag the whole server graph into the browser bundle. Nothing here needs a
// runtime binding from there — the caller hands us the tiers.
import type { RefundTiers } from './quick-stop-refunds';

/**
 * Just the five tiers a contractor can actually change. mergeRefundTiers keeps
 * contractorMissedWindow / contractorCancel / noShow pinned at 100 whatever is
 * stored, so the warnings — which only ever judge the contractor's own choices —
 * take this narrower shape. It also means the client configurator can call
 * refundPolicyWarnings with the five live input values and no invented numbers.
 */
export type CustomerRefundTiers = Pick<
  RefundTiers,
  'withinGraceMinutes' | 'grace' | 'beforeEnRoute' | 'afterEnRoute' | 'afterArrived'
>;

export type PolicyWarning = {
  key: string;
  severity: 'warn' | 'severe';
  message: string;
};

export type RefundPolicy = {
  /** Customer-facing, in plain sentences. Render in order. */
  lines: string[];
  /** For the CONTRACTOR only. Never shown to a customer. */
  warnings: PolicyWarning[];
};

/**
 * The no-show rule, for the customer. Fixed, not derived: noShow is `100 //
 * fixed by policy` in quick-stop-refunds.ts and mergeRefundTiers refuses to
 * override it, so there is no per-account number to render here.
 *
 * The two hard limits both come from reportNoShowQuickStopAction: it rejects the
 * report if `req.arrived_at` is set, and if now is past the arrival window's end
 * plus NO_SHOW_GRACE_MS (2 hours). "Within 2 hours" on its own was ambiguous —
 * two hours from what? — so the sentence names the end of the window.
 */
export const NO_SHOW_POLICY_SENTENCE =
  'If nobody turns up, you can report a no-show yourself for up to 2 hours after the end of your arrival window, and the whole fee comes back to you.';

/**
 * The same rule stated for the CONTRACTOR, and the reason this constant exists.
 *
 * The configurator used to say "verified no-shows are always refunded in full",
 * which never said WHOSE no-show — and a contractor reading it while setting
 * their cancellation percentages will assume it protects them against a customer
 * who isn't home. It does the exact opposite. Only the customer can report a
 * no-show (reportNoShowQuickStopAction lives under /quick-stop/[id], the public
 * link), it is refused once the tech has marked themselves arrived, and a
 * confirmed one costs the contractor the whole fee AND auto-locks Quick Stop for
 * their account on an escalating ladder (quickStopNoShowLock). There is no
 * mechanism anywhere for a customer's absence to be recorded as a no-show.
 */
export const CONTRACTOR_REFUND_SCOPE_NOTE =
  'These percentages apply only when the CUSTOMER cancels. Two things are fixed at a full refund and you cannot change them: a Quick Stop you cancel yourself, and a no-show — which here always means you never arrived. Only the customer can report one, up to 2 hours after the end of the arrival window, and only while you have not marked yourself arrived. A customer who is not home is not a no-show and refunds nothing.';

// "a full refund" / "75% back" / "nothing back" — one phrasing, so every tier
// sentence reads the same shape and a 0 tier never hides behind "0%".
function refundPhrase(percent: number): string {
  if (percent >= 100) return 'a full refund';
  if (percent <= 0) return 'nothing back';
  return `${percent}% back`;
}

function minutesPhrase(minutes: number): string {
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

/**
 * Warnings about the contractor's own five numbers. Shown under the inputs in
 * the configurator, never to a customer.
 *
 * 'severe' means the setting is one a customer would reasonably call unfair and
 * likely charge back over; 'warn' means it is merely incoherent. The severity is
 * only ever a hint for styling — the message itself has to carry the weight,
 * because the panel that renders these must read correctly in greyscale.
 */
export function refundPolicyWarnings(tiers: CustomerRefundTiers): PolicyWarning[] {
  const { withinGraceMinutes, grace, beforeEnRoute, afterEnRoute, afterArrived } = tiers;
  const out: PolicyWarning[] = [];

  // All four at zero subsumes every other warning below it — there is no free
  // cancel, nothing before you set off, and no ordering left to be wrong about.
  // Emitting three severe warnings for one decision would bury the one sentence
  // that actually describes it, so this case returns alone.
  if (grace === 0 && beforeEnRoute === 0 && afterEnRoute === 0 && afterArrived === 0) {
    return [
      {
        key: 'non-refundable',
        severity: 'severe',
        message:
          'Every tier is 0%. This is a strictly non-refundable fee: once a customer pays, cancelling returns them nothing at any point, even one second later and even before you have left. Your Quick Stop page now tells them that in exactly those words, because it is what will happen.',
      },
    ];
  }

  // No free-cancel window at all. computeCustomerRefundPercent applies the grace
  // tier while `now - paid_at <= withinGraceMinutes * 60_000`, so a 0-minute
  // window is true for a single instant and a 0% grace tier is worth nothing
  // anyway — with both at zero there is genuinely no undo on a mis-tapped Pay
  // button. What they drop to instead is the before-you-set-off tier, so name it
  // rather than claim they get nothing when that tier might be 75%.
  if (grace === 0 && withinGraceMinutes === 0) {
    out.push({
      key: 'no-free-cancel-window',
      severity: 'severe',
      message: `You have no free-cancel window at all — the window is 0 minutes and the refund inside it is 0%. Someone who mis-taps Pay and cancels one second later gets no chance to undo it; they land straight on the before-you-set-off tier, ${refundPhrase(beforeEnRoute)}.`,
    });
  }

  if (beforeEnRoute === 0) {
    out.push({
      key: 'nothing-before-en-route',
      severity: 'severe',
      message:
        'You keep the whole fee even before you set off. A customer who cancels hours ahead — while you have spent no fuel, no drive time and given up no other job — gets nothing back. That is the setting most likely to come back as a card chargeback.',
    });
  }

  // Monotonicity, in journey order. Each pair is reported separately so the
  // contractor is told which two numbers to look at, not just that "something"
  // is backwards.
  //
  // The grace tier only joins the comparison when the window is longer than
  // zero: at 0 minutes that tier is unreachable in practice, so calling it
  // "lower than the next one" would be a complaint about a number nobody can
  // ever be charged under.
  const journey: Array<{ key: string; label: string; value: number }> = [
    ...(withinGraceMinutes > 0 ? [{ key: 'grace', label: 'inside the free-cancel window', value: grace }] : []),
    { key: 'before-en-route', label: 'before you set off', value: beforeEnRoute },
    { key: 'after-en-route', label: 'once you are en route', value: afterEnRoute },
    { key: 'after-arrived', label: 'after you have arrived', value: afterArrived },
  ];
  for (let i = 0; i < journey.length - 1; i++) {
    const earlier = journey[i];
    const later = journey[i + 1];
    if (earlier.value < later.value) {
      out.push({
        key: `refund-rises:${earlier.key}-${later.key}`,
        severity: 'warn',
        message: `The refund goes UP as the job gets further along: ${later.value}% ${later.label}, but only ${earlier.value}% ${earlier.label}. That is backwards — a customer is better off waiting until you are further into the job before cancelling.`,
      });
    }
  }

  return out;
}

/**
 * The customer-facing policy, one sentence per line, plus the contractor's
 * warnings about the same settings.
 *
 * The order of the tier sentences is the order computeCustomerRefundPercent
 * tests them, which is not the order the inputs appear in the configurator:
 * arrival is checked BEFORE en-route (a tech can mark arrived straight from
 * confirmed), and the missed-window override is checked before either. Reading
 * the sentences top to bottom walks the same branches the refund does.
 */
export function renderRefundPolicy(tiers: RefundTiers): RefundPolicy {
  const lines: string[] = [];

  // Unpaid is the very first branch: `if (!req.paid_at) return 100`. Worth
  // saying, because the status page shows this policy while the request is still
  // in awaiting_customer_payment and cancelling then costs nothing.
  lines.push('Cancel before you pay and there is nothing to refund — the fee is only charged once you have approved the time and the price.');

  const allZero = tiers.grace === 0 && tiers.beforeEnRoute === 0 && tiers.afterEnRoute === 0 && tiers.afterArrived === 0;
  if (allZero) {
    // Four sentences that each say "nothing back" is a way of not saying the
    // one word a customer needs before they pay.
    lines.push('Once you have paid, this fee is non-refundable: cancelling returns nothing, at any point.');
  } else {
    const hasGraceWindow = tiers.withinGraceMinutes > 0;
    if (hasGraceWindow) {
      lines.push(`Cancel within ${minutesPhrase(tiers.withinGraceMinutes)} of paying and you get ${refundPhrase(tiers.grace)}.`);
    }
    lines.push(
      `Cancel ${hasGraceWindow ? 'after that but ' : ''}before the tech sets off and you get ${refundPhrase(tiers.beforeEnRoute)}.`,
    );
    lines.push(`Cancel once the tech is en route and you get ${refundPhrase(tiers.afterEnRoute)}.`);
    lines.push(`Cancel once the tech has arrived and you get ${refundPhrase(tiers.afterArrived)}.`);
  }

  // The three contractor-fault outcomes. These sit AFTER the tiers because each
  // one overrides them, and they are rendered from the tier values rather than
  // written as prose so that a caller passing non-default fixed tiers cannot end
  // up with a page promising a refund it will not pay.
  lines.push(`If the contractor cancels, you get ${refundPhrase(tiers.contractorCancel)}.`);
  lines.push(
    `If your arrival window passes and nobody has arrived, you get ${refundPhrase(tiers.contractorMissedWindow)} — that overrides everything above, even if you are the one who cancels.`,
  );
  lines.push(NO_SHOW_POLICY_SENTENCE);

  return { lines, warnings: refundPolicyWarnings(tiers) };
}
