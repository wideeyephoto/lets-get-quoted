import { isInsuranceEligibleTrade } from './trade-insurance';

export type NavTreatment = 'show' | 'demote' | 'hide'; // 'lock' lands in Phase 4

export type NavSignals = {
  role: 'owner' | 'office';
  /** Live predicate. NEVER an array — see §1 of docs/nav-phase-2-3-implementation-plan.md. */
  can: (capability: string) => boolean;
  /** From getAuthoritativeTrade. null means "unknown", which must read as 'show'. */
  trade: string | null;
  /** Sections with zero rows, ever. Absent key means "not measured", not "zero". */
  emptySections: ReadonlySet<string>;
};

/**
 * The canonical capability requirements for every navigation destination.
 *
 * Rows with no obvious office capability default to 'owner' (owner-only).
 * Unknown hrefs and destinations with 'always' default to 'show'.
 */
export const CAPABILITY_MAP: Record<string, string | 'owner' | 'always'> = {
  '/dashboard/leads': 'leads.read',
  '/dashboard/messages': 'messages.read',
  '/dashboard/jobs': 'jobs.read',
  '/dashboard/schedule': 'jobs.read',
  '/dashboard/schedule/booking': 'jobs.read',
  '/dashboard/crew': 'crew.read',
  '/dashboard/clients': 'clients.read',
  '/dashboard/inventory': 'inventory.read',
  '/dashboard/payments': 'payments.read',
  '/dashboard/insights': 'payments.read',
  '/dashboard/cash-flow': 'payments.read',
  '/dashboard/recurring': 'invoices.read',
  '/dashboard/marketing': 'marketing.read',
  '/dashboard/reviews': 'marketing.read',
  '/dashboard/sites': 'settings.write',
  '/dashboard/settings': 'always',
  '/dashboard': 'always',
  // Seven unmapped rows with no natural key default to owner-only:
  '/dashboard/claims': 'owner',
  '/dashboard/quick-stops': 'owner',
  '/dashboard/text-to-job': 'owner',
  '/dashboard/automations': 'owner',
  '/dashboard/services': 'owner',
  '/dashboard/expenses': 'owner',
  '/dashboard/merchandise': 'owner',
  '/dashboard/voice-calls': 'owner',
};

/**
 * Rail order of candidate items across all groups.
 */
export const NAV_RAIL_ORDER: readonly string[] = Object.freeze([
  '/dashboard/leads',
  '/dashboard/messages',
  '/dashboard/jobs',
  '/dashboard/schedule',
  '/dashboard/crew',
  '/dashboard/clients',
  '/dashboard/inventory',
  '/dashboard/claims',
  '/dashboard/text-to-job',
  '/dashboard/quick-stops',
  '/dashboard/schedule/booking',
  '/dashboard/voice-calls',
  '/dashboard/insights',
  '/dashboard/payments',
  '/dashboard/recurring',
  '/dashboard/services',
  '/dashboard/cash-flow',
  '/dashboard/expenses',
  '/dashboard/automations',
  '/dashboard/marketing',
  '/dashboard/merchandise',
  '/dashboard/reviews',
]);

/**
 * Helper to normalize section identifier for emptySections checks.
 */
function isSectionEmpty(emptySections: ReadonlySet<string>, href: string): boolean {
  if (emptySections.has(href)) return true;
  const stripped = href.replace(/^\/dashboard\/?/, '');
  return emptySections.has(stripped);
}

/**
 * Pure evaluation function for a single href:
 * Precedence: hide -> demote -> show. Evaluated in that order, first match wins.
 *
 * Three defaults that fail in the safe direction:
 * 1. Unknown href -> 'show'
 * 2. trade === null -> 'show'
 * 3. Section not measured (absent from emptySections) -> 'show'
 *
 * Owners are never hidden from (can: () => true short-circuit).
 */
export function navTreatment(href: string, signals: NavSignals): NavTreatment {
  const isOwner = signals.role === 'owner';

  // 1. Check HIDE
  if (!isOwner) {
    const required = CAPABILITY_MAP[href];
    if (required === 'owner') {
      return 'hide';
    }
    if (typeof required === 'string' && required !== 'always') {
      if (!signals.can(required)) {
        return 'hide';
      }
    }
  }

  // 2. Check DEMOTE
  // (a) Trade relevance (Insurance claims only in Phase 3)
  if (href === '/dashboard/claims') {
    if (signals.trade !== null && typeof signals.trade === 'string') {
      const isEligible = isInsuranceEligibleTrade(signals.trade);
      if (!isEligible) {
        return 'demote';
      }
    }
  }

  // (b) Zero usage demotion (crew, inventory, recurring)
  if (
    href === '/dashboard/crew' ||
    href === '/dashboard/inventory' ||
    href === '/dashboard/recurring'
  ) {
    if (isSectionEmpty(signals.emptySections, href)) {
      return 'demote';
    }
  }

  // 3. Default: SHOW
  return 'show';
}

/**
 * Resolves visible, demoted, and hidden counts across the entire rail order.
 */
export function resolveVisibleNav(
  signals: NavSignals,
  candidateHrefs: readonly string[] = NAV_RAIL_ORDER,
): {
  visible: string[];
  demoted: string[];
  hiddenCount: number;
} {
  const visible: string[] = [];
  const demoted: string[] = [];
  let hiddenCount = 0;

  for (const href of candidateHrefs) {
    const treatment = navTreatment(href, signals);
    if (treatment === 'show') {
      visible.push(href);
    } else if (treatment === 'demote') {
      demoted.push(href);
    } else {
      hiddenCount++;
    }
  }

  return {
    visible,
    demoted,
    hiddenCount,
  };
}

/**
 * Server rollout flag check: LGQ_NAV_PERSONA_ENABLED.
 * Defaults to false (off).
 */
export function isNavPersonaEnabled(): boolean {
  const flag = process.env.LGQ_NAV_PERSONA_ENABLED;
  return flag === '1' || flag === 'true';
}
