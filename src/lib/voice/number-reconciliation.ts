import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createAdminClient } from '@/lib/auth';
import {
  SignalWireNumberProvisioningClient,
  SignalWireProvisioningError,
  type SignalWirePhoneNumber,
} from '@/lib/signalwire-number-provisioning';
import { signalWireVoiceRouteTargets } from '@/lib/voice/number-readiness';

/**
 * One hourly run should comfortably refresh every small-business inventory,
 * while the hard cap prevents a bad query or URL parameter from producing an
 * unbounded provider fan-out. A full batch is reported as truncated so the
 * operator can see when the fleet has outgrown this cadence.
 */
export const VOICE_NUMBER_RECONCILIATION_BATCH_SIZE = 25;
export const VOICE_NUMBER_RECONCILIATION_MAX_BATCH_SIZE = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const E164 = /^\+[1-9][0-9]{7,14}$/;

type InventoryRow = Readonly<{
  id: string;
  account_id: string;
  provider_number_id: string;
  e164_number: string;
  lifecycle_state: 'purchased' | 'configuring' | 'active' | 'suspended';
}>;

type RecoveryRow = Readonly<{
  recovery_status?: unknown;
}>;

export type VoiceNumberProviderObservation = Readonly<{
  provider: 'signalwire';
  id: string;
  number: string;
  voice_capable: boolean;
  call_handler: string | null;
  call_request_url: string | null;
  call_request_method: string | null;
  call_status_callback_url: string | null;
  call_status_callback_method: string | null;
}>;

export type VoiceNumberReconciliationSummary = Readonly<{
  tombstonesPurged: number;
  operationCandidates: number;
  operationsRequeued: number;
  operationsTerminalFailed: number;
  operationsNeedReconciliation: number;
  considered: number;
  verified: number;
  drifted: number;
  missing: number;
  skippedNonActive: number;
  providerErrors: number;
  databaseErrors: number;
  malformedRows: number;
  failures: number;
  batchSize: number;
  truncated: boolean;
}>;

type Dependencies = Readonly<{
  admin?: SupabaseClient;
  provider?: SignalWireNumberProvisioningClient;
  batchSize?: number;
}>;

function boundedBatchSize(value: number | undefined): number {
  if (value === undefined) return VOICE_NUMBER_RECONCILIATION_BATCH_SIZE;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error('AI Voice number reconciliation batch size must be a positive integer.');
  }
  return Math.min(value, VOICE_NUMBER_RECONCILIATION_MAX_BATCH_SIZE);
}

function inventoryRow(value: unknown): InventoryRow | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id : '';
  const accountId = typeof row.account_id === 'string' ? row.account_id : '';
  const providerNumberId = typeof row.provider_number_id === 'string'
    ? row.provider_number_id
    : '';
  const number = typeof row.e164_number === 'string' ? row.e164_number : '';
  const lifecycleState = row.lifecycle_state;
  if (!UUID.test(id)
      || !UUID.test(accountId)
      || !UUID.test(providerNumberId)
      || !E164.test(number)
      || !['purchased', 'configuring', 'active', 'suspended'].includes(String(lifecycleState))) {
    return null;
  }
  return Object.freeze({
    id: id.toLowerCase(),
    account_id: accountId.toLowerCase(),
    provider_number_id: providerNumberId.toLowerCase(),
    e164_number: number,
    lifecycle_state: lifecycleState as InventoryRow['lifecycle_state'],
  });
}

export function voiceNumberProviderObservation(
  phone: SignalWirePhoneNumber,
): VoiceNumberProviderObservation {
  return Object.freeze({
    provider: 'signalwire',
    id: phone.id,
    number: phone.number,
    voice_capable: phone.capabilities.includes('voice'),
    call_handler: phone.callHandler,
    call_request_url: phone.callRequestUrl,
    call_request_method: phone.callRequestMethod,
    call_status_callback_url: phone.callStatusCallbackUrl,
    call_status_callback_method: phone.callStatusCallbackMethod,
  });
}

