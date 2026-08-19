import { formatUsdFromCents } from '@/lib/billing/catalog';
import type {
  PlanUsageLimits,
  WorkspacePlanRead,
  WorkspacePlanUsage,
} from '@/lib/billing/plan-usage';
import { formatStorageBytes, type WorkspaceStorageState } from '@/lib/billing/storage-usage';
import BasePlanSubscriptionCheckout from './BasePlanSubscriptionCheckout';
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

function billingStatusLabel(status: Extract<WorkspacePlanRead, { kind: 'ready' }>['billingStatus']): string {
  switch (status) {
    case 'past_due': return 'Past due';
    case 'trialing': return 'Trial';
    case 'free': return 'Free';
    default: return status.charAt(0).toUpperCase() + status.slice(1);
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

export default function PlanUsageSection({
  data,
  storage = null,
  showSubscriptionCheckout = false,
  showTopUpPurchase = false,
  topUpCheckoutStatus = null,
}: {
  data: WorkspacePlanUsage;
  storage?: WorkspaceStorageState | null;
  showSubscriptionCheckout?: boolean;
  showTopUpPurchase?: boolean;
  topUpCheckoutStatus?: 'success' | 'canceled' | null;
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
                        : 'Reset date unavailable'}
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
            {data.plan.entitlementState !== 'active' ? (
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
        <BasePlanSubscriptionCheckout />
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
