// The platform's own Terms of Service — the agreement between LETS GET QUOTED
// LLC and the contractor, NOT the Terms page generated for a contractor's own
// website (that one lives in site-content / SiteLegalPage and is theirs).
//
// One source of truth for the version string. The /terms page renders it and
// the acceptance record stores it, so "which terms did they actually agree to"
// is answerable later. Bump TERMS_VERSION whenever the document changes in a way
// that should be re-accepted; leaving it alone means an edit is a clarification,
// not a new agreement.

export const TERMS_VERSION = '2026-08-03';
export const TERMS_EFFECTIVE_DATE = 'August 3, 2026';

// What ensureAccountMembership names a brand-new account before anyone has said
// who they are. Treated as "not set" by the first-run screen so the field starts
// empty rather than making someone delete a placeholder.
export const PLACEHOLDER_BUSINESS_NAME = 'My Business';

export type FirstRunAccount = {
  business_name?: string | null;
  trade?: string | null;
  terms_accepted_at?: string | null;
  terms_version?: string | null;
};

/**
 * Whether this account still has to go through first run.
 *
 * Acceptance is the only thing that gates: a business name and trade are useful
 * but they are not an agreement, and locking someone out of a paid workspace
 * over a missing dropdown would be absurd. Both are captured on the same screen
 * because that screen has to exist for the terms anyway.
 *
 * A version MISMATCH also gates — that is the whole point of storing the
 * version. If the document materially changes, everyone re-accepts.
 */
export function needsFirstRun(account: FirstRunAccount | null | undefined): boolean {
  if (!account) return false; // unknown account — see the note in requireOwnerContext
  if (!account.terms_accepted_at) return true;
  return account.terms_version !== TERMS_VERSION;
}

/**
 * The name to show in the first-run field.
 *
 * An account created moments ago is called "My Business", which nobody typed and
 * nobody wants to have to clear.
 *
 * `siteCompanyName` is the second place a business name lives, and in practice
 * it is the REAL one: getOrCreateSite copies accounts.business_name into a new
 * site once, and every rename after that happens in the site builder and never
 * flows back. Measured on the live database, all six existing accounts still
 * read "My Business" while their sites say BrokePipes, Chelsea's Cleaning
 * Service, and so on. Falling back to the site means an existing owner confirms
 * a name they recognize instead of retyping one we already have.
 */
export function initialBusinessName(
  account: FirstRunAccount | null | undefined,
  siteCompanyName?: string | null,
): string {
  const name = (account?.business_name ?? '').trim();
  if (name && name !== PLACEHOLDER_BUSINESS_NAME) return name;
  const fromSite = (siteCompanyName ?? '').trim();
  return fromSite === PLACEHOLDER_BUSINESS_NAME ? '' : fromSite;
}

/** null when the name can't be used, so the caller reports one specific problem. */
export function businessNameProblem(input: string): string | null {
  const name = String(input ?? '').trim();
  if (!name) return 'Enter your business name.';
  if (name.length < 2) return 'That looks too short to be a business name.';
  if (name.length > 80) return 'Business names are limited to 80 characters.';
  return null;
}

export function normalizeBusinessName(input: string): string {
  return String(input ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
}

/**
 * ZIP validation.
 *
 * Kept as TEXT everywhere, never a number: 02134 is a real ZIP and Number()
 * would quietly make it 2134, which is a different place (or nowhere).
 *
 * ZIP+4 is accepted and stored as the 5-digit prefix — the extra four identify a
 * delivery segment within one ZIP, which is below the resolution of anything we
 * do with it (city lookup, service area, route density).
 */
export function postalCodeProblem(input: string): string | null {
  const raw = String(input ?? '').trim();
  if (!raw) return 'Enter your ZIP code.';
  if (!/^\d{5}(-?\d{4})?$/.test(raw)) return 'Enter a 5-digit ZIP code.';
  return null;
}

export function normalizePostalCode(input: string): string {
  return String(input ?? '').trim().slice(0, 5);
}
