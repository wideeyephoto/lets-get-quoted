import {
  BILLING_PLAN_IDS,
  BILLING_PLANS,
  type BillingCycle,
  type BillingPlanId,
} from '@/lib/billing/catalog';

/**
 * WHERE ONE PLAN STOPS BEING THE CHEAPER ONE.
 *
 * A higher plan costs more up front and takes a smaller share of what a
 * contractor collects, so the two curves cross at exactly one volume. That
 * number is computable from catalog constants alone -- no payment history, no
 * estimate, nothing about a particular workspace. Which matters, because the
 * half of this feature that DOES need history ("at your volume you would save
 * X") has nothing to run on: there are zero settled non-test payments across
 * every account. This half works today and stays true whatever anybody collects.
 *
 * THE VOLUME IS THE FEE BASIS, NOT WHAT LANDS IN THE BANK. The platform fee is
 * taken on `fee_basis_amount` -- the discount-adjusted service subtotal --
 * which excludes tax, tips, refunds and Stripe's own processing. Quoting a
 * threshold against gross collections would put it out by whatever a
 * contractor's tax rate happens to be, and would do it in the direction that
 * tells somebody to upgrade too early.
 *
 * VOICE IS EXCLUDED. /pricing computes the same crossover with
 * `VOICE_PURCHASABLE`, which is `false`, because every AI Voice SKU is withheld
 * and has no live Price. Adding a voice cost nobody can buy would move the
 * threshold for a product that does not exist.
 *
 * NOT A SECOND IMPLEMENTATION, by test. `planCrossover` in the /pricing catalog
 * has computed this for the public page since before this existed, and
 * test/plan-crossover asserts the two agree to the cent for every plan pair and
 * both billing cycles. Reimplementing money arithmetic and letting it drift is
 * how the mockup's break-evens ended up 26% low.
 */

/** What a plan costs in a year before a single payment is collected. */
export function annualFixedCents(plan: BillingPlanId, billing: BillingCycle): number {
  // Flex has no subscription at all, and multiplying its zero by twelve is
  // still zero -- but saying so here keeps the special case where a reader
  // looking for it will look.
  if (plan === 'flex') return 0;
  const definition = BILLING_PLANS[plan];
  return billing === 'annual'
    ? definition.annualPriceCents
    : definition.monthlyPriceCents * 12;
}

/**
 * The annual fee-basis volume at which `to` starts costing less than `from`.
 *
 * Null when it never does: `to` has to give back more in fee rate than it adds
 * in subscription, and a plan that is dearer up front AND no cheaper per dollar
 * never crosses. Infinity is deliberately not used -- it formats as "Infinity"
 * the first time somebody forgets to check.
 */
export function crossoverAnnualBasisCents(
  from: BillingPlanId,
  to: BillingPlanId,
  billing: BillingCycle,
): number | null {
  const feeDifferenceBps = BILLING_PLANS[from].platformFeeBps - BILLING_PLANS[to].platformFeeBps;
  if (feeDifferenceBps <= 0) return null;

  const fixedDifference = annualFixedCents(to, billing) - annualFixedCents(from, billing);
  // A plan that is cheaper up front AND cheaper per dollar wins immediately, so
  // the crossover is zero rather than a negative volume.
  if (fixedDifference <= 0) return 0;

  // bps are ten-thousandths, so dividing by (bps / 10_000) is multiplying by
  // 10_000 / bps. Done in one step to keep the intermediate off a float.
  return (fixedDifference * 10_000) / feeDifferenceBps;
}

export type PlanBand = Readonly<{
  planCode: BillingPlanId;
  planName: string;
  /** Inclusive lower edge of the band, in annual fee-basis cents. */
  fromAnnualBasisCents: number;
  /** Exclusive upper edge, or null for the open-ended top band. */
  toAnnualBasisCents: number | null;
  isCurrent: boolean;
}>;

/**
 * The whole ladder: which plan is cheapest at which volume.
 *
 * Built from CONSECUTIVE crossovers rather than by comparing every pair,
 * because consecutive is what makes the bands contiguous -- and the ordering
 * only holds while each step up costs more fixed and less per dollar. If a
 * future catalog breaks that, a band would start below the one before it, so
 * the result is refused rather than rendered out of order.
 */
export function planLadder(current: BillingPlanId, billing: BillingCycle): readonly PlanBand[] | null {
  // Already cheapest-first, and it holds no 'enterprise' -- that plan is a
  // custom agreement with no catalog price, so it has no place on a ladder
  // built out of published ones.
  const ordered = BILLING_PLAN_IDS;

  const edges: number[] = [];
  for (let i = 0; i < ordered.length - 1; i += 1) {
    const crossover = crossoverAnnualBasisCents(ordered[i], ordered[i + 1], billing);
    if (crossover === null) return null;
    edges.push(crossover);
  }

  // Strictly increasing, or the bands do not describe a ladder and the honest
  // answer is to show nothing.
  for (let i = 1; i < edges.length; i += 1) {
    if (edges[i] <= edges[i - 1]) return null;
  }

  return ordered.map((planCode, index) => Object.freeze({
    planCode,
    planName: BILLING_PLANS[planCode].name,
    fromAnnualBasisCents: index === 0 ? 0 : edges[index - 1],
    toAnnualBasisCents: index === edges.length ? null : edges[index],
    isCurrent: planCode === current,
  }));
}
