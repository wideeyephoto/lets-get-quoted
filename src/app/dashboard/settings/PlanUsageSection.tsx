import { formatUsdFromCents } from '@/lib/billing/catalog';
import type {
  PlanUsageLimits,
  WorkspaceBalancesRead,
  WorkspacePlanRead,
  WorkspacePlanUsage,
} from '@/lib/billing/plan-usage';
import type { CapacityRow, WorkspaceCapacity } from '@/lib/billing/capacity-usage';
import type { CreditLotSplit, WorkspaceCreditLots } from '@/lib/billing/credit-lots';
import { formatStorageBytes, type WorkspaceStorageState } from '@/lib/billing/storage-usage';
import {
  NO_PURCHASED_SEATS,
  describeSeatLimit,
  type PurchasedSeats,
  type ActivePurchasedCapacitySubscription,
} from '@/lib/billing/purchased-seats';
import {
  describeOverageResource,
  formatOverageTotal,
  formatOverageRate,
  remainingCapMillicents,
  type OverageSummary,
} from '@/lib/billing/overage-summary';
import {
  forecastPeriodCost,
  formatForecast,
  type PeriodForecast,
} from '@/lib/billing/period-forecast';
import type { PlanIntent } from '@/lib/plan-intent';
import BasePlanSubscriptionCheckout from './BasePlanSubscriptionCheckout';
import CancelSubscriptionPanel from './CancelSubscriptionPanel';
import OverageAuthorizationPanel from './OverageAuthorizationPanel';
import PlanFitBanner from './PlanFitBanner';
import ChangePlanPanel from './ChangePlanPanel';
import { BILLING_PLANS, type BillingCycle, type BillingPlanId } from '@/lib/billing/catalog';
import { planLadder, type PlanBand } from '@/lib/billing/plan-crossover';
import TopUpPurchaseCheckout from './TopUpPurchaseCheckout';
import PurchasedCapacityList from './PurchasedCapacityList';
import SettingsHashLink from './SettingsHashLink';
import ProcessingVolumeRoiCalculator from './ProcessingVolumeRoiCalculator';
import PlanSubnav from './PlanSubnav';
import type { OfficeTeam } from '@/lib/office-team';
import OfficeTeamSection from './OfficeTeamSection';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * formatDate for values nobody validated on the way in.
 *
 * plan-usage and storage-usage both run their timestamps through an optionalIso
 * guard, so anything from them is parseable by the time it reaches here.
 * overage-summary does not -- it casts period_start and period_end straight off
 * the row -- and `new Date('whatever').toLocaleDateString()` renders the literal
 * string "Invalid Date" rather than throwing, which is how a date nobody checked
 * ends up printed on the one card a contractor might dispute.
 */
function formatDateOrNull(value: string | null): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return formatDate(value);
}

