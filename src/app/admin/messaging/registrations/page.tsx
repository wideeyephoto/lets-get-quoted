import Link from 'next/link';

import { requireAdmin } from '@/lib/auth';
import { buildStandardContractorCampaignPayload } from '@/lib/messaging-contractor-campaign-template';
import {
  isProvisioningMutationEnabled,
  listMessagingNumberOperations,
  listMessagingRegistrationApplications,
  loadMessagingComplianceVerification,
  loadMessagingNumberPurchasePolicy,
  messagingNumberPurchaseConfirmation,
  messagingNumberPurchasePolicy,
  minutesUntilCampaignAssignment,
  signalWireMessagingLaneReadiness,
  signalWireProviderProvisioningReadiness,
  type MessagingRegistrationApplication,
  type SignalWireProvisioningReadinessReason,
} from '@/lib/messaging-number-provisioning';
import { staffCan } from '@/lib/staff';
import { trustedProviderCallbackOrigin } from '@/lib/app-origin';
import {
  assignMessagingCampaignAction,
  configureMessagingInboundAction,
  purchaseMessagingNumberAction,
  reconcileMessagingAssignmentAction,
  recordMessagingComplianceVerificationAction,
  resolveMessagingNumberOperationAction,
  reviewMessagingApplicationAction,
  searchMessagingNumberCandidateAction,
  setMessagingNumberSpendPolicyAction,
} from './actions';
import styles from '../../admin.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Messaging registrations' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function when(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('en-US') : 'Unknown';
}

function readinessCopy(reason: SignalWireProvisioningReadinessReason): string {
  const copy: Record<SignalWireProvisioningReadinessReason, string> = {
    invalid_account: 'The selected workspace identity is invalid.',
    callback_origin_untrusted: 'NEXT_PUBLIC_APP_URL is not a trusted bare production HTTPS origin.',
    delivery_worker_disabled: 'The durable SMS delivery worker is disabled.',
    provider_unavailable: 'The selected provider credentials or sender configuration are incomplete.',
    provider_lane_not_signalwire: 'The active outbound SMS provider is not SignalWire.',
    signing_key_missing: 'The separate SignalWire webhook signing key is missing.',
    outbound_suppressed: 'Outbound SMS is globally suppressed in this environment.',
    outside_canary: 'This workspace is outside the outbound SMS canary set.',
    contractor_lane_disabled: 'The contractor-dedicated customer messaging lane is disabled.',
  };
  return copy[reason];
}

type StageKey = 'intake' | 'brand_campaign' | 'number_inbound' | 'assignment' | 'active';

const STAGES = [
  { step: 1, key: 'intake' as StageKey, title: '1. Review & Tax', subtitle: 'Identity & EIN' },
  { step: 2, key: 'brand_campaign' as StageKey, title: '2. Brand & Campaign', subtitle: 'TCR Downstream' },
  { step: 3, key: 'number_inbound' as StageKey, title: '3. Number & Webhook', subtitle: 'Purchase & Inbound' },
  { step: 4, key: 'assignment' as StageKey, title: '4. 10DLC Assignment', subtitle: 'Order & Cooldown' },
  { step: 5, key: 'active' as StageKey, title: '5. Live & Canaries', subtitle: '2-Way Activated' },
] as const;

function getApplicationStage(app: MessagingRegistrationApplication | null): {
  key: StageKey;
  stepNumber: number;
  label: string;
  badgeTone: 'ok' | 'warn' | 'err' | 'info';
} {
  if (!app) return { key: 'intake', stepNumber: 1, label: 'Not started', badgeTone: 'info' };
  if (app.status === 'rejected') {
    return { key: 'intake', stepNumber: 1, label: 'Application Rejected', badgeTone: 'err' };
  }
  if (app.status === 'action_required') {
    return { key: 'intake', stepNumber: 1, label: 'Action Required', badgeTone: 'warn' };
  }
  if (app.status === 'submitted' || app.status === 'under_review') {
    return { key: 'intake', stepNumber: 1, label: 'Intake Under Review', badgeTone: 'info' };
  }
  if (app.status === 'approved') {
    if (!app.providerBrandId || !app.providerCampaignId || app.providerCampaignState !== 'active') {
      return { key: 'brand_campaign', stepNumber: 2, label: 'Brand & Campaign Vetting', badgeTone: 'info' };
    }
    if (!app.providerNumberId || !app.inboundConfiguredAt) {
      return { key: 'number_inbound', stepNumber: 3, label: 'Number & Webhook Setup', badgeTone: 'info' };
    }
    if (!app.assignmentOrderId || app.providerAssignmentState !== 'assigned') {
      return { key: 'assignment', stepNumber: 4, label: 'Campaign Assignment Pending', badgeTone: 'warn' };
    }
    return { key: 'active', stepNumber: 5, label: '2-Way Messaging Active', badgeTone: 'ok' };
  }
  return { key: 'intake', stepNumber: 1, label: app.status.replace(/_/g, ' '), badgeTone: 'info' };
}

