/**
 * Ownership of settlement on the legacy platform destination-charge rail.
 *
 * Two mechanisms can mark one of these payments paid or failed, and exactly one
 * may ever be in charge of a given payment:
 *
 * - the compare-and-set in the Stripe webhook route, which is what runs today;
 * - `classify_legacy_destination_checkout_event`, which mutates `public.payments`
 *   itself from the serialized Checkout generation ledger.
 *
 * They are not complementary, and the rail guard does not separate them.
 * `inspectLegacyDestinationPaymentRail` reports `allowed` for precisely the
 * payments the SQL classifier also owns, so introducing the classifier without
 * standing the compare-and-set down would leave one payment with two independent
 * authorities to settle it. Stripe delivers at-least-once, so that is not a
 * theoretical overlap: it is a double projection waiting for a retry.
 *
 * This flag therefore selects between them. It never adds one to the other.
 *
 * ORDERING HAZARD, and the reason this is a separate flag from generation:
 * the classifier resolves a payment through its operation row, and a payment
 * created before the generation foundation has none. For those the classifier
 * reports `unknown` and projects nothing. Enabling this flag while such payments
 * are still in flight would strand their settlement silently — money collected at
 * Stripe, nothing written locally, no error anywhere. So this flag must be
 * enabled strictly after generation, and only once every in-flight Checkout has
 * an operation row. Enabling both together is the failure mode to avoid.
 */
export const LEGACY_DESTINATION_CHECKOUT_PROJECTION_FLAG =
  'LGQ_LEGACY_DESTINATION_CHECKOUT_PROJECTION_ENABLED' as const;

export function legacyDestinationCheckoutProjectionEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env[LEGACY_DESTINATION_CHECKOUT_PROJECTION_FLAG] === '1';
}

/** What `inspectLegacyDestinationPaymentRail` concluded about a payment. */
export type LegacyDestinationRailKind = 'allowed' | 'blocked' | 'not_found';

export type LegacyDestinationSettlementOwner =
  | 'route_compare_and_set'
  | 'checkout_generation_ledger'
  | 'neither';

/**
 * Which mechanism owns settling this payment. Total over both inputs, and single
 * valued by construction: there is no combination that returns two owners, which
 * is the property the rest of this rail depends on.
 */
export function legacyDestinationSettlementOwner(input: Readonly<{
  railKind: LegacyDestinationRailKind;
  projectionEnabled: boolean;
}>): LegacyDestinationSettlementOwner {
  // Not this rail at all: the direct-charge projector owns it, and neither
  // mechanism here may touch it.
  if (input.railKind !== 'allowed') return 'neither';
  return input.projectionEnabled ? 'checkout_generation_ledger' : 'route_compare_and_set';
}

/**
 * Whether the route's compare-and-set must decline to act.
 *
 * True for a payment that was never on this rail, and equally for one the ledger
 * now owns. Callers already treat the first case as "not mine, run no side
 * effects", so routing the second through the same answer keeps notification and
 * projection behavior identical instead of adding a parallel path that would
 * need its own correctness argument.
 */
export function legacyDestinationCompareAndSetStandsDown(input: Readonly<{
  railKind: LegacyDestinationRailKind;
  projectionEnabled: boolean;
}>): boolean {
  return legacyDestinationSettlementOwner(input) !== 'route_compare_and_set';
}