export function exactVoiceNumberProviderMatch(
  row: InventoryRow,
  observed: VoiceNumberProviderObservation,
  targets: Readonly<{ inboundUrl: string; statusUrl: string }>,
): boolean {
  return observed.provider === 'signalwire'
    && observed.id.toLowerCase() === row.provider_number_id
    && observed.number === row.e164_number
    && observed.voice_capable
    && observed.call_handler === 'laml_webhooks'
    && observed.call_request_url === targets.inboundUrl
    && observed.call_request_method === 'POST'
    && observed.call_status_callback_url === targets.statusUrl
    && observed.call_status_callback_method === 'POST';
}

function blankSummary(batchSize: number): VoiceNumberReconciliationSummary {
  return {
    tombstonesPurged: 0,
    operationCandidates: 0,
    operationsRequeued: 0,
    operationsTerminalFailed: 0,
    operationsNeedReconciliation: 0,
    considered: 0,
    verified: 0,
    drifted: 0,
    missing: 0,
    skippedNonActive: 0,
    providerErrors: 0,
    databaseErrors: 0,
    malformedRows: 0,
    failures: 0,
    batchSize,
    truncated: false,
  };
}

function providerReadErrorCode(error: unknown): string {
  const code = error instanceof SignalWireProvisioningError ? error.code : null;
  return typeof code === 'string' && /^[a-z][a-z0-9_]{2,99}$/.test(code)
    ? code
    : 'provider_read_error';
}

async function recordProviderCheckAttempt(
  admin: SupabaseClient,
  row: InventoryRow,
  outcome: 'read_error' | 'apply_error' | 'skipped_nonactive',
  errorCode: string,
): Promise<boolean> {
  try {
    const result = await admin.rpc('record_voice_number_provider_check_attempt', {
      p_account_id: row.account_id,
      p_voice_number_id: row.id,
      p_check_outcome: outcome,
      p_error_code: errorCode,
    });
    return !result.error && Array.isArray(result.data) && result.data.length === 1;
  } catch {
    return false;
  }
}

function finishSummary(
  summary: VoiceNumberReconciliationSummary,
): VoiceNumberReconciliationSummary {
  return Object.freeze({
    ...summary,
    failures: summary.operationsTerminalFailed
      + summary.operationsNeedReconciliation
      + summary.drifted
      + summary.missing
      + summary.providerErrors
      + summary.databaseErrors
      + summary.malformedRows,
  });
}

/**
 * Reconcile application proof against SignalWire's current number object.
 *
 * This worker never calls a provider mutation. SignalWire is GET-only; every
 * durable transition is delegated to service-only database RPCs that lock and
 * re-check the exact account/inventory identity. A failed or malformed read is
 * not evidence of drift and therefore does not update inventory.
 */
