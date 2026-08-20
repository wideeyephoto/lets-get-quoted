import { formatUsdFromCents } from '@/lib/billing/catalog';
import type {
  PlanUsageLimits,
  WorkspacePlanRead,
  WorkspacePlanUsage,
} from '@/lib/billing/plan-usage';
import { formatStorageBytes, type WorkspaceStorageState } from '@/lib/billing/storage-usage';
import {
  describeOverageResource,
  formatOverageTotal,
  remainingCapMillicents,
  type OverageSummary,
} from '@/lib/billing/overage-summary';
import type { PlanIntent } from '@/lib/plan-intent';
import BasePlanSubscriptionCheckout from './BasePlanSubscriptionCheckout';
import CancelSubscriptionPanel from './CancelSubscriptionPanel';
import TopUpPurchaseCheckout from './TopUpPurchaseCheckout';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
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

function includedLimits(limits: PlanUsageLimits): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string } | null> = [
    limits.officeUsers === null ? null : { label: 'Office users', value: limits.officeUsers.toLocaleString('en-US') },
    limits.crewUsers === null ? null : { label: 'Crew users', value: limits.crewUsers.toLocaleString('en-US') },
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
    percent,
    over: storage.bytesUsed > storage.limitBytes,
    nearly: storage.bytesUsed <= storage.limitBytes && percent >= 80,
  };
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
function OverageCard({ overage }: { overage: OverageSummary }) {
  const remaining = remainingCapMillicents(overage);

  if (!overage.enabled) {
    return (
      <section className="panel workspace-section-card" id="overage">
        <h3>Extra usage</h3>
        <p className="usage-muted">
          Not switched on. When an allowance runs out, sends and drafts are refused rather
          than billed &mdash; nothing is ever charged past your plan without you turning this
          on and setting a limit.
        </p>
      </section>
    );
  }

  return (
    <section className="panel workspace-section-card" id="overage">
      <h3>Extra usage this period</h3>
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
              <span>{line.units.toLocaleString('en-US')}</span>
              <span>{formatOverageTotal(line.millicents)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="usage-fineprint">
        Charged after the period ends. Every figure here is what has already been used, not
        an estimate.
      </p>
    </section>
  );
}

export default function PlanUsageSection({
  data,
  storage = null,
  showSubscriptionCheckout = false,
  showTopUpPurchase = false,
  cancellable = null,
  topUpCheckoutStatus = null,
  overage,
  planIntent = null,
}: {
  data: WorkspacePlanUsage;
  storage?: WorkspaceStorageState | null;
  showSubscriptionCheckout?: boolean;
  showTopUpPurchase?: boolean;
  topUpCheckoutStatus?: 'success' | 'canceled' | null;
  overage: OverageSummary | null;
  // The plan chosen on /pricing before this workspace existed, already parsed.
  planIntent?: PlanIntent | null;
  // Present only when this workspace has a subscription there is still something
  // to cancel, and only when the cancellation flag is on.
  cancellable?: { planName: string; currentPeriodEnd: string | null; alreadyScheduled: boolean } | null;
}) {
  const storageState = storageView(storage);
  const limits = data.plan.kind === 'ready' ? includedLimits(data.plan.limits) : [];
  const canStartFirstSubscription = data.plan.kind === 'ready'
    && data.plan.planCode === 'flex'
    && data.plan.billingInterval === 'none'
    && data.plan.billingStatus === 'free'
    && data.plan.entitlementState === 'active';

  return (
    <>
      <section className="panel workspace-section-card" id="current-plan">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Current plan</p>
          <h2>Your LGQ plan</h2>
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
                        // The projector nulls this deliberately whenever billing
                        // is not being collected. "Unavailable" claimed a lookup
                        // had failed; nothing had failed, there is simply no
                        // reset scheduled, and the status above says why.
                        : 'No reset scheduled'}
                  </dd>
                </div>
              </dl>
            </div>
            <p className="workspace-details-copy plan-usage-disclosure">
              The LGQ fee applies to the eligible service subtotal collected through LGQ. Stripe processing
              and payment-infrastructure costs are separate and paid directly by the contractor.
            </p>
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
          </>
        ) : (
          <div className="plan-usage-unavailable" role="status">
            <strong>Plan details are unavailable right now.</strong>
            <span>Nothing has been guessed or changed. Refresh in a moment, or contact support if this continues.</span>
          </div>
        )}
      </section>

      {canStartFirstSubscription && showSubscriptionCheckout ? (
        <BasePlanSubscriptionCheckout
          initialPlanCode={planIntent?.planCode ?? null}
          initialBillingInterval={planIntent?.billingInterval ?? null}
        />
      ) : null}

      {cancellable ? (
        <CancelSubscriptionPanel
          planName={cancellable.planName}
          currentPeriodEnd={cancellable.currentPeriodEnd}
          alreadyScheduled={cancellable.alreadyScheduled}
        />
      ) : null}

      <section className="panel workspace-section-card" id="usage-balances">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Available now</p>
          <h2>Credit balances</h2>
        </div>
        <p className="workspace-details-copy plan-usage-intro">
          These are credits ready to use now. Plan-period credits and purchased credits can share one balance,
          so this is not presented as a monthly usage chart.
        </p>

        {data.balances.kind === 'ready' ? (
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
      </section>

      {storageState.kind !== 'hidden' ? (
        <section className="panel workspace-section-card" id="workspace-storage">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Files &amp; photos</p>
            <h2>Storage</h2>
          </div>

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
              <p className="workspace-details-copy plan-usage-intro">
                {storageState.objectCount === null
                  ? 'Job photos, lead photos, crew photos, website images and video, and insurance certificates.'
                  : `${storageState.objectCount.toLocaleString('en-US')} ${storageState.objectCount === 1 ? 'file' : 'files'} across job photos, lead photos, crew photos, website images and video, and insurance certificates.`}
              </p>
              {storageState.over ? (
                <p className="plan-usage-note warning" role="status">
                  This workspace is over its storage allowance. Nothing has been deleted and nothing will be.
                  Remove files you no longer need, or add storage, to make room for new uploads.
                </p>
              ) : storageState.nearly ? (
                <p className="plan-usage-note" role="status">
                  Storage is nearly full. Once it is full, new uploads are refused until room is made — existing
                  files are never removed.
                </p>
              ) : null}
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
        </section>
      ) : null}

      {/* After storage, before buying more: a contractor reading "you have run
          up $2.84 extra" should meet the top-up offer next, not before. */}
      {overage ? <OverageCard overage={overage} /> : null}

      {data.plan.kind === 'ready' && showTopUpPurchase ? (
        <TopUpPurchaseCheckout
          planCode={data.plan.planCode}
          returnStatus={topUpCheckoutStatus}
        />
      ) : null}

      {data.plan.kind === 'ready' && limits.length > 0 ? (
        <section className="panel workspace-section-card" id="included-limits">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Included capacity</p>
            <h2>Workspace limits</h2>
          </div>
          <dl className="plan-usage-limit-list">
            {limits.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </>
  );
}