function platformFeeLabel(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(2)}%`;
}

function planPrice(plan: Extract<WorkspacePlanRead, { kind: 'ready' }>): string {
  if (plan.basePriceCents === null) {
    return plan.planCode === 'enterprise' ? 'Custom agreement' : 'Price pinned to your agreement';
  }
  if (plan.billingInterval === 'annual') return `${formatUsdFromCents(plan.basePriceCents)}/year`;
  return `${formatUsdFromCents(plan.basePriceCents)}/month`;
}

type ReadyPlan = Extract<WorkspacePlanRead, { kind: 'ready' }>;
type BillingStatus = ReadyPlan['billingStatus'];

/**
 * Named rather than inline, so the derivations further down can take them as
 * arguments instead of restating their shape. Both are supplied by page.tsx.
 */
export type CancellableProps = Readonly<{
  planName: string;
  currentPeriodEnd: string | null;
  alreadyScheduled: boolean;
}>;

export type PlanChangeProps = Readonly<{
  currentPlanCode: BillingPlanId;
  currentBillingInterval: 'none' | BillingCycle;
  currentPeriodEnd: string | null;
  pendingPlanCode: string | null;
  pendingEffectiveAt: string | null;
  options: readonly {
    planCode: BillingPlanId;
    billingInterval: 'none' | BillingCycle;
    label: string;
    effect: 'immediate' | 'at_renewal';
    priceLabel: string;
  }[];
}>;

export function billingStatusLabel(status: BillingStatus): string {
  switch (status) {
    case 'past_due': return 'Past due';
    case 'trialing': return 'Trial';
    case 'free': return 'Free';
    // "Incomplete" on its own reads as a form somebody forgot to finish. What
    // is incomplete is the payment, and saying so is the difference between a
    // customer who knows to act and one who contacts support.
    case 'incomplete': return 'Payment incomplete';
    case 'unpaid': return 'Unpaid';
    default: return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

/**
 * What to say when Stripe is not collecting.
 *
 * The generic entitlement-state note underneath says "This workspace is
 * currently restricted. Contact support if that does not look right." For a
 * subscriber whose bank is waiting on a 3-D Secure confirmation that is both
 * true and useless: it sends somebody to support for something only they can
 * do. These take precedence and say which thing is wrong.
 *
 * No self-serve billing portal exists yet, so none is promised here.
 */
export function collectionNote(status: BillingStatus): string | null {
  switch (status) {
    case 'incomplete':
      return 'Your subscription is waiting on its first payment, so its monthly allowances have not started. '
        + 'If your bank asked you to confirm the payment, completing that confirmation finishes it. '
        + 'Contact support if you did not get that request.';
    case 'past_due':
      return 'The most recent subscription payment has not gone through yet. Your workspace stays open while '
        + 'Stripe retries it. Contact support if the card on file needs to change.';
    case 'unpaid':
      return 'The most recent subscription payment was not collected and Stripe has stopped retrying it. '
        + 'Contact support to settle it and restore this plan.';
    default:
      return null;
  }
}

function includedLimits(
  limits: PlanUsageLimits,
  purchased: PurchasedSeats,
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string } | null> = [
    // Plan allowance PLUS anything bought. The database has always counted the
    // sum; this row read the plan alone, so a purchased seat worked and was
    // invisible on the one screen that states what you are entitled to.
    limits.officeUsers === null ? null : { label: 'Office users', value: describeSeatLimit(limits.officeUsers, purchased.officeUsers) },
    limits.crewUsers === null ? null : { label: 'Crew users', value: describeSeatLimit(limits.crewUsers, purchased.crewUsers) },
    limits.customDomainConnections === null ? null : { label: 'Custom domains', value: limits.customDomainConnections.toLocaleString('en-US') },
    limits.dedicatedBusinessNumbers === null ? null : { label: 'Dedicated business numbers', value: limits.dedicatedBusinessNumbers.toLocaleString('en-US') },
    limits.storageGb === null ? null : { label: 'File & photo storage', value: `${limits.storageGb.toLocaleString('en-US')} GB` },
    limits.quickBooksConnections === null ? null : { label: 'QuickBooks Online connections', value: limits.quickBooksConnections.toLocaleString('en-US') },
    limits.voiceConcurrentCalls === null ? null : { label: 'AI Voice Receptionist simultaneous calls', value: limits.voiceConcurrentCalls.toLocaleString('en-US') },
    limits.voiceHistoryDays === null ? null : { label: 'AI Voice Receptionist history', value: `${limits.voiceHistoryDays.toLocaleString('en-US')} days` },
  ];
  return rows.filter((row): row is { label: string; value: string } => row !== null);
}

function balanceNote(balance: Extract<WorkspacePlanUsage['balances'], { kind: 'ready' }>['balances'][number]): string {
  if (balance.availableUnits === null) return 'No balance was returned.';
  if (balance.availableUnits === 0) {
    return balance.resourceCode === 'ai_intake_threads'
      ? 'The standard quote form stays available.'
      : 'No credits are currently available.';
  }
  if (balance.nextExpirationAt) return `Next expiration ${formatDate(balance.nextExpirationAt)}`;
  return 'No expiration is scheduled.';
}

/**
 * The storage card's whole job is to not lie in the two directions it easily
 * could. A workspace the sweep has not reached has no measurement, and drawing
 * an empty bar would read as "you have used nothing" -- so it says what it
 * knows. A workspace with no entitlement row has no known limit, and inventing
 * one would be worse than saying so.
 */
type StorageView =
  | { kind: 'hidden' }
  | { kind: 'unmeasured'; limitBytes: number | null }
  | { kind: 'no_limit'; bytesUsed: number }
  | {
    kind: 'measured';
    bytesUsed: number;
    limitBytes: number;
    objectCount: number | null;
    /** When the sweep last ran. Arrives in props and was previously discarded. */
    measuredAt: string | null;
    percent: number;
    over: boolean;
    nearly: boolean;
  };

function storageView(storage: WorkspaceStorageState | null): StorageView {
  if (!storage) return { kind: 'hidden' };
  if (storage.bytesUsed === null) return { kind: 'unmeasured', limitBytes: storage.limitBytes };
  if (storage.limitBytes === null) return { kind: 'no_limit', bytesUsed: storage.bytesUsed };

  // A zero limit would divide by zero and, more importantly, is a real state --
  // an entitlement that includes no storage at all. Anything stored under it is
  // 100% of nothing, which is over.
  const percent = storage.limitBytes === 0
    ? (storage.bytesUsed > 0 ? 100 : 0)
    : Math.min(100, Math.round((storage.bytesUsed / storage.limitBytes) * 100));

  return {
    kind: 'measured',
    bytesUsed: storage.bytesUsed,
    limitBytes: storage.limitBytes,
    objectCount: storage.objectCount,
    measuredAt: storage.measuredAt,
    percent,
    over: storage.bytesUsed > storage.limitBytes,
    nearly: storage.bytesUsed <= storage.limitBytes && percent >= 80,
  };
}

type Tone = 'healthy' | 'info' | 'warn' | 'danger' | 'neutral';

/** A tone is never rendered without this word beside it. Color is not a status. */
function StatusLine({ tone, children }: { tone: Tone; children: string }) {
  return <p className="tone-status" data-tone={tone}>{children}</p>;
}

/**
 * THE SIX DATE FIELDS ON THIS SURFACE ARE FOUR INSTANTS, AND TWO PAIRS ARE THE
 * SAME DATABASE COLUMN.
 *
 * `plan.periodEnd` and `overage.periodEnd` both read workspace_entitlements
 * .period_end. `planChange.currentPeriodEnd` and `cancellable.currentPeriodEnd`
 * both read billing_subscriptions.current_period_end, and the projector sets one
 * from the other. Labelling per SOURCE would print one date up to four times
 * under four different names and look like four separate commitments.
 *
 * So: one candidate per instant, the earliest still ahead of us wins, and the
 * label says what the date MEANS rather than which loader produced it.
 *
 * A Flex workspace has none of these, structurally -- billing_subscriptions
 * excludes 'flex' by CHECK, and the Flex seed writes neither period_end nor
 * next_allowance_reset_at. That is "nothing is scheduled", which is a true and
 * rather good thing to say about pay-as-you-go, not a failed lookup.
 */
type NextEvent = Readonly<{ label: string; at: string }>;

export function nextEvent(
  plan: WorkspacePlanRead,
  balances: WorkspaceBalancesRead,
  planChange: PlanChangeProps | null,
  cancellable: CancellableProps | null,
  now: number,
): NextEvent | null {
  const candidates: (NextEvent | null)[] = [];

  if (planChange?.pendingEffectiveAt) {
    candidates.push({ label: 'Plan changes', at: planChange.pendingEffectiveAt });
  }

  // Cancellation and renewal are the same column and cannot both be true. A
  // subscription set to cancel does not renew, so saying "Renews" about it
  // would be the single most disputable sentence on the page.
  const periodEnd = planChange?.currentPeriodEnd ?? cancellable?.currentPeriodEnd ?? null;
  if (periodEnd) {
    candidates.push(cancellable?.alreadyScheduled
      ? { label: 'Plan ends', at: periodEnd }
      : { label: 'Renews', at: periodEnd });
  }

  if (plan.kind === 'ready' && plan.nextAllowanceResetAt) {
    candidates.push({ label: 'Credits reset', at: plan.nextAllowanceResetAt });
  }

  if (balances.kind === 'ready') {
    const expiries = balances.balances
      .map((balance) => balance.nextExpirationAt)
      .filter((value): value is string => Boolean(value))
      .sort();
    if (expiries[0]) candidates.push({ label: 'Credits expire', at: expiries[0] });
  }

  const future = candidates
    .filter((candidate): candidate is NextEvent => candidate !== null)
    .filter((candidate) => Number.isFinite(Date.parse(candidate.at)) && Date.parse(candidate.at) >= now)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return future[0] ?? null;
}

/**
 * The tone of the plan card, in the order a contractor needs to hear it.
 *
 * Money that is not being collected outranks everything: a workspace can be
 * restricted BECAUSE the payment failed, and telling somebody "restricted,
 * contact support" when their bank is waiting on a 3-D Secure confirmation
 * sends them to the one place that cannot help.
 */
function planTone(plan: WorkspacePlanRead): Tone {
  if (plan.kind !== 'ready') return 'neutral';
  if (plan.billingStatus === 'unpaid' || plan.entitlementState === 'restricted') return 'danger';
  if (collectionNote(plan.billingStatus)) return 'warn';
  if (plan.entitlementState !== 'active') return 'warn';
  if (plan.billingStatus === 'free') return 'neutral';
  return 'healthy';
}

function planStatusWord(plan: WorkspacePlanRead): string {
  if (plan.kind !== 'ready') return 'Not available right now';
  if (collectionNote(plan.billingStatus)) return billingStatusLabel(plan.billingStatus);
  if (plan.entitlementState !== 'active') {
    return `Workspace ${plan.entitlementState}`;
  }
  if (plan.billingInterval === 'none') return 'Pay as you go — nothing renews';
  return 'Active';
}

/**
 * Every branch names what the figure is made of. The one thing this must never
 * do is print a plain number: "$39.00" alone is read as an invoice, and this is
 * not one -- it cannot see proration, tax, discounts or account credits, and
 * two of the seven bases are cases where something is missing from the total.
 */
/**
 * Nearest hundred dollars. These are the volumes at which two cost lines cross,
 * not amounts anybody will be invoiced, and quoting one to the cent invites a
 * reader to treat "$5,207.31" as a figure somebody computed for them. Both
 * edges of adjacent bands round the same way, so a band never appears to start
 * before the one before it ended.
 */
function ladderBandDollars(annualBasisCents: number): number {
  return Math.round(annualBasisCents / 12 / 100 / 100) * 100;
}

/**
 * The arithmetic, in the words somebody would use to check it. Both plans'
 * actual numbers, so the reader can do the division themselves rather than
 * trusting a figure in an orange box -- which is the whole reason the mockup's
 * invented "$25-$32/month" could not ship.
 */
/**
 * Same convention as SettingsTabs' TAB_ICONS: path data only, dropped into a
 * 24-box that inherits stroke from CSS. A second icon system for four glyphs
 * would be two things to keep in step.
 */
const GLANCE_ICONS: Readonly<Record<string, string>> = Object.freeze({
  plan: '<path d="M4 6.5h16v11H4z"/><path d="M7.5 10h4M7.5 14h7"/>',
  event: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3.5v3M16 3.5v3"/>',
  extra: '<path d="M12 4v16M8 8h5.5a2.5 2.5 0 0 1 0 5H10a2.5 2.5 0 0 0 0 5H16"/>',
  projected: '<path d="M4 19.5h16"/><path d="M6.5 16V11M11 16V7.5M15.5 16v-6M20 16V5"/>',
});

/**
 * Section-heading glyphs, same 24-box convention as GLANCE_ICONS above and
 * SettingsTabs below it. The mockup puts one beside every heading; without them
 * the page reads as a wall of identical cards.
 */
const SECTION_ICONS: Readonly<Record<string, string>> = Object.freeze({
  plan: '<path d="M12 3.5 3.5 8l8.5 4.5L20.5 8 12 3.5Z"/><path d="M3.5 12.5 12 17l8.5-4.5"/><path d="M3.5 16.5 12 21l8.5-4.5"/>',
  fit: '<path d="M4 19.5h16"/><path d="M4 15.5 9.5 10l4 3.5L20 6"/><path d="M20 10V6h-4"/>',
  credits: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M14.5 9.75c0-1.24-1.12-2.25-2.5-2.25s-2.5 1.01-2.5 2.25S10.62 12 12 12s2.5 1.01 2.5 2.25-1.12 2.25-2.5 2.25-2.5-1.01-2.5-2.25"/>',
  storage: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>',
  capacity: '<circle cx="9" cy="8.5" r="3"/><path d="M3 19a6 6 0 0 1 12 0"/><path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 19a6 6 0 0 0-2-4.5"/>',
});

function SectionIcon({ name }: { name: keyof typeof SECTION_ICONS }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="workspace-section-ic"
      dangerouslySetInnerHTML={{ __html: SECTION_ICONS[name] }}
    />
  );
}

function GlanceCell({ icon, label, value, children }: {
  icon: keyof typeof GLANCE_ICONS;
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="plan-glancebar-cell">
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="plan-glancebar-ic"
        dangerouslySetInnerHTML={{ __html: GLANCE_ICONS[icon] }}
      />
      <span className="plan-glancebar-text">
        <span className="plan-glancebar-label">{label}</span>
        <strong className="plan-glancebar-value">{value}</strong>
        {children}
      </span>
    </div>
  );
}

function describeCrossover(
  fromCode: BillingPlanId,
  toCode: BillingPlanId,
  cycle: BillingCycle,
): string {
  const from = BILLING_PLANS[fromCode];
  const to = BILLING_PLANS[toCode];
  const monthly = (plan: typeof from) => (plan.monthlyPriceCents === 0
    ? 'nothing monthly'
    : `${formatUsdFromCents(cycle === 'annual'
      ? Math.round(plan.annualPriceCents / 12)
      : plan.monthlyPriceCents)} a month`);
  const rate = (plan: typeof from) => `${(plan.platformFeeBps / 100).toFixed(2)}%`;
  return `${from.name} costs ${monthly(from)} plus ${rate(from)} of what you collect. `
    + `${to.name} costs ${monthly(to)} plus ${rate(to)}. Those two lines meet at the figure above. `
    + 'It is the discount-adjusted service subtotal the LGQ fee is taken on, so tax, tips, refunds '
    + "and Stripe's own processing are not counted, and add-ons are not included.";
}

function describeBand(band: PlanBand): string {
  const money = (cents: number) => `$${ladderBandDollars(cents).toLocaleString('en-US')}`;
  if (band.toAnnualBasisCents === null) return `Above about ${money(band.fromAnnualBasisCents)} a month`;
  if (band.fromAnnualBasisCents === 0) return `Up to about ${money(band.toAnnualBasisCents)} a month`;
  return `About ${money(band.fromAnnualBasisCents)} to ${money(band.toAnnualBasisCents)} a month`;
}

/**
 * The two branches with no number must not wear the same word. A workspace
 * pinned to an agreement is ACTIVE, paying, and renewing -- rendering
 * "Unavailable" over it puts the only outage-shaped word on the strip above a
 * plan that is working perfectly, and it is the word a customer screenshots.
 * A failed read genuinely is unavailable and keeps it.
 */
function forecastValueWord(forecast: PeriodForecast): string {
  if (forecast.millicents !== null) return formatForecast(forecast.millicents);
  return forecast.basis === 'price_unknown' ? 'Not projected' : 'Unavailable';
}

function forecastStatusWord(forecast: PeriodForecast, plan: WorkspacePlanRead): string {
  switch (forecast.basis) {
    case 'unreadable':
      return 'Could not be read';
    case 'price_unknown':
      return 'Your price is set by your agreement';
    case 'plan_plus_unknown':
      return 'Extra usage could not be read';
    case 'plan_plus_accrued':
      return 'Plan price plus extra usage so far';
    case 'plan_plus_projected':
      return 'Plan price plus projected extra usage';
    case 'plan_plus_capped':
      return 'Plan price plus extra usage, at your cap';
    case 'plan_only':
    default:
      // Flex's answer is a real zero, and saying "plan price only" over $0.00
      // invites the reader to wonder what the plan price was.
      return plan.kind === 'ready' && plan.billingInterval === 'none'
        ? 'Flex has no plan price'
        : 'Plan price only';
  }
}


function ResourceIcon({ label }: { label: string }) {
  const norm = label.toLowerCase();
  if (norm.includes('text') || norm.includes('sms')) {
    return (
      <svg viewBox="0 0 24 24" className="plan-usage-resource-ic" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    );
  }
  if (norm.includes('email') || norm.includes('mail')) {
    return (
      <svg viewBox="0 0 24 24" className="plan-usage-resource-ic" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
    );
  }
  if (norm.includes('intake') || norm.includes('thread')) {
    return (
      <svg viewBox="0 0 24 24" className="plan-usage-resource-ic" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      </svg>
    );
  }
  if (norm.includes('draft') || norm.includes('writing')) {
    return (
      <svg viewBox="0 0 24 24" className="plan-usage-resource-ic" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" />
      </svg>
    );
  }
  if (norm.includes('office') || norm.includes('user')) {
    return (
      <svg viewBox="0 0 24 24" className="plan-usage-resource-ic" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect width="20" height="14" x="2" y="7" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    );
  }
  if (norm.includes('crew')) {
    return (
      <svg viewBox="0 0 24 24" className="plan-usage-resource-ic" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="plan-usage-resource-ic" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
    </svg>
  );
}

/**
 * One credit resource, with a meter ONLY where a meter can be honest.
 *
 * A Flex workspace has no refreshing allowance at all -- its starter credits do
 * not expire and are never re-granted -- so there is no window to measure and it
 * gets a count. A paid workspace has both, and they are stated as two numbers
 * rather than one sum, because "444 available" hides whether 400 of those vanish
 * at the reset.
 */
function CreditBalance({ resource }: { resource: CreditLotSplit }) {
  const hasWindow = resource.periodGranted !== null && resource.periodGranted > 0;
  const tone: Tone = !hasWindow
    ? 'neutral'
    : resource.percentUsed !== null && resource.percentUsed >= 90
      ? 'warn'
      : 'healthy';

  return (
    <article className="plan-usage-balance" data-tone={tone}>
      <div className="plan-usage-resource-header">
        <div className="plan-usage-resource-title">
          <span className={`plan-usage-status-dot ${tone}`} aria-hidden="true" />
          <ResourceIcon label={resource.label} />
          <span>{resource.label}</span>
        </div>
        <SettingsHashLink href="#buy-credits" className="plan-usage-refill-chip" aria-label={`Refill ${resource.label}`}>
          + Refill
        </SettingsHashLink>
      </div>
      <strong>
        {hasWindow
          ? `${resource.periodRemaining!.toLocaleString('en-US')} of ${resource.periodGranted!.toLocaleString('en-US')} left`
          : resource.nonExpiring > 0
            ? `${resource.nonExpiring.toLocaleString('en-US')} available`
            // Not "0". Nothing was granted and nothing expired -- there is no
            // balance here to report, and a zero claims one was spent.
            : 'Not issued'}
      </strong>

      {hasWindow ? (
        <div
          className="plan-usage-storage-meter"
          role="img"
          aria-label={`${resource.percentUsed ?? 0}% of this period's ${resource.label.toLowerCase()} used`}
        >
          {/* FILLS WITH WHAT HAS BEEN USED, like every other meter on this page.
              It drew the REMAINDER at first, which put a full green bar beside
              "500 of 500 left" and an identical full green bar beside "Office
              users 1 of 1 used - at plan limit" two cards below. One visual,
              two opposite meanings, on one screen. The aria-label said "used"
              throughout and was the half that was right. */}
          <div
            className={`plan-usage-storage-meter-fill${resource.percentUsed !== null && resource.percentUsed >= 90 ? ' nearly' : ''}`}
            style={{ width: `${Math.max(resource.percentUsed ?? 0, 2)}%` }}
          />
        </div>
      ) : null}

      <small>
        {hasWindow
          ? resource.nextExpirationAt
            ? `Refreshes ${formatDate(resource.nextExpirationAt)}`
            : 'Refreshes with your plan'
          : 'Never expires'}
      </small>
      {/* Stated separately whenever both exist. Folding a non-expiring balance
          into the meter is what would let a top-up read as 122% remaining. */}
      {hasWindow && resource.nonExpiring > 0 ? (
        <small>Plus {resource.nonExpiring.toLocaleString('en-US')} that never expire</small>
      ) : null}
    </article>
  );
}