export async function runVoiceNumberReconciliation(
  dependencies: Dependencies = {},
): Promise<VoiceNumberReconciliationSummary> {
  const batchSize = boundedBatchSize(dependencies.batchSize);
  const admin = dependencies.admin ?? createAdminClient();
  let summary = blankSummary(batchSize);

  // Terminal provider callbacks are retained long enough to defeat delayed
  // admission/replay races. Purging expired tombstones is housekeeping only:
  // a failure is visible but must not prevent fresh provider proof checks.
  try {
    const purge = await admin.rpc('purge_expired_voice_provider_terminal_tombstones', {
      // Cleanup capacity is independent from the intentionally small provider
      // GET fan-out; a busy account can produce far more than 25 calls/hour.
      p_batch_size: 1000,
    });
    const purged = typeof purge.data === 'number' ? purge.data : Number.NaN;
    if (purge.error || !Number.isSafeInteger(purged) || purged < 0) {
      console.error('AI Voice terminal tombstone purge failed');
      summary = { ...summary, databaseErrors: summary.databaseErrors + 1 };
    } else {
      summary = { ...summary, tombstonesPurged: purged };
    }
  } catch {
    console.error('AI Voice terminal tombstone purge threw');
    summary = { ...summary, databaseErrors: summary.databaseErrors + 1 };
  }

  // Recover expired leases before inspecting inventory. A request that may
  // already have reached SignalWire must become needs_reconciliation rather
  // than being silently retried.
  let recovery;
  try {
    recovery = await admin.rpc('recover_stale_voice_number_operations', {
      p_batch_size: batchSize,
    });
  } catch {
    console.error('AI Voice number stale-operation recovery threw');
    return finishSummary({
      ...summary,
      databaseErrors: summary.databaseErrors + 1,
    });
  }
  if (recovery.error || !Array.isArray(recovery.data)) {
    console.error('AI Voice number stale-operation recovery failed');
    return finishSummary({
      ...summary,
      databaseErrors: summary.databaseErrors + 1,
    });
  }

  let operationsRequeued = 0;
  let operationsTerminalFailed = 0;
  let operationsNeedReconciliation = 0;
  let malformedRecoveryRows = 0;
  for (const value of recovery.data as RecoveryRow[]) {
    if (value?.recovery_status === 'requeued') operationsRequeued += 1;
    else if (value?.recovery_status === 'terminal_failed') operationsTerminalFailed += 1;
    else if (value?.recovery_status === 'needs_reconciliation') operationsNeedReconciliation += 1;
    else malformedRecoveryRows += 1;
  }
  summary = {
    ...summary,
    operationCandidates: recovery.data.length,
    operationsRequeued,
    operationsTerminalFailed,
    operationsNeedReconciliation,
    malformedRows: malformedRecoveryRows,
  };

  const targets = signalWireVoiceRouteTargets();
  if (!targets) {
    console.error('AI Voice number reconciliation has no trusted provider callback origin');
    return finishSummary({ ...summary, databaseErrors: summary.databaseErrors + 1 });
  }

  let inventory;
  try {
    inventory = await admin
      .from('voice_number_inventory')
      .select('id, account_id, provider_number_id, e164_number, lifecycle_state, last_provider_check_attempt_at, last_provider_sync_at, created_at')
      .eq('provider', 'signalwire')
      .eq('purpose', 'ai_voice')
      .in('lifecycle_state', ['purchased', 'configuring', 'active', 'suspended'])
      .is('released_at', null)
      .order('last_provider_check_attempt_at', { ascending: true, nullsFirst: true })
      .order('last_provider_sync_at', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true, nullsFirst: true })
      .limit(batchSize);
  } catch {
    console.error('AI Voice number reconciliation inventory read threw');
    return finishSummary({ ...summary, databaseErrors: summary.databaseErrors + 1 });
  }

  if (inventory.error || !Array.isArray(inventory.data)) {
    console.error('AI Voice number reconciliation inventory read failed');
    return finishSummary({ ...summary, databaseErrors: summary.databaseErrors + 1 });
  }

  if (inventory.data.length === 0) {
    return finishSummary({ ...summary, considered: 0, truncated: false });
  }

  let provider: SignalWireNumberProvisioningClient;
  try {
    provider = dependencies.provider ?? SignalWireNumberProvisioningClient.fromEnvironment();
  } catch {
    console.error('AI Voice number provider client initialization failed');
    let databaseErrors = summary.databaseErrors;
    let malformedRows = summary.malformedRows;
    for (const value of inventory.data) {
      const row = inventoryRow(value);
      if (!row) {
        malformedRows += 1;
        continue;
      }
      if (!await recordProviderCheckAttempt(
        admin,
        row,
        'read_error',
        'provider_client_initialization_error',
      )) {
        console.error('AI Voice number provider initialization-attempt write failed');
        databaseErrors += 1;
      }
    }
    return finishSummary({
      ...summary,
      considered: inventory.data.length,
      providerErrors: 1,
      databaseErrors,
      malformedRows,
      truncated: inventory.data.length >= batchSize,
    });
  }
  let considered = 0;
  let verified = 0;
  let drifted = 0;
  let missing = 0;
  let skippedNonActive = 0;
  let providerErrors = 0;
  let databaseErrors = summary.databaseErrors;
  let malformedRows = summary.malformedRows;

  for (const value of inventory.data) {
    considered += 1;
    const row = inventoryRow(value);
    if (!row) {
      malformedRows += 1;
      continue;
    }

    let observed: VoiceNumberProviderObservation | null = null;
    let verificationStatus: 'ready' | 'drifted' | 'missing';
    let errorCode: string | null;
    try {
      const phone = await provider.getPhoneNumber(row.provider_number_id);
      observed = voiceNumberProviderObservation(phone);
      verificationStatus = exactVoiceNumberProviderMatch(row, observed, targets)
        ? 'ready'
        : 'drifted';
      errorCode = verificationStatus === 'drifted' ? 'provider_configuration_drift' : null;
    } catch (error) {
      if (error instanceof SignalWireProvisioningError
          && error.status === 404
          && error.outcomeKnownAbsent) {
        verificationStatus = 'missing';
        errorCode = 'provider_resource_missing';
      } else {
        // A timeout, malformed response, auth failure, or 5xx is not proof that
        // the number changed. Rotate the row without refreshing provider proof.
        console.error('AI Voice number provider inspection failed');
        providerErrors += 1;
        if (!await recordProviderCheckAttempt(
          admin,
          row,
          'read_error',
          providerReadErrorCode(error),
        )) {
          console.error('AI Voice number provider check-attempt write failed');
          databaseErrors += 1;
        }
        continue;
      }
    }

    // Routine proof refresh must never reactivate inventory that an operator,
    // provisioning operation, or prior drift event suspended. Exact non-active
    // objects stay non-active; drift/missing evidence may still quarantine them.
    if (verificationStatus === 'ready' && row.lifecycle_state !== 'active') {
      skippedNonActive += 1;
      if (!await recordProviderCheckAttempt(
        admin,
        row,
        'skipped_nonactive',
        'provider_ready_nonactive',
      )) {
        console.error('AI Voice number nonactive check-attempt write failed');
        databaseErrors += 1;
      }
      continue;
    }

    let applied;
    try {
      applied = await admin.rpc('apply_voice_number_provider_verification', {
        p_account_id: row.account_id,
        p_voice_number_id: row.id,
        p_observed_provider_object_id: row.provider_number_id,
        p_observed_result: observed,
        p_verification_status: verificationStatus,
        p_error_code: errorCode,
      });
    } catch {
      console.error('AI Voice number provider-verification write threw');
      databaseErrors += 1;
      if (!await recordProviderCheckAttempt(
        admin,
        row,
        'apply_error',
        'provider_verification_apply_error',
      )) {
        console.error('AI Voice number apply-error check-attempt write failed');
        databaseErrors += 1;
      }
      continue;
    }
    if (applied.error || !Array.isArray(applied.data) || applied.data.length !== 1) {
      console.error('AI Voice number provider-verification write failed');
      databaseErrors += 1;
      if (!await recordProviderCheckAttempt(
        admin,
        row,
        'apply_error',
        'provider_verification_apply_error',
      )) {
        console.error('AI Voice number apply-error check-attempt write failed');
        databaseErrors += 1;
      }
      continue;
    }

    if (verificationStatus === 'ready') verified += 1;
    else if (verificationStatus === 'drifted') drifted += 1;
    else missing += 1;
  }

  return finishSummary({
    ...summary,
    considered,
    verified,
    drifted,
    missing,
    skippedNonActive,
    providerErrors,
    databaseErrors,
    malformedRows,
    truncated: inventory.data.length >= batchSize,
  });
}