export default async function MessagingRegistrationsPage({
  searchParams,
}: {
  searchParams: { application?: string; filter?: string; done?: string; error?: string; correlation?: string };
}) {
  const ctx = await requireAdmin();
  const mayManage = staffCan(ctx.staff, 'ops.manage');
  const allApplications = await listMessagingRegistrationApplications(ctx.admin);

  const activeFilter = searchParams.filter ?? 'all';
  const applications = allApplications.filter((app) => {
    if (activeFilter === 'review') return ['submitted', 'under_review'].includes(app.status);
    if (activeFilter === 'action') return app.status === 'action_required';
    if (activeFilter === 'provisioning') return app.status === 'approved' && app.providerAssignmentState !== 'assigned';
    if (activeFilter === 'active') return app.status === 'approved' && app.providerAssignmentState === 'assigned';
    if (activeFilter === 'rejected') return app.status === 'rejected';
    return true;
  });

  const selected = (searchParams.application
    ? allApplications.find((app) => app.id === searchParams.application)
    : applications[0]) ?? allApplications[0] ?? null;

  const [operations, complianceVerification, purchasePolicy] = selected
    ? await Promise.all([
      listMessagingNumberOperations(ctx.admin, selected.id),
      loadMessagingComplianceVerification(selected.id, ctx.admin),
      loadMessagingNumberPurchasePolicy(ctx.admin),
    ])
    : [[], null, await loadMessagingNumberPurchasePolicy(ctx.admin)] as const;

  const indeterminate = operations.filter((operation) => operation.state === 'indeterminate');
  const gateEnabled = isProvisioningMutationEnabled();
  const proposedPolicy = messagingNumberPurchasePolicy();
  const providerProvisioningReadiness = selected
    ? signalWireProviderProvisioningReadiness(selected.accountId)
    : null;
  const deliveryLaneReadiness = selected
    ? signalWireMessagingLaneReadiness(selected.accountId)
    : null;
  const mutationsReady = gateEnabled && providerProvisioningReadiness?.kind === 'ready';
  const credentialsPresent = Boolean(
    process.env.SIGNALWIRE_SPACE_URL
    && process.env.SIGNALWIRE_PROJECT_ID
    && process.env.SIGNALWIRE_API_TOKEN
    && process.env.SIGNALWIRE_SIGNING_KEY,
  );
  const callbackOrigin = trustedProviderCallbackOrigin();
  const productionInboundTarget = callbackOrigin
    ? `${callbackOrigin}/api/sms/inbound`
    : null;
  const candidateValid = selected?.candidateNumber && selected.candidateExpiresAt
    ? new Date(selected.candidateExpiresAt).getTime() > Date.now()
    : false;
  const assignmentWait = selected ? minutesUntilCampaignAssignment(selected.purchasedAt) : null;
  const reviewable = selected
    ? ['submitted', 'under_review', 'action_required', 'rejected'].includes(selected.status)
      && !selected.providerBrandId
      && !selected.providerCampaignId
      && !selected.providerNumberId
    : false;
  const complianceCurrent = Boolean(
    selected
    && complianceVerification
    && complianceVerification.accountId === selected.accountId
    && complianceVerification.applicationRevision === selected.revision,
  );
  const errorCorrelation = searchParams.error === '1' && UUID.test(searchParams.correlation ?? '')
    ? searchParams.correlation!.toLowerCase()
    : null;

  const currentStage = getApplicationStage(selected);

  const standardCampaignBlueprint = selected ? buildStandardContractorCampaignPayload({
    legalBusinessName: selected.legalBusinessName,
    dbaName: selected.dbaName,
    websiteUrl: selected.websiteUrl,
    supportEmail: selected.messagingSupportEmail,
    supportPhone: selected.messagingSupportPhone,
  }) : null;

  const counts = {
    all: allApplications.length,
    review: allApplications.filter((a) => ['submitted', 'under_review'].includes(a.status)).length,
    action: allApplications.filter((a) => a.status === 'action_required').length,
    provisioning: allApplications.filter((a) => a.status === 'approved' && a.providerAssignmentState !== 'assigned').length,
    active: allApplications.filter((a) => a.status === 'approved' && a.providerAssignmentState === 'assigned').length,
    rejected: allApplications.filter((a) => a.status === 'rejected').length,
  };

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Messaging operations</p>
        <h1 className={styles.title}>Dedicated-number registrations</h1>
        <p className={styles.lead}>
          Multi-state carrier registration and number lifecycle console. Vet downstream businesses, configure TCR Brands & Campaigns,
          purchase SignalWire numbers, and activate 2-way messaging and AI Voice after live 10DLC carrier assignment verification.
          Dedicated-number allowance remains zero and unpriced; this private beta is not an entitlement or a billable add-on.
        </p>
        <p><Link href="/admin/messaging">← Messaging health & operations</Link></p>
      </header>

      {searchParams.done === '1' ? (
        <div className={`${styles.banner} ${styles.ok}`}>Operation completed. Review the durable state below.</div>
      ) : null}
      {searchParams.error === '1' ? (
        <div className={`${styles.banner} ${styles.err}`}>
          Operation did not complete. Review the current durable state and server logs before retrying. Error reference:{' '}
          <code>{errorCorrelation ?? 'unavailable'}</code>.
        </div>
      ) : null}
      {!gateEnabled ? (
        <div className={`${styles.banner} ${styles.warn}`}>
          Spend gate is dark. Search and review are available, but purchase, webhook update, and campaign assignment fail closed until
          <code> LGQ_SIGNALWIRE_PROVISIONING_ENABLED=1</code> is deliberately configured.
        </div>
      ) : null}
      {!credentialsPresent ? (
        <div className={`${styles.banner} ${styles.err}`}>
          SignalWire provisioning credentials are incomplete. Values remain server-only and are never displayed here.
        </div>
      ) : null}
      {providerProvisioningReadiness && providerProvisioningReadiness.kind !== 'ready' ? (
        <div className={`${styles.banner} ${styles.err}`}>
          Dedicated-number carrier mutations are blocked: {readinessCopy(providerProvisioningReadiness.reason)}{' '}
          No provider client is constructed while this check fails.
        </div>
      ) : null}
      {providerProvisioningReadiness?.kind === 'ready'
          && deliveryLaneReadiness
          && deliveryLaneReadiness.kind !== 'ready' ? (
        <div className={`${styles.banner} ${styles.warn}`}>
          Carrier provisioning may continue, but customer texting remains dark: {readinessCopy(deliveryLaneReadiness.reason)}{' '}
          An approved provider assignment cannot send traffic until every delivery-lane gate is released.
        </div>
      ) : null}
      {!purchasePolicy ? (
        <div className={`${styles.banner} ${styles.warn}`}>
          Carrier purchase is refused because LGQ has no authoritative database price and aggregate monthly spend ceiling.
          Environment values are only a proposal; no purchase button can authorize an unknown or unpersisted price.
        </div>
      ) : null}

      <section className={styles.panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <h2 className={styles.panelTitle} style={{ margin: 0 }}>Applications ({allApplications.length})</h2>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: `All (${counts.all})` },
              { id: 'review', label: `Needs Review (${counts.review})` },
              { id: 'action', label: `Action Required (${counts.action})` },
              { id: 'provisioning', label: `In Provisioning (${counts.provisioning})` },
              { id: 'active', label: `Active (${counts.active})` },
              { id: 'rejected', label: `Rejected (${counts.rejected})` },
            ].map((tab) => (
              <Link
                key={tab.id}
                href={`/admin/messaging/registrations?filter=${tab.id}${selected ? `&application=${selected.id}` : ''}`}
                style={{
                  fontSize: '0.74rem',
                  fontWeight: activeFilter === tab.id ? 700 : 500,
                  padding: '0.25rem 0.55rem',
                  borderRadius: '999px',
                  background: activeFilter === tab.id ? 'rgba(255, 122, 33, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${activeFilter === tab.id ? 'rgba(255, 122, 33, 0.5)' : 'rgba(255, 255, 255, 0.1)'}`,
                  color: activeFilter === tab.id ? '#ffffff' : 'rgba(247, 245, 239, 0.7)',
                  textDecoration: 'none',
                }}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Business</th><th>Status</th><th>Lifecycle Stage</th><th>Area</th><th>Number</th><th>Updated</th></tr></thead>
            <tbody>
              {applications.length ? applications.map((application) => {
                const stage = getApplicationStage(application);
                const isCurrentRow = selected?.id === application.id;
                return (
                  <tr key={application.id} style={isCurrentRow ? { background: 'rgba(255, 122, 33, 0.08)' } : undefined}>
                    <td><Link className={styles.rowLink} href={`/admin/messaging/registrations?application=${application.id}&filter=${activeFilter}`}>{application.businessName || application.legalBusinessName}</Link></td>
                    <td><span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{application.status.replace(/_/g, ' ')}</span></td>
                    <td>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        padding: '0.15rem 0.45rem',
                        borderRadius: '0.35rem',
                        background: stage.badgeTone === 'ok' ? 'rgba(52, 211, 153, 0.15)' : stage.badgeTone === 'warn' ? 'rgba(245, 158, 11, 0.15)' : stage.badgeTone === 'err' ? 'rgba(248, 113, 113, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                        color: stage.badgeTone === 'ok' ? '#34d399' : stage.badgeTone === 'warn' ? '#fbbf24' : stage.badgeTone === 'err' ? '#f87171' : '#60a5fa',
                      }}>
                        {stage.label}
                      </span>
                    </td>
                    <td>{application.desiredAreaCode} / {application.region}</td>
                    <td><code>{application.purchasedNumber ?? application.candidateNumber ?? '—'}</code></td>
                    <td>{when(application.updatedAt)}</td>
                  </tr>
                );
              }) : <tr><td colSpan={6} className={styles.muted}>No application matches the selected filter.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? (
        <>
          {/* Multi-State Lifecycle Stepper */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '0.6rem',
            margin: '1.25rem 0',
            padding: '1rem',
            borderRadius: '0.75rem',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}>
            {STAGES.map((s) => {
              const isCurrent = currentStage.stepNumber === s.step;
              const isDone = currentStage.stepNumber > s.step;
              return (
                <div key={s.step} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.5rem',
                  background: isCurrent ? 'rgba(255, 122, 33, 0.15)' : isDone ? 'rgba(52, 211, 153, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                  border: `1px solid ${isCurrent ? 'rgba(255, 122, 33, 0.4)' : isDone ? 'rgba(52, 211, 153, 0.3)' : 'rgba(255, 255, 255, 0.05)'}`,
                }}>
                  <span style={{
                    width: '1.5rem',
                    height: '1.5rem',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    background: isCurrent ? 'var(--accent, #ff7a21)' : isDone ? '#34d399' : 'rgba(255, 255, 255, 0.1)',
                    color: isCurrent || isDone ? '#06131f' : 'inherit',
                  }}>{isDone ? '✓' : s.step}</span>
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: isCurrent ? 'var(--text, #f7f5ef)' : isDone ? '#34d399' : 'rgba(247, 245, 239, 0.6)' }}>{s.title}</div>
                    <div style={{ fontSize: '0.65rem', color: 'rgba(247, 245, 239, 0.45)' }}>{s.subtitle}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles.detailGrid} style={{ marginTop: '1rem' }}>
            <div>
              {/* Stage 1 Detail: Application Data */}
              <section className={styles.panel}>
                <h2 className={styles.panelTitle}>Stage 1: Business Identity & Application Data</h2>
                <dl className={styles.kv}>
                  <dt>Workspace</dt><dd>{selected.businessName ?? '—'} · <code>{selected.accountId}</code></dd>
                  <dt>Legal / DBA</dt><dd>{selected.legalBusinessName}{selected.dbaName ? ` / ${selected.dbaName}` : ''}</dd>
                  <dt>Type</dt><dd>{selected.businessType.replace(/_/g, ' ')}</dd>
                  <dt>Contact</dt><dd>{selected.businessEmail} · {selected.businessPhone}</dd>
                  <dt>Authorized contact</dt><dd>{selected.authorizedContactName}, {selected.authorizedContactTitle}<br />{selected.authorizedContactEmail} · {selected.authorizedContactPhone}</dd>
                  <dt>HELP / STOP support</dt><dd>{selected.messagingSupportEmail} · {selected.messagingSupportPhone}</dd>
                  <dt>Address</dt><dd>{selected.addressLine1}{selected.addressLine2 ? `, ${selected.addressLine2}` : ''}, {selected.city}, {selected.region} {selected.postalCode}</dd>
                  <dt>Website</dt><dd><a href={selected.websiteUrl} target="_blank" rel="noreferrer">{selected.websiteUrl}</a></dd>
                  <dt>Use case</dt><dd>{selected.messagingUseCase}</dd>
                  <dt>Monthly estimate</dt><dd>{selected.estimatedMonthlyMessages.toLocaleString()} messages</dd>
                  <dt>Opt-in description</dt><dd>{selected.optInDescription}</dd>
                  <dt>Opt-in evidence</dt><dd><a href={selected.optInEvidenceUrl} target="_blank" rel="noreferrer">Open evidence link</a></dd>
                  <dt>Policies</dt><dd><a href={selected.privacyPolicyUrl} target="_blank" rel="noreferrer">Privacy Policy</a> · <a href={selected.termsUrl} target="_blank" rel="noreferrer">Terms of Service</a></dd>
                </dl>
                <h3 style={{ marginTop: '1rem' }}>Sample messages</h3>
                <ol>{selected.sampleMessages.map((message) => <li key={message}>{message}</li>)}</ol>
              </section>

              {/* Operations Log */}
              <section className={styles.panel}>
                <h2 className={styles.panelTitle}>Durable provider operations</h2>
                {indeterminate.length ? (
                  <div className={`${styles.banner} ${styles.err}`}>
                    {indeterminate.length} operation(s) have an indeterminate post-request outcome. Do not retry or advance automatically;
                    reconcile in SignalWire and the database first.
                  </div>
                ) : null}
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead><tr><th>Stage</th><th>State</th><th>Attempts</th><th>Provider object</th><th>Error</th><th>Updated</th></tr></thead>
                    <tbody>
                      {operations.length ? operations.map((operation) => (
                        <tr key={operation.id}>
                          <td>{operation.type.replace(/_/g, ' ')}</td><td>{operation.state}</td><td>{operation.attemptCount}</td>
                          <td><code>{operation.providerObjectId ?? '—'}</code></td>
                          <td>{operation.errorCode ?? '—'}{operation.errorDetail ? <div className={styles.muted}>{operation.errorDetail}</div> : null}</td>
                          <td>{when(operation.updatedAt)}</td>
                        </tr>
                      )) : <tr><td colSpan={6} className={styles.muted}>No provider mutation has been claimed.</td></tr>}
                    </tbody>
                  </table>
                </div>
                {mayManage && indeterminate.length ? (
                  <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
                    <h3>Quarantined-operation recovery</h3>
                    <p className={styles.muted}>
                      Inspect SignalWire first. “Confirmed absent” records that no provider object exists; “confirmed succeeded” performs
                      a read-only provider lookup and imports that exact object. Neither path issues a replacement purchase or update.
                    </p>
                    {indeterminate.map((operation) => (
                      <form key={operation.id} action={resolveMessagingNumberOperationAction} style={{ display: 'grid', gap: '.55rem' }}>
                        <input type="hidden" name="applicationId" value={selected.id} />
                        <input type="hidden" name="operationId" value={operation.id} />
                        <strong>{operation.type.replace(/_/g, ' ')} · <code>{operation.id}</code></strong>
                        <label>Verified provider outcome<select className={styles.input} name="resolution" required>
                          <option value="confirmed_absent">Confirmed absent — permit deliberate retry</option>
                          <option value="confirmed_succeeded">Confirmed succeeded — import existing object</option>
                        </select></label>
                        <label>SignalWire object UUID (required for import)<input className={styles.input} name="providerObjectId" defaultValue={operation.providerObjectId ?? ''} /></label>
                        <label>Exact confirmation<input className={styles.input} name="confirmation" autoComplete="off" required /></label>
                        <p className={styles.muted}>
                          Type <code>ABSENT {operation.id}</code>, or <code>IMPORT {operation.id} &lt;provider-object-uuid&gt;</code>.
                        </p>
                        <button className="btn secondary" type="submit" disabled={!mutationsReady}>Resolve quarantined operation</button>
                      </form>
                    ))}
                  </div>
                ) : null}
              </section>
            </div>

            <div>
              {/* Stage 1: Tax Identity Verification */}
              <section className={styles.panel}>
                <h2 className={styles.panelTitle}>Stage 1: Restricted Tax Identity Verification</h2>
                <p>
                  LGQ intentionally never stores a full EIN in the owner-readable application. Verify it out of band, then retain only
                  the last four digits and a nonsecret provider or case reference in service-only storage. Every edit requires MFA and is audited.
                </p>
                {complianceVerification ? (
                  <dl className={styles.kv}>
                    <dt>Status</dt><dd>{complianceCurrent ? 'Current for this revision' : `Stale — verified revision ${complianceVerification.applicationRevision}`}</dd>
                    <dt>EIN retained</dt><dd>•••••{complianceVerification.einLastFour}</dd>
                    <dt>Reference</dt><dd><code>{complianceVerification.verificationReference}</code></dd>
                    <dt>Verified</dt><dd>{when(complianceVerification.verifiedAt)} by {complianceVerification.verifiedBy}</dd>
                  </dl>
                ) : <p className={styles.muted}>No tax-identity verification is recorded. Approval will fail closed.</p>}
                {mayManage && reviewable ? (
                  <form action={recordMessagingComplianceVerificationAction} style={{ display: 'grid', gap: '.7rem', marginTop: '1rem' }}>
                    <input type="hidden" name="applicationId" value={selected.id} />
                    <label>
                      EIN last four only
                      <input className={styles.input} name="einLastFour" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off" required />
                    </label>
                    <label>
                      Nonsecret verification reference
                      <input className={styles.input} name="verificationReference" maxLength={255} placeholder="SignalWire/TCR case or internal verification ID — never the EIN" required />
                    </label>
                    <button className="btn secondary" type="submit">Record verification for revision {selected.revision}</button>
                  </form>
                ) : null}
              </section>

              {/* Stage 2: Brand & Campaign Review */}
              <section className={styles.panel}>
                <h2 className={styles.panelTitle}>Stage 2: Downstream TCR Brand & Campaign Vetting</h2>
                <dl className={styles.kv}>
                  <dt>Provider IDs</dt><dd>Brand <code>{selected.providerBrandId ?? '—'}</code><br />Campaign <code>{selected.providerCampaignId ?? '—'}</code></dd>
                  <dt>Carrier verification</dt><dd>
                    Brand {selected.providerBrandState ?? 'unverified'} · campaign {selected.providerCampaignState ?? 'unverified'}
                    {selected.providerCampaignUseCase ? ` · ${selected.providerCampaignUseCase}` : ''}<br />
                    checked {when(selected.providerVerifiedAt)}
                  </dd>
                </dl>
                {mayManage && reviewable ? (
                  <form action={reviewMessagingApplicationAction} style={{ display: 'grid', gap: '.7rem', marginTop: '1rem' }}>
                    <input type="hidden" name="applicationId" value={selected.id} />
                    <label>Decision<select className={styles.input} name="decision" defaultValue={selected.status === 'submitted' ? 'under_review' : selected.status}>
                      <option value="under_review">Under review</option><option value="action_required">Action required</option>
                      <option value="approved" disabled={!complianceCurrent || !mutationsReady}>Approved{complianceCurrent && mutationsReady ? '' : ' — tax and provider-provisioning readiness required'}</option><option value="rejected">Rejected</option>
                    </select></label>
                    <label>Review detail<textarea className={styles.input} name="detail" defaultValue={selected.statusDetail ?? ''} rows={4} /></label>
                    <label>SignalWire downstream brand UUID<input className={styles.input} name="providerBrandId" defaultValue={selected.providerBrandId ?? ''} /></label>
                    <label>SignalWire downstream campaign UUID<input className={styles.input} name="providerCampaignId" defaultValue={selected.providerCampaignId ?? ''} /></label>
                    <label>Approval confirmation<input className={styles.input} name="confirmation" autoComplete="off" placeholder={`APPROVE ${selected.id}`} /></label>
                    <p className={styles.muted}>Approval performs live, read-only checks that both carrier states are complete and the campaign belongs to the exact matching brand, legal business, DBA, website, and verified EIN suffix.</p>
                    {!complianceCurrent ? <p className={styles.muted}>Approval is unavailable until tax identity is verified for revision {selected.revision}.</p> : null}
                    <button className="btn secondary" type="submit">Save review decision</button>
                  </form>
                ) : <p className={styles.muted}>{mayManage ? 'The application is past the initial review stage.' : 'Read-only. Operations or super-admin access is required.'}</p>}

                {standardCampaignBlueprint ? (
                  <div style={{ marginTop: '1.25rem', padding: '0.85rem', borderRadius: '0.5rem', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.82rem', color: 'var(--accent, #ff7a21)' }}>Standard Contractor TCR Campaign Blueprint</h3>
                    <p className={styles.muted} style={{ fontSize: '0.74rem', marginBottom: '0.6rem' }}>
                      Canonical non-marketing Customer Operations template parameters for SignalWire / TCR registration:
                    </p>
                    <dl className={styles.kv} style={{ fontSize: '0.76rem' }}>
                      <dt>Use Case / Vertical</dt><dd><code>{standardCampaignBlueprint.useCase}</code> / <code>{standardCampaignBlueprint.vertical}</code></dd>
                      <dt>Campaign Description</dt><dd>{standardCampaignBlueprint.description}</dd>
                      <dt>Opt-In Flow</dt><dd>{standardCampaignBlueprint.optInDescription}</dd>
                      <dt>Help / Stop Messages</dt><dd>{standardCampaignBlueprint.helpMessage}<br />{standardCampaignBlueprint.optOutMessage}</dd>
                    </dl>
                  </div>
                ) : null}
              </section>

              {/* Stage 3: Number Selection & Spend Policy */}
              {mayManage ? (
                <section className={styles.panel}>
                  <h2 className={styles.panelTitle}>Stage 3: Authoritative Carrier Spend Policy</h2>
                  <p>
                    This database policy—not environment configuration—is snapshotted into every purchase claim and enforced under one
                    database lock. This ceiling authorizes carrier spend only and enforces authoritative spending limits.
                  </p>
                  {purchasePolicy ? (
                    <p>Revision {purchasePolicy.revision}: <strong>{purchasePolicy.monthlyPriceLabel}</strong> per number, aggregate ceiling <strong>{purchasePolicy.monthlySpendCeilingLabel}</strong>. Updated {when(purchasePolicy.updatedAt)}.</p>
                  ) : null}
                  <form action={setMessagingNumberSpendPolicyAction} style={{ display: 'grid', gap: '.55rem' }}>
                    <input type="hidden" name="applicationId" value={selected.id} />
                    <label>Monthly unit price (whole cents)<input className={styles.input} name="monthlyPriceCents" inputMode="numeric" pattern="[1-9][0-9]*" defaultValue={purchasePolicy?.monthlyPriceCents ?? proposedPolicy?.monthlyPriceCents ?? ''} required /></label>
                    <label>Aggregate monthly ceiling (whole cents)<input className={styles.input} name="monthlySpendCeilingCents" inputMode="numeric" pattern="[1-9][0-9]*" defaultValue={purchasePolicy?.monthlySpendCeilingCents ?? proposedPolicy?.monthlySpendCeilingCents ?? ''} required /></label>
                    <label>Exact confirmation<input className={styles.input} name="confirmation" autoComplete="off" required /></label>
                    <p className={styles.muted}>For 50 cents and a $50 ceiling, type <code>SET SIGNALWIRE POLICY USD 0.50/MO LIMIT USD 50.00/MO</code>. The server derives the required phrase from the entered whole-cent values.</p>
                    <button className="btn secondary" type="submit" disabled={!mutationsReady}>Set spend policy</button>
                  </form>
                </section>
              ) : null}

              {/* Stage 3 Action: Number Selection & Purchase */}
              {mayManage && selected.status === 'approved' && !selected.providerNumberId && !indeterminate.length ? (
                <section className={styles.panel}>
                  <h2 className={styles.panelTitle}>Stage 3: Dedicated Number Purchase</h2>
                  <p>Search {selected.desiredAreaCode} in {selected.region}. Search writes a 15-minute candidate only and cannot purchase.</p>
                  <form action={searchMessagingNumberCandidateAction}><input type="hidden" name="applicationId" value={selected.id} /><button className="btn secondary" type="submit">Refresh candidate</button></form>
                  {candidateValid && selected.candidateNumber && purchasePolicy ? (
                    <form action={purchaseMessagingNumberAction} style={{ display: 'grid', gap: '.55rem', marginTop: '1rem' }}>
                      <input type="hidden" name="applicationId" value={selected.id} />
                      <p>
                        Candidate: <code>{selected.candidateNumber}</code>. Configured carrier price: <strong>{purchasePolicy.monthlyPriceLabel}</strong>.
                        Aggregate dedicated-number ceiling: <strong>{purchasePolicy.monthlySpendCeilingLabel}</strong>. This is the first action that can incur carrier cost.
                      </p>
                      <label>Type <code>{messagingNumberPurchaseConfirmation(selected.candidateNumber, purchasePolicy)}</code><input className={styles.input} name="confirmation" autoComplete="off" required /></label>
                      <button className="btn primary" type="submit" disabled={!mutationsReady}>Purchase this number</button>
                    </form>
                  ) : candidateValid && selected.candidateNumber
                    ? <p className={styles.muted}>Purchase is refused until the carrier price and aggregate spend ceiling are configured.</p>
                    : selected.candidateNumber ? <p className={styles.muted}>The previous candidate expired. Refresh before purchasing.</p> : null}
                </section>
              ) : null}

              {/* Stage 3 Action: Configure Inbound Webhook */}
              {mayManage && selected.providerNumberId && !selected.inboundConfiguredAt && !indeterminate.length ? (
                <section className={styles.panel}>
                  <h2 className={styles.panelTitle}>Stage 3: Configure Inbound Webhook</h2>
                  <p>This requires an exact POST LaML webhook match at <code>{productionInboundTarget ?? 'NEXT_PUBLIC_APP_URL is missing'}</code>. Any other host or path fails closed.</p>
                  <form action={configureMessagingInboundAction} style={{ display: 'grid', gap: '.55rem' }}>
                    <input type="hidden" name="applicationId" value={selected.id} />
                    <label>Type <code>CONFIGURE {selected.purchasedNumber}</code><input className={styles.input} name="confirmation" autoComplete="off" required /></label>
                    <button className="btn primary" type="submit" disabled={!mutationsReady || !productionInboundTarget}>Configure inbound webhook</button>
                  </form>
                </section>
              ) : null}

              {/* Stage 4 Action: Assign Campaign */}
              {mayManage && selected.inboundConfiguredAt && !selected.assignmentOrderId && !indeterminate.length ? (
                <section className={styles.panel}>
                  <h2 className={styles.panelTitle}>Stage 4: Assign Campaign</h2>
                  {assignmentWait && assignmentWait > 0 ? (
                    <p>Wait about {assignmentWait} more minute(s). SignalWire asked LGQ to allow one hour after purchase for messaging provisioning.</p>
                  ) : (
                    <form action={assignMessagingCampaignAction} style={{ display: 'grid', gap: '.55rem' }}>
                      <input type="hidden" name="applicationId" value={selected.id} />
                      <label>Type <code>ASSIGN {selected.purchasedNumber}</code><input className={styles.input} name="confirmation" autoComplete="off" required /></label>
                      <button className="btn primary" type="submit" disabled={!mutationsReady}>Verify campaign and create assignment order</button>
                    </form>
                  )}
                </section>
              ) : null}

              {/* Stage 4 Action: Reconcile Individual Assignment */}
              {mayManage && selected.assignmentOrderId ? (
                <section className={styles.panel}>
                  <h2 className={styles.panelTitle}>Stage 4: Verify Individual Number Assignment</h2>
                  <p>Order <code>{selected.assignmentOrderId}</code> is not activation proof. LGQ reads the individual number assignment.</p>
                  <dl className={styles.kv}>
                    <dt>Assignment State</dt><dd>{selected.providerAssignmentState ?? 'not started'}</dd>
                    <dt>Last Checked</dt><dd>{when(selected.assignmentCheckedAt)}</dd>
                    <dt>Purchased Number</dt><dd><code>{selected.purchasedNumber ?? '—'}</code></dd>
                  </dl>
                  <form action={reconcileMessagingAssignmentAction} style={{ display: 'grid', gap: '.55rem', marginTop: '1rem' }}>
                    <input type="hidden" name="applicationId" value={selected.id} />
                    <label>Type <code>RECONCILE {selected.purchasedNumber}</code><input className={styles.input} name="confirmation" autoComplete="off" required /></label>
                    <button className="btn secondary" type="submit" disabled={!mutationsReady}>Verify live campaign, assignment, SMS capability, and exact POST webhook</button>
                  </form>
                </section>
              ) : null}

              {/* Stage 5: Live Messaging & Optional Voice */}
              {selected.providerAssignmentState === 'assigned' ? (
                <section className={styles.panel}>
                  <h2 className={styles.panelTitle}>Stage 5: Live Messaging & Voice Status</h2>
                  <div className={`${styles.banner} ${styles.ok}`}>
                    <strong>2-Way Business Texting is Activated</strong> for this contractor.
                  </div>
                  <dl className={styles.kv}>
                    <dt>Dedicated Number</dt><dd><code>{selected.purchasedNumber}</code></dd>
                    <dt>Carrier Brand / Campaign</dt><dd><code>{selected.providerBrandId}</code> / <code>{selected.providerCampaignId}</code></dd>
                    <dt>Assignment Status</dt><dd>Assigned & Verified ({when(selected.assignmentCheckedAt)})</dd>
                    <dt>Inbound Routing</dt><dd>{selected.inboundWebhookUrl ?? 'Configured'}</dd>
                  </dl>
                </section>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