const CAPACITY_TONE: Readonly<Record<CapacityRow['verdict'], Tone>> = {
  // Not measured is NEUTRAL, never healthy and never a warning. A read that did
  // not happen is not a problem the contractor caused and not an all-clear.
  unknown: 'neutral',
  healthy: 'healthy',
  near: 'warn',
  at_limit: 'info',
  over: 'danger',
};

/**
 * One capacity row: the figure, the word, and a bar only where a bar can be
 * honest.
 *
 * `at_limit` is INFO rather than a warning. On Flex, "1 of 1 office users" is
 * simply what the free plan is, and painting it amber tells somebody that the
 * thing they chose is broken. Over the limit is a different matter and is the
 * only red here.
 */
function CapacityMeter({ row }: { row: CapacityRow }) {
  const tone = CAPACITY_TONE[row.verdict];
  const isCrew = row.key === 'crew_users';
  return (
    <li className="plan-usage-capacity" data-tone={tone}>
      <div className="plan-usage-resource-header">
        <div className="plan-usage-resource-title">
          <ResourceIcon label={row.label} />
          <span className="plan-usage-capacity-label">{row.label}</span>
        </div>
        {isCrew ? (
          <SettingsHashLink href="#buy-credits" className="plan-usage-refill-chip" aria-label="Add extra crew seat">
            + Add Seat ($5/mo)
          </SettingsHashLink>
        ) : null}
      </div>
      <strong className="plan-usage-capacity-figure">{row.detail}</strong>
      {/* No bar when the count could not be read or no limit is known. An empty
          track reads as "you have used none of it", which is the single most
          misleading thing an unmeasured row could say. */}
      {row.percent === null ? null : (
        <div
          className="plan-usage-storage-meter"
          role="img"
          aria-label={`${row.percent}% of the ${row.label.toLowerCase()} allowance used`}
        >
          <div
            className={`plan-usage-storage-meter-fill${row.verdict === 'over' ? ' over' : row.verdict === 'near' ? ' nearly' : ''}`}
            style={{ width: `${Math.max(row.percent, 2)}%` }}
          />
        </div>
      )}
      <StatusLine tone={tone}>{row.status}</StatusLine>
    </li>
  );
}

