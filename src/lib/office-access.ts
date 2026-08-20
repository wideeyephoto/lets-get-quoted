/**
 * Which dashboard surfaces an office user may open, and what each one costs.
 *
 * WHY A MAP AND NOT A CHECK PER PAGE. `requireOwnerContext` has 492 call sites
 * across 89 dashboard files, and every one of them currently means "owner, and
 * nobody else". Converting them wholesale to a role check would be a 492-site
 * edit against a boundary where a single miss is one business reading another's
 * customer list. So none of them change. This module is the opt-in list: a page
 * is reachable by an office user only if it appears below, and everything not
 * named here stays owner-only by omission rather than by decision.
 *
 * That is the direction the default has to fail. A new dashboard page added
 * next month is invisible to office users until somebody adds it here, which is
 * the correct outcome for a page nobody has thought about yet.
 *
 * WHY IT IS PURE. The server route guard and any client-side navigation filter
 * have to agree about what is reachable, and the only reliable way to make two
 * lists agree is to have one. No imports, so it is safe from client code.
 *
 * WHAT THIS IS NOT. It is not the security boundary. Row-level security is:
 * `office_can(account_id, capability)` decides what rows exist for a session,
 * and it would refuse an office user reading a table they hold no capability
 * for even if this map let them onto the page. This exists so that a person is
 * not shown a screen that will be empty or error -- a usability boundary
 * standing in front of a real one, not instead of it.
 */

export type OfficeRoute = Readonly<{
  /** Path prefix. `/dashboard/leads` also admits `/dashboard/leads/123`. */
  href: string;
  /** Shown in navigation and on the landing page. */
  label: string;
  /**
   * Every capability the page needs to be worth opening. A page requiring two
   * is listed with both: a jobs screen that cannot read clients shows rows of
   * unnamed work.
   */
  requires: readonly string[];
}>;

/**
 * The v1 surface, deliberately three entries.
 *
 * These are the pages backed end to end by capabilities that are enabled AND
 * whose tables have had their policies split and swapped (migrations
 * 20260820230000 through 20260820250000). Quotes, invoices and payments are
 * enabled as read capabilities in the catalog, but the tables behind them still
 * carry `is_owner` policies -- so an office user opening those pages would see
 * nothing and have no way to know why. They are absent until their policies are
 * wired, which is the same rule as everything else here: this list follows the
 * database, never leads it.
 */
export const OFFICE_ROUTES: readonly OfficeRoute[] = Object.freeze([
  Object.freeze({
    href: '/dashboard/leads',
    label: 'Leads',
    requires: Object.freeze(['leads.read']),
  }),
  Object.freeze({
    href: '/dashboard/clients',
    label: 'Clients',
    requires: Object.freeze(['clients.read']),
  }),
  Object.freeze({
    // Jobs name a client on nearly every row, so a jobs screen without
    // clients.read is a list of work for nobody.
    href: '/dashboard/jobs',
    label: 'Jobs',
    requires: Object.freeze(['jobs.read', 'clients.read']),
  }),
]);

/** Where an office user goes when they hold nothing. */
export const OFFICE_NO_ACCESS_PATH = '/office-access';

/** Routes this capability set actually opens, in the order they should be shown. */
export function officeRoutesFor(capabilities: Iterable<string>): readonly OfficeRoute[] {
  const held = new Set(capabilities);
  return OFFICE_ROUTES.filter((route) => route.requires.every((cap) => held.has(cap)));
}

/**
 * The route a path belongs to, or null when the path is not office-reachable.
 *
 * Prefix matching with a boundary check, so `/dashboard/leads/42` matches and
 * `/dashboard/leadsource` does not. Getting that wrong in the permissive
 * direction is how a lookalike path becomes reachable.
 */
export function officeRouteFor(pathname: string): OfficeRoute | null {
  return OFFICE_ROUTES.find(
    (route) => pathname === route.href || pathname.startsWith(`${route.href}/`),
  ) ?? null;
}

/** Whether an office user holding these capabilities may open this path. */
export function officeCanOpen(pathname: string, capabilities: Iterable<string>): boolean {
  const route = officeRouteFor(pathname);
  if (!route) return false;
  const held = new Set(capabilities);
  return route.requires.every((cap) => held.has(cap));
}

/**
 * Where to send an office user who asked for somewhere they cannot go.
 *
 * Their first permitted page rather than an error: they are an employee who
 * clicked a link, not an attacker probing paths, and the honest response to
 * "you cannot open Invoices" is to show them what they can open. When they hold
 * nothing at all, the holding page still says so plainly.
 */
export function officeLandingPath(capabilities: Iterable<string>): string {
  return officeRoutesFor(capabilities)[0]?.href ?? OFFICE_NO_ACCESS_PATH;
}
