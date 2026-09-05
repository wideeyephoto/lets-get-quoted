/**
 * Homeowner financing is planned through Wisetack. Our partner application is
 * pending; we have neither an approved integration nor a lender offer to show.
 *
 * A quote amount, illustrative APR, environment flag, or finance_plans row is
 * not evidence that financing is available. Replace this state with verified
 * partner/merchant readiness after the documented Wisetack application and
 * funding lifecycle has been integrated and tested.
 */
export const HOMEOWNER_FINANCING = Object.freeze({
  provider: 'wisetack',
  providerName: 'Wisetack',
  status: 'pending_partner_approval',
  available: false,
  statusLabel: 'Pending approval',
  message: 'Wisetack financing is not available yet. Our partner application is awaiting approval.',
  nextStep: 'After approval and integration, eligible customers will be able to review financing options through Wisetack.',
  operatorNextStep: 'Follow up on Wisetack partner approval before offering homeowner financing.',
} as const);
