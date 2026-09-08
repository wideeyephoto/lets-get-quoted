/**
 * Acorn Finance provider adapter.
 *
 * All Acorn-specific concerns (URLs, dealer codes, attribution parameters,
 * and mandatory marketplace disclosures) live behind this module.
 * Everything outside this file consumes the provider-neutral interface in
 * `@/lib/bnpl-financing`.
 *
 * DO NOT add functions for hypothetical endpoints. Acorn's integration at this
 * stage is a prequalification referral hand-off, not a lending lifecycle we host.
 */

export const ACORN_PROVIDER_ID = 'acorn' as const;
export const ACORN_PROVIDER_NAME = 'Acorn Finance' as const;

/** Minimum project / loan amount accepted by Acorn's lending network ($500). */
export const ACORN_MIN_LOAN_AMOUNT = 500;

/** Default base prequalification URL. */
export const ACORN_BASE_URL = 'https://www.acornfinance.com/pre-qualify/';

/**
 * Verbatim compliance disclosure text for Acorn Finance marketplace prequalification.
 * Emphasizes that Acorn is a third-party marketplace, prequalification does not
 * affect credit scores, and approval does not constitute invoice payment.
 */
export const ACORN_STANDARD_DISCLOSURE =
  'Acorn Finance is an independent lending marketplace. Prequalification performs a soft credit inquiry that does not affect your credit score and does not guarantee loan approval or specific terms. Loans are originated and funded by independent lenders directly to the homeowner, who remains responsible for settling invoices directly with the contractor.';

/**
 * Checks whether contractor-facing homeowner financing is enabled (Flag 1).
 * When 0, the Settings section and contractor-facing toggles are hidden.
 */
export function isHomeownerFinancingFeatureEnabled(): boolean {
  return process.env.LGQ_HOMEOWNER_FINANCING_ENABLED === '1';
}

/**
 * Checks whether customer-facing financing surfaces are enabled (Flag 2).
 * MUST NOT be treated as active if Flag 1 is disabled.
 */
export function isHomeownerFinancingCustomerSurfacesEnabled(): boolean {
  if (!isHomeownerFinancingFeatureEnabled()) return false;
  return process.env.LGQ_HOMEOWNER_FINANCING_CUSTOMER_SURFACES_ENABLED === '1';
}

/**
 * Builds an Acorn prequalification URL with attribution.
 * Never includes homeowner PII (name, address, email) in the query string.
 */
export function buildAcornApplyUrl({
  dealerCode,
  amount,
}: {
  dealerCode?: string | null;
  amount?: number;
}): string {
  const code = dealerCode?.trim() || process.env.ACORN_FINANCE_PARTNER_CODE?.trim();
  const url = new URL(ACORN_BASE_URL);

  if (code) {
    url.searchParams.set('d', code);
  }

  if (typeof amount === 'number' && Number.isFinite(amount) && amount >= ACORN_MIN_LOAN_AMOUNT) {
    url.searchParams.set('amount', String(Math.round(amount)));
  }

  return url.toString();
}