/**
 * What has been run up past the allowance, and what is left before it stops.
 *
 * THE ACCRUAL TABLE HAS BEEN WRITTEN SINCE 20260819080000 AND READ BY NOTHING.
 * A contractor could authorize overage, incur it, and have no way to see the
 * number until it reached a card. Of the two halves of an overage -- charging it
 * and showing it -- this is the one that has to exist first, because a figure
 * nobody can see is a figure nobody can dispute in time.
 *
 * Says "not switched on" rather than "$0.00" when overage is disabled. Those are
 * different facts: one is a workspace that has agreed to pay for overruns and
 * has not had any, the other has not agreed at all.
 */
function OverageCard({ overage, selfServe }: { overage: OverageSummary; selfServe: boolean }) {
  const remaining = remainingCapMillicents(overage);

  // A read that failed is not a workspace with overage switched off, and the two
  // used to render identically -- confidently, and about money.
  if (!overage.readable) {
    return (
      <details className="plan-usage-limit-row workspace-fold" id="overage" open>
        <summary>
          <span className="section-heading workspace-section-heading compact-heading">
            <span className="eyebrow">Spending control</span>
            <span className="workspace-fold-title">Extra usage</span>
          </span>
          <em className="workspace-fold-note">Unavailable</em>
        </summary>
        <div className="plan-usage-unavailable" role="status">
          <strong>Extra usage could not be read.</strong>
          <span>
            Nothing has been shown as zero and nothing has been assumed about your settings.
            Refresh in a moment, or contact support if this continues.
          </span>
        </div>
      </details>
    );
  }

  // NO CONTROL ON AN UNREADABLE CARD, deliberately -- the branch above returns
  // before this one. A switch cannot be offered on a state nobody could read:
  // it would render "off" from a failed query and invite somebody to turn on
  // something that was already on, at a limit they did not choose.

  if (!overage.enabled) {
    return (
        <details className="plan-usage-limit-row workspace-fold" id="overage">
          <summary>
            <span className="section-heading workspace-section-heading compact-heading">
              <span className="eyebrow">Spending control</span>
              <span className="workspace-fold-title">Extra usage</span>
            </span>
            <em className="workspace-fold-note neutral">Off</em>
          </summary>
          {selfServe
            ? <OverageAuthorizationPanel enabled={false} capCents={overage.capCents} />
            : (
              <p className="usage-muted">
                When an allowance runs out, sends and drafts are refused rather than billed.
                Nothing is charged past your plan without your authorization.
              </p>
            )}
        </details>
    );
  }

  return (
      <details className="plan-usage-limit-row workspace-fold" id="overage" open={overage.atCap}>
        <summary>
          <span className="section-heading workspace-section-heading compact-heading">
            <span className="eyebrow">Spending control</span>
            <span className="workspace-fold-title">Extra usage</span>
          </span>
          <em className={`workspace-fold-note${overage.atCap ? '' : ' neutral'}`}>
            {overage.atCap ? 'Limit reached' : formatOverageTotal(overage.totalMillicents)}
          </em>
        </summary>
      {/* WHICH period. Both dates have been loaded since the accrual read was
          written and rendered nowhere, so the card said "this period" and left
          the reader to guess which one -- on the one figure here they might want
          to dispute. Note this is period_END, never period_start on its own: the
          projector moves period_start mid-month, which is why the accrual query
          matches by overlap rather than equality. */}
      {formatDateOrNull(overage.periodEnd) ? (
        <p className="plan-usage-fineprint">
          {formatDateOrNull(overage.periodStart)
            ? `${formatDateOrNull(overage.periodStart)} — `
            : 'Through '}
          {formatDateOrNull(overage.periodEnd)}
        </p>
      ) : null}
      <p className="usage-overage-total">
        <strong>{formatOverageTotal(overage.totalMillicents)}</strong>
        {overage.capCents === null ? null : (
          <span>
            of a {formatOverageTotal(overage.capCents * 1000)} limit
          </span>
        )}
      </p>

      {overage.atCap ? (
        <p className="usage-overage-atcap">
          You&rsquo;ve reached your limit, so nothing further is being billed &mdash; sends and
          drafts past your allowance are being refused until the period resets.
        </p>
      ) : remaining !== null ? (
        <p className="usage-muted">{formatOverageTotal(remaining)} left before that stops.</p>
      ) : null}

      {overage.lines.length === 0 ? (
        <p className="usage-muted">Nothing extra used yet this period.</p>
      ) : (
        <ul className="usage-overage-lines">
          {overage.lines.map((line) => (
            <li key={line.resourceCode}>
              <span>{describeOverageResource(line.resourceCode)}</span>
              {/* THE RATE, because the authorization text says charges are
                  "at the published per-unit rates" and no page published
                  them. rateMillicents was already computed here and thrown
                  away. A consent that references a number the customer
                  cannot see is the shape of a chargeback. */}
              <span>
                {line.units.toLocaleString('en-US')}
                {line.rateMillicents === null ? null : (
                  <span className="usage-overage-rate"> x {formatOverageRate(line.rateMillicents)}</span>
                )}
              </span>
              <span>{formatOverageTotal(line.millicents)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="usage-fineprint">
        Charged after the period ends. Every figure here is what has already been used, not
        an estimate.
      </p>
      {/* Below the figures, not above them: somebody arriving at this card wants
          to know what they have spent before they are offered a control that
          changes what they can spend. */}
      {selfServe ? <OverageAuthorizationPanel enabled capCents={overage.capCents} /> : null}
        </details>
    );
  }

export default function PlanUsageSection({
  data,
  storage = null,
  purchasedSeats = NO_PURCHASED_SEATS,
  purchasedCapacitySubscriptions = [],
  showSubscriptionCheckout = false,
  showTopUpPurchase = false,
  cancellable = null,
  planChange = null,
  topUpCheckoutStatus = null,
  overage,
  planIntent = null,
  capacity = null,
  lots = null,
  officeTeam = null,
  overageSelfServe = false,
}: {
  data: WorkspacePlanUsage;
  officeTeam?: OfficeTeam | null;
  storage?: WorkspaceStorageState | null;
  purchasedSeats?: PurchasedSeats;
  purchasedCapacitySubscriptions?: ActivePurchasedCapacitySubscription[];
  showSubscriptionCheckout?: boolean;
  showTopUpPurchase?: boolean;
  topUpCheckoutStatus?: 'success' | 'canceled' | null;
  overage: OverageSummary | null;
  // The plan chosen on /pricing before this workspace existed, already parsed.
  planIntent?: PlanIntent | null;
  // Present only when this workspace has a subscription there is still something
  // to cancel, and only when the cancellation flag is on.
  cancellable?: CancellableProps | null;
  planChange?: PlanChangeProps | null;
  /** Used against entitled, for the dimensions a workspace can actually consume. */
  capacity?: WorkspaceCapacity | null;
  /**
   * Credits split into refreshing and non-expiring. Its own read and its own
   * `unavailable`, so a refused lot query falls back to the balance view above
   * rather than emptying the section.
   */
  lots?: WorkspaceCreditLots | null;
  /**
   * Whether the owner may change the overage switch from here. Its own flag,
   * separate from the one that reveals this whole tab: showing somebody what
   * they are spending and letting them authorize more spending are different
   * decisions, and the read half shipped first on purpose.
   */
  overageSelfServe?: boolean;
}) {
  const storageState = storageView(storage);
  const limits = data.plan.kind === 'ready' ? includedLimits(data.plan.limits, purchasedSeats) : [];
  // Server-rendered, so this is the render instant and not a client clock that
  // could disagree with the dates beside it. Read ONCE and shared: both readers
  // below answer questions about where we are in the billing period, and two
  // clock reads a few milliseconds apart could put them on opposite sides of a
  // period boundary -- "Renews today" beside a projection for the next period.
  const now = Date.now();
  const event = nextEvent(data.plan, data.balances, planChange, cancellable, now);
  const forecast = forecastPeriodCost(data.plan, overage, now);

  // WITHHELD FROM A PINNED WORKSPACE, deliberately. A workspace on a superseded
  // catalog is billed at prices this ladder does not know, so comparing it
  // against today's published ones would be a confident answer to a question
  // about somebody else's plan. Enterprise is excluded for the same reason: a
  // custom agreement has no catalog price to cross.
  const ladderCycle: BillingCycle = data.plan.kind === 'ready' && data.plan.billingInterval === 'annual'
    ? 'annual'
    : 'monthly';
  const ladder = data.plan.kind === 'ready'
    && data.plan.usesCurrentCatalog
    && data.plan.planCode !== 'enterprise'
    ? planLadder(data.plan.planCode, ladderCycle)
    : null;

  // The band directly above the current one. findIndex returning -1 would make
  // `-1 + 1` select the FIRST band and suggest Flex to a Flex workspace, so the
  // index is checked rather than assumed.
  const currentBandIndex = ladder ? ladder.findIndex((band) => band.isCurrent) : -1;
  const nextBand = ladder && currentBandIndex >= 0 && currentBandIndex + 1 < ladder.length
    ? ladder[currentBandIndex + 1]
    : null;

  // Where "Review <plan>" goes, and null when there is nowhere to send anybody.
  // A button promising a review that scrolls to nothing is worse than no button:
  // both upgrade surfaces are flag-gated and may not be rendered at all.
  const planFitCtaHref = planChange ? '#change-plan' : showSubscriptionCheckout ? '#choose-paid-plan' : null;

  // WHAT SURVIVES THE SECTION BEING SHUT. `over` and `near` force it open,
  // because those are states somebody can still act on. `at_limit` does not:
  // Flex grants one office seat and the owner occupies it, so every Flex
  // workspace sits there permanently and treating it as an alarm would mean the
  // fold never closes for anybody. It still appears in the summary, so a
  // collapsed section never costs the reader the fact.
  const capacityRows = capacity?.rows ?? [];
  const capacityNeedsAttention = capacityRows.some((row) => row.verdict === 'over' || row.verdict === 'near');
  const overCount = capacityRows.filter((row) => row.verdict === 'over').length;
  const atLimitCount = capacityRows.filter((row) => row.verdict === 'at_limit').length;
  const capacitySummaryNote = overCount > 0
    ? `${overCount} over limit`
    : atLimitCount > 0
      ? `${atLimitCount} at plan limit`
      : null;
  const tone = planTone(data.plan);
  const canStartFirstSubscription = data.plan.kind === 'ready'
    && data.plan.planCode === 'flex'
    && data.plan.billingInterval === 'none'
    && data.plan.billingStatus === 'free'
    && data.plan.entitlementState === 'active';
  const creditSummary = lots?.kind === 'ready'
    ? lots.resources.map((resource) => {
      const available = (resource.periodRemaining ?? 0) + resource.nonExpiring;
      return `${resource.label.replace(/ credits$/i, '')}: ${available.toLocaleString('en-US')}`;
    }).join(' · ')
    : data.balances.kind === 'ready'
      ? data.balances.balances.map((balance) => (
        `${balance.label.replace(/ credits$/i, '')}: ${balance.availableUnits?.toLocaleString('en-US') ?? '—'}`
      )).join(' · ')
      : 'Unavailable';
  const creditNeedsAttention = lots?.kind !== 'ready' && data.balances.kind !== 'ready';

  return (
    <>
      <PlanSubnav planName={data.plan.kind === 'ready' ? data.plan.planName : 'Plan'} />

      {/* SUBVIEW 1: USAGE & BALANCES */}
      <div className="plan-subview-panel active" data-subview="usage" role="tabpanel">
        <section className="panel workspace-section-card" id="plan-at-a-glance">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">At a glance</p>
            <h2>Plan &amp; usage</h2>
          </div>
          <div className="plan-glancebar">
            <GlanceCell icon="plan" label="Current plan" value={data.plan.kind === 'ready' ? data.plan.planName : 'Unavailable'}>
              <StatusLine tone={tone}>{planStatusWord(data.plan)}</StatusLine>
            </GlanceCell>
            <GlanceCell icon="event" label="Next event" value={event ? formatDate(event.at) : 'None scheduled'}>
              <StatusLine tone="neutral">
                {event
                  ? event.label
                  : data.plan.kind === 'ready' && data.plan.billingInterval === 'none'
                    ? 'Nothing renews and nothing expires'
                    : 'Nothing is scheduled'}
              </StatusLine>
            </GlanceCell>
            <GlanceCell icon="projected" label="Projected this period" value={forecastValueWord(forecast)}>
              <StatusLine tone="neutral">{forecastStatusWord(forecast, data.plan)}</StatusLine>
            </GlanceCell>
          </div>
          {forecast.millicents !== null ? (
            <details className="plan-usage-limit-details plan-glance-details">
              <summary>About projected cost</summary>
              <p className="plan-usage-fineprint">
                A projection, not a bill. Excludes tax, proration, discounts and account credits.
                The LGQ platform fee is taken from the payments you collect, not billed here.
              </p>
            </details>
          ) : null}

          <nav className="plan-jumpbar" aria-label="Plan page quick navigation">
            <SettingsHashLink href="#current-plan" className="plan-jump-pill">
              <SectionIcon name="plan" /> Plan
            </SettingsHashLink>
            <SettingsHashLink href="#usage-balances" className="plan-jump-pill">
              <SectionIcon name="credits" /> Usage &amp; Limits
            </SettingsHashLink>
            <SettingsHashLink href="#workspace-storage" className="plan-jump-pill">
              <SectionIcon name="storage" /> Storage
            </SettingsHashLink>
            <SettingsHashLink href="#included-limits" className="plan-jump-pill">
              <SectionIcon name="capacity" /> Team
            </SettingsHashLink>
            {planChange ? (
              <SettingsHashLink href="#change-plan" className="plan-jump-pill">
                <span>⚡ Plan Options</span>
              </SettingsHashLink>
            ) : null}
            {showTopUpPurchase ? (
              <SettingsHashLink href="#buy-credits" className="plan-jump-pill highlight">
                <span>🛒 Add-ons</span>
              </SettingsHashLink>
            ) : null}
          </nav>
        </section>

        <section className="panel workspace-section-card" id="usage-balances">
          <div className="workspace-section-headrow">
            <div className="section-heading workspace-section-heading compact-heading">
              <p className="eyebrow">Available now</p>
              <h2><SectionIcon name="credits" />Usage &amp; limits</h2>
            </div>
            {showTopUpPurchase ? (
              <SettingsHashLink className="btn workspace-section-action" href="#buy-credits">
                Add credits
              </SettingsHashLink>
            ) : null}
          </div>
          <div className="plan-usage-limit-stack" role="group" aria-label="Credits, storage, extra usage, and plan capacity">
            <details className="plan-usage-limit-row workspace-fold plan-usage-credit-row" open={creditNeedsAttention}>
              <summary>
                <span className="section-heading workspace-section-heading compact-heading">
                  <span className="eyebrow">Communications &amp; AI</span>
                  <span className="workspace-fold-title"><SectionIcon name="credits" />Credit balances</span>
                </span>
                <em className={`workspace-fold-note${creditNeedsAttention ? '' : ' neutral'} plan-usage-limit-summary`}>
                  {creditSummary}
                </em>
              </summary>
              {lots?.kind === 'ready' ? (
                <div className="plan-usage-balance-grid">
                  {lots.resources.map((resource) => (
                    <CreditBalance key={resource.resourceCode} resource={resource} />
                  ))}
                </div>
              ) : data.balances.kind === 'ready' ? (
                <div className="plan-usage-balance-grid">
                  {data.balances.balances.map((balance) => (
                    <article className="plan-usage-balance" key={balance.resourceCode}>
                      <span>{balance.label}</span>
                      <strong>
                        {balance.availableUnits === null
                          ? 'Not issued'
                          : `${balance.availableUnits.toLocaleString('en-US')} available`}
                      </strong>
                      <small>{balanceNote(balance)}</small>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="plan-usage-unavailable" role="status">
                  <strong>Balances could not be loaded.</strong>
                  <span>No missing balance has been shown as zero.</span>
                </div>
              )}
              <details className="plan-usage-limit-details plan-usage-credit-details">
                <summary>How these balances work</summary>
                <p className="workspace-details-copy plan-usage-intro">
                  Plan credits refresh each period. Purchased credits and starter balances are counted separately,
                  never expire, and are used only after refreshing credits run out.
                </p>
              </details>
            </details>

            {storageState.kind !== 'hidden' ? (
              <details
                className="plan-usage-limit-row workspace-fold"
                id="workspace-storage"
                open={storageState.kind !== 'measured' || storageState.over || storageState.nearly}
              >
                <summary>
                  <span className="section-heading workspace-section-heading compact-heading">
                    <span className="eyebrow">Files &amp; photos</span>
                    <span className="workspace-fold-title"><SectionIcon name="storage" />Storage</span>
                  </span>
                  <em className={`workspace-fold-note${storageState.kind === 'measured' && !storageState.over && !storageState.nearly ? ' neutral' : ''}`}>
                    {storageState.kind === 'measured'
                      ? `${formatStorageBytes(storageState.bytesUsed)} of ${formatStorageBytes(storageState.limitBytes)}`
                      : 'Needs attention'}
                  </em>
                </summary>

                {storageState.kind === 'measured' ? (
                  <>
                    <div className="plan-usage-storage-figure">
                      <strong>{formatStorageBytes(storageState.bytesUsed)}</strong>
                      <span>of {formatStorageBytes(storageState.limitBytes)} used</span>
                    </div>
                    <div
                      className="plan-usage-storage-meter"
                      role="img"
                      aria-label={`${storageState.percent}% of the storage allowance used`}
                    >
                      <div
                        className={`plan-usage-storage-meter-fill${storageState.over ? ' over' : storageState.nearly ? ' nearly' : ''}`}
                        style={{ width: `${Math.max(storageState.percent, 2)}%` }}
                      />
                    </div>
                    <div className="plan-usage-storage-categories">
                      <span className="plan-usage-storage-chip">📸 Job &amp; Lead Photos</span>
                      <span className="plan-usage-storage-chip">🌐 Website Images &amp; Video</span>
                      <span className="plan-usage-storage-chip">📄 Insurance &amp; Documents</span>
                    </div>
                    <p className="workspace-details-copy plan-usage-intro">
                      {storageState.objectCount === null
                        ? 'Job photos, lead photos, crew photos, website images and video, and insurance certificates.'
                        : `${storageState.objectCount.toLocaleString('en-US')} ${storageState.objectCount === 1 ? 'file' : 'files'} across job photos, lead photos, crew photos, website images and video, and insurance certificates.`}
                    </p>
                    {storageState.measuredAt ? (
                      <p className="plan-usage-fineprint">Measured {formatDate(storageState.measuredAt)}.</p>
                    ) : null}
                    {storageState.over ? (
                      <p className="plan-usage-note warning" role="status">
                        This workspace is over its storage allowance. Nothing has been deleted and nothing will be.
                        Remove files you no longer need to make room for new uploads.
                      </p>
                    ) : storageState.nearly ? (
                      <p className="plan-usage-note" role="status">
                        Storage is nearly full. Once it is full, new uploads are refused until room is made — existing
                        files are never removed.
                      </p>
                    ) : (
                      <StatusLine tone="healthy">Room to spare</StatusLine>
                    )}
                  </>
                ) : storageState.kind === 'unmeasured' ? (
                  <div className="plan-usage-unavailable" role="status">
                    <strong>Storage has not been measured yet.</strong>
                    <span>
                      {storageState.limitBytes === null
                        ? 'This workspace is not showing a storage allowance either. Nothing has been shown as zero.'
                        : `This workspace includes ${formatStorageBytes(storageState.limitBytes)}. The amount in use is measured on a schedule and has not run for this workspace yet.`}
                    </span>
                  </div>
                ) : (
                  <div className="plan-usage-unavailable" role="status">
                    <strong>{formatStorageBytes(storageState.bytesUsed)} stored.</strong>
                    <span>No storage allowance was returned for this workspace, so none has been guessed.</span>
                  </div>
                )}
              </details>
            ) : null}

            {overage ? <OverageCard overage={overage} selfServe={overageSelfServe} /> : null}

            {data.plan.kind === 'ready' && limits.length > 0 ? (
              <details
                className="plan-usage-limit-row workspace-fold"
                id="included-limits"
                open={capacityNeedsAttention}
              >
                <summary>
                  <span className="section-heading workspace-section-heading compact-heading">
                    <span className="eyebrow">Plan capacity</span>
                    <span className="workspace-fold-title"><SectionIcon name="capacity" />What you are using</span>
                  </span>
                  {capacitySummaryNote ? <em className="workspace-fold-note">{capacitySummaryNote}</em> : null}
                </summary>

                {capacity && capacity.rows.length > 0 ? (
                  <ul className="plan-usage-capacity-grid">
                    {capacity.rows.map((row) => (
                      <CapacityMeter key={row.key} row={row} />
                    ))}
                  </ul>
                ) : null}

                {officeTeam ? (
                  <div id="office-team" className="plan-usage-office-team-section">
                    <div className="plan-usage-office-team-header">
                      <h3>Office staff &amp; dashboard invitations</h3>
                      <p className="plan-usage-fineprint">
                        Invite staff to access your leads board, view incoming requests, and manage day-to-day operations.
                      </p>
                    </div>
                    <OfficeTeamSection team={officeTeam} />
                  </div>
                ) : null}

                <details className="plan-usage-limit-details">
                  <summary>Everything included with {data.plan.planName}</summary>
                  <dl className="plan-usage-limit-list">
                    {limits.map((row) => (
                      <div key={row.label}>
                        <dt>{row.label}</dt>
                        <dd>{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </details>

                {purchasedCapacitySubscriptions.length > 0 ? (
                  <PurchasedCapacityList subscriptions={purchasedCapacitySubscriptions} />
                ) : null}
              </details>
            ) : null}
          </div>
        </section>

        {data.plan.kind === 'ready' && showTopUpPurchase ? (
          <TopUpPurchaseCheckout
            planCode={data.plan.planCode}
            returnStatus={topUpCheckoutStatus}
          />
        ) : null}
      </div>

      {/* SUBVIEW 2: PLAN & SUBSCRIPTION */}
      <div className="plan-subview-panel" data-subview="plan" role="tabpanel">
        <section className="panel workspace-section-card" id="current-plan">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Current plan</p>
            <h2><SectionIcon name="plan" />Your LGQ plan</h2>
            <StatusLine tone={tone}>{planStatusWord(data.plan)}</StatusLine>
          </div>

          {data.plan.kind === 'ready' ? (
            <>
              <div className="plan-usage-plan-card">
                <div className="plan-usage-plan-name">
                  <span>{data.plan.planName}</span>
                  <strong>{planPrice(data.plan)}</strong>
                </div>
                <dl className="plan-usage-plan-facts">
                  <div id="platform-fee">
                    <dt>LGQ platform fee</dt>
                    <dd>{platformFeeLabel(data.plan.platformFeeBps)}</dd>
                  </div>
                  <div>
                    <dt>Billing status</dt>
                    <dd>{billingStatusLabel(data.plan.billingStatus)}</dd>
                  </div>
                  <div>
                    <dt>Usage schedule</dt>
                    <dd>
                      {data.plan.billingInterval === 'none'
                        ? 'One-time starter balances'
                        : data.plan.nextAllowanceResetAt
                          ? `Resets ${formatDate(data.plan.nextAllowanceResetAt)}`
                          : 'No reset scheduled'}
                    </dd>
                  </div>
                </dl>
              </div>
              <details className="plan-usage-limit-details plan-usage-fee-details">
                <summary>How fees work</summary>
                <p className="workspace-details-copy plan-usage-disclosure">
                  The LGQ fee applies to the eligible service subtotal collected through LGQ. Stripe processing
                  and payment-infrastructure costs are separate and paid directly by the contractor.
                </p>
              </details>

              {data.plan.planCode !== 'flex' && data.plan.platformFeeBps < 125 ? (
                <ProcessingVolumeRoiCalculator
                  planName={data.plan.planName}
                  platformFeeBps={data.plan.platformFeeBps}
                />
              ) : null}

              {data.plan.billingInterval === 'monthly' && data.plan.planCode !== 'flex' ? (
                <div className="plan-usage-annual-upsell">
                  <SettingsHashLink href="#change-plan" className="plan-usage-annual-link">
                    <span className="plan-usage-annual-tag">SAVE 10%–20%</span>
                    <span>Switch to Annual prepaid to save on software bills &rarr;</span>
                  </SettingsHashLink>
                </div>
              ) : null}
              {!data.plan.usesCurrentCatalog ? (
                <p className="plan-usage-note" role="status">
                  This workspace is pinned to pricing catalog {data.plan.catalogVersion}. Its saved entitlement
                  and fee are shown here; current public catalog prices are not substituted.
                </p>
              ) : null}
              {collectionNote(data.plan.billingStatus) ? (
                <p className="plan-usage-note warning" role="status">
                  {collectionNote(data.plan.billingStatus)}
                </p>
              ) : data.plan.entitlementState !== 'active' ? (
                <p className="plan-usage-note warning" role="status">
                  This workspace is currently {data.plan.entitlementState}. Contact support if that does not look right.
                </p>
              ) : null}
              {nextBand && data.plan.planCode !== 'enterprise' ? (
                <PlanFitBanner
                  planCode={data.plan.planCode}
                  nextPlanName={nextBand.planName}
                  thresholdLabel={`about $${ladderBandDollars(nextBand.fromAnnualBasisCents).toLocaleString('en-US')} a month`}
                  ctaHref={planFitCtaHref}
                  workingOut={describeCrossover(data.plan.planCode, nextBand.planCode, ladderCycle)}
                />
              ) : null}
              {canStartFirstSubscription && showSubscriptionCheckout ? (
                <BasePlanSubscriptionCheckout
                  embedded
                  initialPlanCode={planIntent?.planCode ?? null}
                  initialBillingInterval={planIntent?.billingInterval ?? null}
                />
              ) : null}
              {ladder ? (
                <details className="plan-usage-limit-details plan-usage-plan-fit-details" id="plan-fit">
                  <summary>Compare plan breakpoints</summary>
                  <ul className="plan-usage-ladder">
                    {ladder.map((band) => (
                      <li key={band.planCode} data-current={band.isCurrent ? 'true' : undefined}>
                        <span className="plan-usage-ladder-plan">
                          {band.planName}
                          {band.isCurrent ? <em> — your plan</em> : null}
                        </span>
                        <span className="plan-usage-ladder-band">{describeBand(band)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="plan-usage-fineprint">
                    Compared on {ladderCycle === 'annual' ? 'annual' : 'monthly'} billing using the
                    service subtotal the LGQ fee applies to. Tax, tips, refunds, Stripe processing,
                    add-ons, and extra seats are excluded.
                  </p>
                </details>
              ) : null}
            </>
          ) : (
            <div className="plan-usage-unavailable" role="status">
              <strong>Plan details are unavailable right now.</strong>
              <span>Nothing has been guessed or changed. Refresh in a moment, or contact support if this continues.</span>
            </div>
          )}
        </section>

        {planChange ? (
          <ChangePlanPanel
            currentPlanCode={planChange.currentPlanCode}
            currentBillingInterval={planChange.currentBillingInterval}
            currentPeriodEnd={planChange.currentPeriodEnd}
            pendingPlanCode={planChange.pendingPlanCode}
            pendingEffectiveAt={planChange.pendingEffectiveAt}
            options={planChange.options}
          />
        ) : null}

        {cancellable ? (
          <CancelSubscriptionPanel
            planName={cancellable.planName}
            currentPeriodEnd={cancellable.currentPeriodEnd}
            alreadyScheduled={cancellable.alreadyScheduled}
          />
        ) : null}
      </div>
    </>
  );
}
