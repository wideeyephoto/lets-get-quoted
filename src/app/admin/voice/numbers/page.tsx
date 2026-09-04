import Link from 'next/link';

import { requireAdmin } from '@/lib/auth';
import { trustedProviderCallbackOrigin } from '@/lib/app-origin';
import { normalizeUsPhone } from '@/lib/phone';
import { staffCan } from '@/lib/staff';
import {
  voiceNumberProvisioningMutationEnabled,
  voiceNumberRecoveryEnabled,
} from '@/lib/voice/number-provisioning';
import {
  authorizeVoiceNumberPurchaseAction,
  configureVoiceNumberAction,
  purchaseVoiceNumberAction,
  recordVoiceNumberCandidateObservationAction,
  reconcileVoiceNumberAction,
  releaseVoiceNumberAction,
  retryVoiceNumberOperationAction,
  searchVoiceNumberCandidateAction,
  setVoiceNumberSpendPolicyAction,
} from './actions';
import styles from '../../admin.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI Voice number provisioning' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AREA_CODE = /^[2-9][0-9]{2}$/;

type AccountRow = Readonly<{
  id: string;
  business_name: string | null;
  account_number: string | null;
  call_tracking_number: string | null;
}>;

type PolicyRow = Readonly<{
  provider: string;
  currency: string;
  monthly_unit_price_cents: number;
  aggregate_monthly_ceiling_cents: number;
  purchase_enabled: boolean;
  revision: number;
  updated_at: string;
}>;

type InventoryRow = Readonly<{
  id: string;
  provider_number_id: string;
  e164_number: string;
  lifecycle_state: string;
  voice_capable: boolean;
  call_handler: string | null;
  call_request_url: string | null;
  call_request_method: string | null;
  call_status_callback_url: string | null;
  call_status_callback_method: string | null;
  provider_verified_at: string | null;
  last_provider_sync_at: string | null;
  activated_at: string | null;
}>;

type AuthorizationRow = Readonly<{
  id: string;
  candidate_observation_id: string;
  candidate_number: string;
  monthly_unit_price_cents: number;
  aggregate_monthly_ceiling_cents: number;
  spend_policy_revision: number;
  price_evidence_source: string;
  price_observed_at: string;
  authorized_at: string;
  expires_at: string;
  state: string;
}>;

type CandidateObservationRow = Readonly<{
  id: string;
  provider: string;
  candidate_number: string;
  voice_capable: boolean;
  currency: string;
  monthly_unit_price_cents: number;
  aggregate_monthly_ceiling_cents: number;
  spend_policy_revision: number;
  price_evidence_source: string;
  observed_by: string;
  observed_at: string;
  expires_at: string;
}>;

type OperationRow = Readonly<{
  id: string;
  operation_type: string;
  state: string;
  inventory_id: string | null;
  purchase_authorization_id: string | null;
  provider_object_id: string | null;
  monthly_unit_price_cents: number | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}>;

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function when(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('en-US') : 'Unknown';
}

function policyConfirmation(price: number, ceiling: number, enabled: boolean): string {
  return `SET VOICE POLICY USD ${(price / 100).toFixed(2)}/MO LIMIT USD ${(ceiling / 100).toFixed(2)}/MO ${enabled ? 'ENABLED' : 'DISABLED'}`;
}

function purchaseConfirmation(number: string, policy: PolicyRow): string {
  return `PURCHASE ${number} USD ${(policy.monthly_unit_price_cents / 100).toFixed(2)}/MO`;
}

function observationConfirmation(number: string, monthlyPriceCents: number): string {
  return `I CHECKED SIGNALWIRE DASHBOARD ${number} USD ${(monthlyPriceCents / 100).toFixed(2)}/MO`;
}

export default async function AdminVoiceNumberProvisioningPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{
    account?: string;
    area?: string;
    region?: string;
    candidate?: string;
    observation?: string;
    done?: string;
    error?: string;
    correlation?: string;
  }>;
}) {
  const searchParams = (await searchParamsPromise) || {};
  const ctx = await requireAdmin();
  const mayManage = staffCan(ctx.staff, 'ops.manage');
  const mutationEnabled = voiceNumberProvisioningMutationEnabled();
  const recoveryEnabled = voiceNumberRecoveryEnabled();
  const accountId = UUID.test(searchParams.account ?? '')
    ? searchParams.account!.toLowerCase()
    : null;
  const invalidAccount = Boolean(searchParams.account && !accountId);
  const candidate = normalizeUsPhone(searchParams.candidate ?? '') || null;
  const areaCode = AREA_CODE.test(searchParams.area ?? '') ? searchParams.area! : '810';
  const region = /^[A-Za-z]{2}$/.test(searchParams.region ?? '')
    ? searchParams.region!.toUpperCase()
    : 'MI';

  const callbackOrigin = trustedProviderCallbackOrigin();
  const inboundTarget = callbackOrigin ? `${callbackOrigin}/api/voice/ai` : null;
  const providerStatusTarget = callbackOrigin ? `${callbackOrigin}/api/voice/provider-status` : null;
  const unavailable: string[] = [];

  const policyResult = await ctx.admin
    .from('voice_number_spend_policies')
    .select('provider, currency, monthly_unit_price_cents, aggregate_monthly_ceiling_cents, purchase_enabled, revision, updated_at')
    .eq('provider', 'signalwire')
    .maybeSingle();
  if (policyResult.error) unavailable.push('spend policy');
  const policy = policyResult.error ? null : policyResult.data as PolicyRow | null;

  let account: AccountRow | null = null;
  let inventory: InventoryRow | null = null;
  let authorization: AuthorizationRow | null = null;
  let observation: CandidateObservationRow | null = null;
  let operations: OperationRow[] = [];

  if (accountId) {
    const [accountResult, inventoryResult, authorizationResult, operationsResult] = await Promise.all([
      ctx.admin
        .from('accounts')
        .select('id, business_name, account_number, call_tracking_number')
        .eq('id', accountId)
        .maybeSingle(),
      ctx.admin
        .from('voice_number_inventory')
        .select('id, provider_number_id, e164_number, lifecycle_state, voice_capable, call_handler, call_request_url, call_request_method, call_status_callback_url, call_status_callback_method, provider_verified_at, last_provider_sync_at, activated_at')
        .eq('account_id', accountId)
        .neq('lifecycle_state', 'released')
        .maybeSingle(),
      ctx.admin
        .from('voice_number_purchase_authorizations')
        .select('id, candidate_observation_id, candidate_number, monthly_unit_price_cents, aggregate_monthly_ceiling_cents, spend_policy_revision, price_evidence_source, price_observed_at, authorized_at, expires_at, state')
        .eq('account_id', accountId)
        .order('authorized_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      ctx.admin
        .from('voice_number_provisioning_operations')
        .select('id, operation_type, state, inventory_id, purchase_authorization_id, provider_object_id, monthly_unit_price_cents, error_code, created_at, updated_at, resolved_at')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    if (accountResult.error) unavailable.push('account');
    if (inventoryResult.error) unavailable.push('voice inventory');
    if (authorizationResult.error) unavailable.push('purchase authorization');
    if (operationsResult.error) unavailable.push('operation history');
    account = accountResult.error ? null : accountResult.data as AccountRow | null;
    inventory = inventoryResult.error ? null : inventoryResult.data as InventoryRow | null;
    authorization = authorizationResult.error ? null : authorizationResult.data as AuthorizationRow | null;
    operations = operationsResult.error ? [] : (operationsResult.data ?? []) as OperationRow[];
  }

  const indeterminate = operations.find((operation) => operation.state === 'indeterminate') ?? null;
  const retryableOperation = !indeterminate
    && operations[0]?.state === 'failed'
    && ['configure_voice', 'release_number'].includes(operations[0].operation_type)
    ? operations[0]
    : null;
  const effectiveCandidate = candidate ?? (
    authorization?.state === 'authorized' ? normalizeUsPhone(authorization.candidate_number) : null
  );
  const requestedObservationId = UUID.test(searchParams.observation ?? '')
    ? searchParams.observation!.toLowerCase()
    : authorization?.candidate_observation_id ?? null;
  if (requestedObservationId && effectiveCandidate) {
    const observationResult = await ctx.admin
      .from('voice_number_candidate_observations')
      .select('id, provider, candidate_number, voice_capable, currency, monthly_unit_price_cents, aggregate_monthly_ceiling_cents, spend_policy_revision, price_evidence_source, observed_by, observed_at, expires_at')
      .eq('id', requestedObservationId)
      .eq('provider', 'signalwire')
      .eq('candidate_number', effectiveCandidate)
      .maybeSingle();
    if (observationResult.error) unavailable.push('candidate and price observation');
    observation = observationResult.error ? null : observationResult.data as CandidateObservationRow | null;
  }
  const observationCurrent = Boolean(
    observation
    && observation.voice_capable
    && observation.currency === 'USD'
    && observation.price_evidence_source === 'signalwire_dashboard'
    && effectiveCandidate === normalizeUsPhone(observation.candidate_number)
    && new Date(observation.expires_at).getTime() > Date.now()
    && policy
    && policy.purchase_enabled
    && observation.monthly_unit_price_cents === policy.monthly_unit_price_cents
    && observation.aggregate_monthly_ceiling_cents === policy.aggregate_monthly_ceiling_cents
    && observation.spend_policy_revision === policy.revision,
  );
  const authorizationCurrent = Boolean(
    authorization
    && authorization.state === 'authorized'
    && effectiveCandidate === normalizeUsPhone(authorization.candidate_number)
    && observationCurrent
    && authorization.candidate_observation_id === observation?.id
    && authorization.price_evidence_source === observation?.price_evidence_source
    && authorization.price_observed_at === observation?.observed_at
    && new Date(authorization.expires_at).getTime() > Date.now()
    && policy
    && policy.purchase_enabled
    && authorization.monthly_unit_price_cents === policy.monthly_unit_price_cents
    && authorization.aggregate_monthly_ceiling_cents === policy.aggregate_monthly_ceiling_cents
    && authorization.spend_policy_revision === policy.revision,
  );
  const purchaseReady = mayManage
    && mutationEnabled
    && Boolean(account)
    && Boolean(policy?.purchase_enabled)
    && authorizationCurrent
    && Boolean(effectiveCandidate)
    && !inventory
    && !indeterminate
    && unavailable.length === 0;

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>AI Voice operations</p>
        <h1 className={styles.title}>Dedicated voice-number provisioning</h1>
        <p className={styles.lead}>
          A separate voice-only SignalWire rail. Search is read-only. Purchase requires MFA, a live mutation gate,
          the persisted recurring-price revision, a fresh one-time authorization, and a second exact typed confirmation.
          This page never reclassifies or configures the shared messaging number.
        </p>
        <p>
          <Link href="/admin/health">← Service health</Link>
          {' · '}
          <Link href="/admin/messaging/registrations">SMS / 10DLC registrations</Link>
        </p>
      </header>

      {searchParams.done ? (
        <div className={`${styles.banner} ${styles.ok}`}>Operation completed. Review the durable state below before continuing.</div>
      ) : null}
      {searchParams.error ? (
        <div className={`${styles.banner} ${styles.err}`}>
          Operation did not complete. No automatic retry was issued. Error reference:{' '}
          <code>{UUID.test(searchParams.correlation ?? '') ? searchParams.correlation : 'unavailable'}</code>.
        </div>
      ) : null}
      {!mutationEnabled ? (
        <div className={`${styles.banner} ${styles.warn}`}>
          The AI Voice acquisition/configuration gate is dark. Search and inspection remain available; policy changes,
          dashboard-price recording, purchase authorization, purchase, and configuration are blocked.
        </div>
      ) : null}
      {!recoveryEnabled ? (
        <div className={`${styles.banner} ${styles.warn}`}>
          The separate AI Voice recovery gate is dark. Exact-number release, indeterminate reconciliation, and explicit
          operator retry generations are blocked without enabling <code>LGQ_SIGNALWIRE_VOICE_RECOVERY_ENABLED</code>.
        </div>
      ) : null}
      {!callbackOrigin ? (
        <div className={`${styles.banner} ${styles.err}`}>
          A trusted production HTTPS callback origin is unavailable. Provider configuration is blocked.
        </div>
      ) : null}
      {unavailable.length ? (
        <div className={`${styles.banner} ${styles.err}`}>
          Provisioning data is incomplete: {unavailable.join(', ')}. Missing evidence is not treated as ready.
        </div>
      ) : null}
      {indeterminate ? (
        <div className={`${styles.banner} ${styles.err}`}>
          Provider outcome is indeterminate for operation <code>{indeterminate.id}</code>. New purchase or configuration is
          quarantined until an operator performs explicit reconciliation and any required orphan cleanup.
        </div>
      ) : null}

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Workspace</h2>
        <form method="get" className={styles.searchRow}>
          <label className={styles.srOnly} htmlFor="voice-account">Exact workspace UUID</label>
          <input
            id="voice-account"
            className={styles.input}
            name="account"
            defaultValue={searchParams.account ?? ''}
            placeholder="Exact workspace UUID"
            pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}"
            required
          />
          <button className="btn secondary" type="submit">Load workspace</button>
        </form>
        {invalidAccount ? <p className={styles.emptyState}>Enter an exact workspace UUID.</p> : null}
        {accountId && !account && !unavailable.includes('account') ? (
          <p className={styles.emptyState}>No workspace has that UUID.</p>
        ) : null}
        {account ? (
          <dl className={styles.kv} style={{ marginTop: '1rem' }}>
            <dt>Business</dt><dd>{account.business_name ?? 'Unnamed workspace'}</dd>
            <dt>Account</dt><dd>{account.account_number ?? '—'} · <code>{account.id}</code></dd>
            <dt>Bound voice number</dt><dd><code>{account.call_tracking_number ?? 'None'}</code></dd>
          </dl>
        ) : null}
      </section>

      {account ? (
        <div className={styles.detailGrid}>
          <div>
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>1. Recurring-spend policy</h2>
              <p className={styles.muted}>
                This database policy is the spend ceiling, not a carrier price feed. SignalWire search does not return price.
                Before authorization, an operator must separately check the current monthly price in the SignalWire dashboard.
              </p>
              {policy ? (
                <dl className={styles.kv}>
                  <dt>Monthly unit price</dt><dd><strong>{money(policy.monthly_unit_price_cents)}/month</strong></dd>
                  <dt>Aggregate ceiling</dt><dd>{money(policy.aggregate_monthly_ceiling_cents)}/month</dd>
                  <dt>Purchases</dt><dd>{policy.purchase_enabled ? 'Enabled' : 'Disabled'}</dd>
                  <dt>Revision</dt><dd>{policy.revision} · updated {when(policy.updated_at)}</dd>
                </dl>
              ) : <p className={styles.emptyState}>No policy exists. Purchases fail closed.</p>}
              {mayManage ? (
                <form action={setVoiceNumberSpendPolicyAction} className={styles.formStack} style={{ marginTop: '1rem' }}>
                  <input type="hidden" name="accountId" value={account.id} />
                  <label className={styles.formLabel}>Monthly unit price (whole cents)
                    <input className={styles.input} name="monthlyPriceCents" inputMode="numeric" pattern="[1-9][0-9]{0,8}" defaultValue={policy?.monthly_unit_price_cents ?? ''} required />
                  </label>
                  <label className={styles.formLabel}>Aggregate monthly ceiling (whole cents)
                    <input className={styles.input} name="monthlySpendCeilingCents" inputMode="numeric" pattern="[1-9][0-9]{0,8}" defaultValue={policy?.aggregate_monthly_ceiling_cents ?? ''} required />
                  </label>
                  <label className={styles.formLabel}>
                    <input type="checkbox" name="purchaseEnabled" value="yes" defaultChecked={policy?.purchase_enabled ?? false} />{' '}
                    Enable new AI Voice number purchases
                  </label>
                  <label className={styles.formLabel}>Exact confirmation
                    <input className={styles.input} name="confirmation" autoComplete="off" required />
                  </label>
                  <p className={styles.muted}>
                    The server derives the phrase from the submitted cents and checkbox. Example:{' '}
                    <code>{policyConfirmation(50, 5000, true)}</code>
                  </p>
                  <button className="btn secondary" type="submit" disabled={!mutationEnabled}>Set voice spend policy</button>
                </form>
              ) : null}
            </section>

            {!inventory && !indeterminate ? (
              <section className={styles.panel}>
                <h2 className={styles.panelTitle}>2. Search voice-only inventory</h2>
                <p>
                  Search proves only current availability and <code>voice</code> capability. The SignalWire search API does not
                  supply carrier price, and this step cannot purchase, authorize spend, or configure a provider number.
                </p>
                {mayManage ? (
                  <form action={searchVoiceNumberCandidateAction} className={styles.searchRow}>
                    <input type="hidden" name="accountId" value={account.id} />
                    <label className={styles.formLabel}>Area code
                      <input className={styles.input} name="areaCode" inputMode="numeric" pattern="[2-9][0-9]{2}" defaultValue={areaCode} required />
                    </label>
                    <label className={styles.formLabel}>Region
                      <input className={styles.input} name="region" pattern="[A-Za-z]{2}" defaultValue={region} required />
                    </label>
                    <button className="btn secondary" type="submit">Search SignalWire</button>
                  </form>
                ) : null}
                {effectiveCandidate ? (
                  <p>Reviewed candidate: <code>{effectiveCandidate}</code></p>
                ) : <p className={styles.emptyState}>No candidate is selected.</p>}
              </section>
            ) : null}

            {!inventory && !indeterminate && effectiveCandidate && policy?.purchase_enabled ? (
              <section className={styles.panel}>
                <h2 className={styles.panelTitle}>3. Record fresh dashboard price evidence</h2>
                <p>
                  Immediately open the SignalWire dashboard, verify the exact number is still offered, and read its monthly
                  recurring charge. Enter whole cents and attest to that separate dashboard observation. Evidence expires in 15 minutes.
                </p>
                {observationCurrent ? (
                  <dl className={styles.kv}>
                    <dt>Candidate</dt><dd><code>{observation!.candidate_number}</code></dd>
                    <dt>Observed price</dt><dd><strong>{money(observation!.monthly_unit_price_cents)}/month</strong></dd>
                    <dt>Evidence source</dt><dd>SignalWire dashboard (operator-observed)</dd>
                    <dt>Observed by</dt><dd>{observation!.observed_by}</dd>
                    <dt>Observed at</dt><dd>{when(observation!.observed_at)}</dd>
                    <dt>Expires</dt><dd>{when(observation!.expires_at)}</dd>
                    <dt>Immutable evidence</dt><dd><code>{observation!.id}</code></dd>
                  </dl>
                ) : mayManage ? (
                  <form action={recordVoiceNumberCandidateObservationAction} className={styles.formStack}>
                    <input type="hidden" name="accountId" value={account.id} />
                    <input type="hidden" name="candidateNumber" value={effectiveCandidate} />
                    <input type="hidden" name="areaCode" value={areaCode} />
                    <input type="hidden" name="region" value={region} />
                    <label className={styles.formLabel}>Monthly price seen in SignalWire dashboard (whole cents)
                      <input className={styles.input} name="monthlyPriceCents" inputMode="numeric" pattern="[1-9][0-9]{0,8}" defaultValue={policy.monthly_unit_price_cents} required />
                    </label>
                    <label className={styles.formLabel}>Type <code>{observationConfirmation(effectiveCandidate, policy.monthly_unit_price_cents)}</code>
                      <input className={styles.input} name="confirmation" autoComplete="off" required />
                    </label>
                    <button className="btn secondary" type="submit" disabled={!mutationEnabled}>Record immutable price observation</button>
                  </form>
                ) : null}
              </section>
            ) : null}

            {!inventory && !indeterminate && effectiveCandidate && policy?.purchase_enabled && observationCurrent ? (
              <section className={styles.panel}>
                <h2 className={styles.panelTitle}>4. Authorize exact recurring charge</h2>
                <p>
                  Candidate <code>{effectiveCandidate}</code> at <strong>{money(observation!.monthly_unit_price_cents)}/month</strong> under
                  policy revision {observation!.spend_policy_revision}. Authorization is bound to immutable dashboard evidence{' '}
                  <code>{observation!.id}</code>, expires no later than that evidence, and does not contact the purchase endpoint.
                </p>
                {authorizationCurrent ? (
                  <dl className={styles.kv}>
                    <dt>Authorization</dt><dd><code>{authorization!.id}</code></dd>
                    <dt>Price source</dt><dd>SignalWire dashboard (operator-observed)</dd>
                    <dt>Price observed</dt><dd>{when(authorization!.price_observed_at)}</dd>
                    <dt>Authorization expires</dt><dd>{when(authorization!.expires_at)}</dd>
                  </dl>
                ) : mayManage ? (
                  <form action={authorizeVoiceNumberPurchaseAction} className={styles.formStack}>
                    <input type="hidden" name="accountId" value={account.id} />
                    <input type="hidden" name="candidateNumber" value={effectiveCandidate} />
                    <input type="hidden" name="candidateObservationId" value={observation!.id} />
                    <label className={styles.formLabel}>Type <code>{purchaseConfirmation(effectiveCandidate, policy)}</code>
                      <input className={styles.input} name="confirmation" autoComplete="off" required />
                    </label>
                    <button className="btn secondary" type="submit" disabled={!mutationEnabled}>Authorize this exact charge</button>
                  </form>
                ) : null}
              </section>
            ) : null}

            {!inventory && authorizationCurrent && effectiveCandidate && policy ? (
              <section className={`${styles.panel} ${styles.dangerZone}`}>
                <h2 className={styles.panelTitle}>5. Purchase provider number</h2>
                <p>
                  This is the only action on this page that may create a new recurring carrier charge. There is no automatic retry after an
                  unknown provider outcome. Immediately before the POST, the server searches again and blocks purchase unless SignalWire
                  still lists this exact E.164 number as available and voice capable.
                </p>
                {mayManage ? (
                  <form action={purchaseVoiceNumberAction} className={styles.formStack}>
                    <input type="hidden" name="accountId" value={account.id} />
                    <input type="hidden" name="authorizationId" value={authorization!.id} />
                    <input type="hidden" name="candidateNumber" value={effectiveCandidate} />
                    <label className={styles.formLabel}>Type <code>{purchaseConfirmation(effectiveCandidate, policy)}</code>
                      <input className={styles.input} name="confirmation" autoComplete="off" required />
                    </label>
                    <button className="btn primary" type="submit" disabled={!purchaseReady}>Purchase exact AI Voice number</button>
                  </form>
                ) : null}
              </section>
            ) : null}
          </div>

          <div>
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Voice inventory</h2>
              {inventory ? (
                <dl className={styles.kv}>
                  <dt>Number</dt><dd><code>{inventory.e164_number}</code></dd>
                  <dt>Lifecycle</dt><dd>{inventory.lifecycle_state}</dd>
                  <dt>Provider object</dt><dd><code>{inventory.provider_number_id}</code></dd>
                  <dt>Voice capable</dt><dd>{inventory.voice_capable ? 'Verified' : 'Not verified'}</dd>
                  <dt>Inbound</dt><dd><code>{inventory.call_request_method ?? '—'} {inventory.call_request_url ?? '—'}</code></dd>
                  <dt>Provider status</dt><dd><code>{inventory.call_status_callback_method ?? '—'} {inventory.call_status_callback_url ?? '—'}</code></dd>
                  <dt>Last provider proof</dt><dd>{when(inventory.last_provider_sync_at)}</dd>
                  <dt>Activated</dt><dd>{when(inventory.activated_at)}</dd>
                </dl>
              ) : <p className={styles.emptyState}>No unreleased AI Voice number is inventoried for this workspace.</p>}
            </section>

            {inventory && inventory.lifecycle_state !== 'active' && !indeterminate && !retryableOperation && mayManage ? (
              <section className={styles.panel}>
                <h2 className={styles.panelTitle}>Configure exact voice routes</h2>
                <p>
                  Inbound calls must POST to <code>{inboundTarget ?? 'trusted origin unavailable'}</code>. Number-level lifecycle events must
                  POST separately to <code>{providerStatusTarget ?? 'trusted origin unavailable'}</code>.
                </p>
                <form action={configureVoiceNumberAction} className={styles.formStack}>
                  <input type="hidden" name="accountId" value={account.id} />
                  <input type="hidden" name="inventoryId" value={inventory.id} />
                  <label className={styles.formLabel}>Type <code>CONFIGURE {inventory.e164_number} FOR AI VOICE</code>
                    <input className={styles.input} name="confirmation" autoComplete="off" required />
                  </label>
                  <button className="btn primary" type="submit" disabled={!mutationEnabled || !inboundTarget || !providerStatusTarget}>
                    Configure dedicated AI Voice routes
                  </button>
                </form>
              </section>
            ) : null}

            {inventory && !indeterminate && !retryableOperation && mayManage ? (
              <section className={`${styles.panel} ${styles.dangerZone}`}>
                <h2 className={styles.panelTitle}>Release exact AI Voice number</h2>
                <p>
                  This permanently releases <code>{inventory.e164_number}</code> from SignalWire and should stop its recurring
                  carrier charge. It uses the separate recovery gate, so acquisition can remain disabled. The server re-reads
                  the exact provider identity immediately before release and quarantines an uncertain outcome.
                </p>
                <form action={releaseVoiceNumberAction} className={styles.formStack}>
                  <input type="hidden" name="accountId" value={account.id} />
                  <input type="hidden" name="inventoryId" value={inventory.id} />
                  <label className={styles.formLabel}>Type <code>RELEASE {inventory.e164_number}</code>
                    <input className={styles.input} name="confirmation" autoComplete="off" required />
                  </label>
                  <button className="btn primary" type="submit" disabled={!recoveryEnabled}>Release exact provider number</button>
                </form>
              </section>
            ) : null}

            {inventory && retryableOperation && mayManage ? (
              <section className={`${styles.panel} ${styles.dangerZone}`}>
                <h2 className={styles.panelTitle}>Explicit operator retry generation</h2>
                <p>
                  The prior {retryableOperation.operation_type.replace(/_/g, ' ')} operation is failed, so its idempotency
                  key cannot be silently reused. This action creates one short-lived, single-use retry authorization and a new
                  bounded generation under the separate recovery gate. Nothing retries automatically.
                </p>
                <form action={retryVoiceNumberOperationAction} className={styles.formStack}>
                  <input type="hidden" name="accountId" value={account.id} />
                  <input type="hidden" name="operationId" value={retryableOperation.id} />
                  <label className={styles.formLabel}>
                    Type <code>RETRY {retryableOperation.operation_type === 'configure_voice' ? 'CONFIGURE' : 'RELEASE'} {inventory.e164_number} AFTER {retryableOperation.id}</code>
                    <input className={styles.input} name="confirmation" autoComplete="off" required />
                  </label>
                  <button className="btn primary" type="submit" disabled={!recoveryEnabled}>Authorize one retry generation</button>
                </form>
              </section>
            ) : null}

            {indeterminate && mayManage ? (
              <section className={`${styles.panel} ${styles.dangerZone}`}>
                <h2 className={styles.panelTitle}>Provider reconciliation and orphan cleanup</h2>
                <p>
                  This checks every expected and captured provider identity. If an indeterminate response exposed a distinct
                  orphaned AI Voice resource, the database first reserves that exact ID and E.164 against both live SMS and AI Voice
                  inventory. The server then re-reads and, when required, releases only that reserved provider object before finalizing
                  immutable cleanup evidence. It then imports a verified success or records confirmed absence. It never issues a
                  replacement purchase or blind retry.
                </p>
                <form action={reconcileVoiceNumberAction} className={styles.formStack}>
                  <input type="hidden" name="accountId" value={account.id} />
                  <input type="hidden" name="operationId" value={indeterminate.id} />
                  <input type="hidden" name="resolution" value="confirmed_succeeded" />
                  <label className={styles.formLabel}>After reviewing possible orphan cleanup, type <code>RECONCILE {indeterminate.id} CLEANUP AND IMPORT</code>
                    <input className={styles.input} name="confirmation" autoComplete="off" required />
                  </label>
                  <button className="btn secondary" type="submit" disabled={!recoveryEnabled}>Verify and import exact success</button>
                </form>
                <form action={reconcileVoiceNumberAction} className={styles.formStack} style={{ marginTop: '1rem' }}>
                  <input type="hidden" name="accountId" value={account.id} />
                  <input type="hidden" name="operationId" value={indeterminate.id} />
                  <input type="hidden" name="resolution" value="confirmed_absent" />
                  <label className={styles.formLabel}>After reviewing possible orphan cleanup, type <code>RECONCILE {indeterminate.id} CLEANUP AND MARK ABSENT</code>
                    <input className={styles.input} name="confirmation" autoComplete="off" required />
                  </label>
                  <button className="btn secondary" type="submit" disabled={!recoveryEnabled}>Verify confirmed absence</button>
                </form>
              </section>
            ) : null}

            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Durable operation history</h2>
              {operations.length ? (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead><tr><th>Operation</th><th>State</th><th>Price</th><th>Updated</th></tr></thead>
                    <tbody>{operations.map((operation) => (
                      <tr key={operation.id}>
                        <td>{operation.operation_type.replace(/_/g, ' ')}<div className={styles.muted}><code>{operation.id}</code></div></td>
                        <td>{operation.state}{operation.error_code ? <div className={styles.muted}>{operation.error_code}</div> : null}</td>
                        <td>{operation.monthly_unit_price_cents ? `${money(operation.monthly_unit_price_cents)}/mo` : '—'}</td>
                        <td>{when(operation.updated_at)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <p className={styles.emptyState}>No durable provider operations exist for this workspace.</p>}
            </section>
          </div>
        </div>
      ) : null}
    </>
  );
}
