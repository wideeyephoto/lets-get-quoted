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
  /** Optional pinned items from nav-customization. Pinned items are never demoted. */
  pinned?: ReadonlySet<string>;
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
  '/dashboard/payments',
  '/dashboard/recurring',
  '/dashboard/sites',
  '/dashboard/automations',
  '/dashboard/marketing',
  '/dashboard/reviews',
]);

/**
 * Trade relevance profile distinguishing core versus non-applicable workflows per trade cluster.
 */
export type TradeRelevance = {
  claims: 'promoted' | 'standard' | 'demoted';
  inventory: 'promoted' | 'standard' | 'demoted';
  recurring: 'promoted' | 'standard' | 'demoted';
};

/**
 * Resolves trade-specific relevance for claims, inventory, and recurring jobs.
 */
export function getTradeRelevance(trade: string | null): TradeRelevance {
  if (!trade) {
    return { claims: 'standard', inventory: 'standard', recurring: 'standard' };
  }
  const t = trade.toLowerCase().trim();
  const tokens = t.split(/[-_\s]+/);

  const isGlass = tokens.includes('glass') || t === 'auto-glass' || t === 'storefront-glass' || t === 'glass-and-mirrors';
  const isRestorationOrRoofing =
    t.includes('roof') ||
    t.includes('water') ||
    t.includes('fire') ||
    t.includes('mold') ||
    t.includes('storm') ||
    t.includes('restoration') ||
    t.includes('disaster') ||
    t.includes('siding') ||
    isGlass;

  const isRecurringTrade =
    t.includes('lawn') ||
    t.includes('landscap') ||
    t.includes('clean') ||
    t.includes('pest') ||
    t.includes('pool') ||
    t.includes('waste') ||
    t.includes('snow') ||
    t.includes('wash');

  const isAutoInventory =
    t === 'auto-glass' ||
    t === 'auto-detailing' ||
    t === 'mobile-mechanics' ||
    t === 'mobile-tires' ||
    t === 'paintless-dent-repair' ||
    t === 'rv-repair' ||
    tokens.includes('auto') ||
    tokens.includes('mechanic') ||
    tokens.includes('vehicle');

  const isInventoryTrade =
    isGlass ||
    t.includes('plumb') ||
    t.includes('electric') ||
    t.includes('hvac') ||
    isAutoInventory ||
    t.includes('tire') ||
    t.includes('appliance');

  return {
    claims: isRestorationOrRoofing ? 'promoted' : isInsuranceEligibleTrade(trade) ? 'standard' : 'demoted',
    inventory: isInventoryTrade ? 'promoted' : 'standard',
    recurring: isRecurringTrade ? 'promoted' : 'standard',
  };
}

/**
 * Helper to normalize section identifier for emptySections checks.
 */
function isSectionEmpty(emptySections: ReadonlySet<string>, href: string): boolean {
  if (emptySections.has(href)) return true;
  const stripped = href.replace(/^\/dashboard\/?/, '');
  return emptySections.has(stripped);
}

/**
 * Helper to check if a navigation item has been pinned by the user.
 */
function isItemPinned(pinned: ReadonlySet<string> | undefined, href: string): boolean {
  if (!pinned) return false;
  if (pinned.has(href)) return true;
  const stripped = href.replace(/^\/dashboard\/?/, '');
  return pinned.has(stripped);
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

  // 1. Check HIDE (Capability security outranks preferences)
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

  // 2. If pinned by owner, never demote
  if (isItemPinned(signals.pinned, href)) {
    return 'show';
  }

  const relevance = getTradeRelevance(signals.trade);

  // 3. Check DEMOTE
  // (a) Trade relevance (Insurance claims demoted for non-insurance trades)
  if (href === '/dashboard/claims') {
    if (signals.trade !== null && typeof signals.trade === 'string') {
      if (relevance.claims === 'demoted') {
        return 'demote';
      }
    }
  }

  // (b) Zero usage demotion (crew, inventory, recurring)
  if (href === '/dashboard/crew') {
    if (isSectionEmpty(signals.emptySections, href)) {
      return 'demote';
    }
  }

  if (href === '/dashboard/inventory') {
    // Inventory is promoted/protected for glass and parts-heavy trades; never demote
    if (relevance.inventory !== 'promoted' && isSectionEmpty(signals.emptySections, href)) {
      return 'demote';
    }
  }

  if (href === '/dashboard/recurring') {
    // Recurring is promoted/protected for recurring-first trades; never demote
    if (relevance.recurring !== 'promoted' && isSectionEmpty(signals.emptySections, href)) {
      return 'demote';
    }
  }

  // 4. Default: SHOW
  return 'show';
}

/**
 * Resolves visible, demoted, and hidden counts across the entire rail order,
 * with trade-promoted items elevated to priority positions.
 */
export function resolveVisibleNav(
  signals: NavSignals,
  candidateHrefs: readonly string[] = NAV_RAIL_ORDER,
): {
  visible: string[];
  demoted: string[];
  hiddenCount: number;
  promoted: string[];
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

  // Determine promoted items based on trade relevance
  const promoted: string[] = [];
  if (signals.trade) {
    const relevance = getTradeRelevance(signals.trade);
    if (relevance.claims === 'promoted' && visible.includes('/dashboard/claims')) {
      promoted.push('/dashboard/claims');
    }
    if (relevance.inventory === 'promoted' && visible.includes('/dashboard/inventory')) {
      promoted.push('/dashboard/inventory');
    }
    if (relevance.recurring === 'promoted' && visible.includes('/dashboard/recurring')) {
      promoted.push('/dashboard/recurring');
    }
  }

  // If Claims is promoted to top-of-Work for glass/roofing/restoration:
  // Elevate /dashboard/claims right after /dashboard/leads in the Work group
  if (promoted.includes('/dashboard/claims') && visible.includes('/dashboard/claims')) {
    const claimsIdx = visible.indexOf('/dashboard/claims');
    if (claimsIdx > 0) {
      visible.splice(claimsIdx, 1);
      const leadsIdx = visible.indexOf('/dashboard/leads');
      const insertAt = leadsIdx >= 0 ? leadsIdx + 1 : 0;
      visible.splice(insertAt, 0, '/dashboard/claims');
    }
  }

  // If Recurring is promoted:
  // In Money section, ensure /dashboard/recurring is ahead of /dashboard/payments
  if (promoted.includes('/dashboard/recurring') && visible.includes('/dashboard/recurring') && visible.includes('/dashboard/payments')) {
    const recIdx = visible.indexOf('/dashboard/recurring');
    const payIdx = visible.indexOf('/dashboard/payments');
    if (recIdx > payIdx) {
      visible.splice(recIdx, 1);
      visible.splice(payIdx, 0, '/dashboard/recurring');
    }
  }

  return {
    visible,
    demoted,
    hiddenCount,
    promoted,
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
