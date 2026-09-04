import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { trustedProviderCallbackOrigin } from '@/lib/app-origin';
import { normalizeUsPhone } from '@/lib/phone';

const SIGNALWIRE_RESOURCE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Provider configuration proof is operational evidence, not a permanent fact.
 * The hourly reconciliation job refreshes it; after six hours without a
 * successful exact SignalWire GET, request admission fails closed.
 */
export const VOICE_NUMBER_PROVIDER_PROOF_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const VOICE_NUMBER_PROVIDER_PROOF_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

const VOICE_NUMBER_COLUMNS = [
  'id',
  'provider',
  'e164_number',
  'provider_number_id',
  'purpose',
  'account_id',
  'lifecycle_state',
  'voice_capable',
  'call_handler',
  'call_request_url',
  'call_request_method',
  'call_status_callback_url',
  'call_status_callback_method',
  'provider_readiness_state',
  'provider_verified_at',
  'last_provider_sync_at',
  'activated_at',
  'suspended_at',
  'released_at',
].join(', ');

export type SignalWireVoiceNumber = Readonly<{
  accountId: string;
  number: string;
  voiceNumberId: string;
  providerNumberId: string;
  routeRevision: number;
}>;

export type SignalWireVoiceNumberReadiness =
  | Readonly<{ kind: 'ready'; number: SignalWireVoiceNumber }>
  /** Intentionally does not say whether another workspace owns the number. */
  | Readonly<{ kind: 'not_ready'; currentNumber: string | null }>
  | Readonly<{ kind: 'unavailable' }>;

type ReadinessInput = Readonly<{
  /** Omit only when resolving an inbound call from the number that was dialled. */
  accountId?: string;
  /** Omit only when checking the workspace's current customer-facing number. */
  number?: string;
}>;

type VoiceNumberExpectation = Readonly<{
  accountId: string;
  number: string;
  inboundUrl: string;
  statusUrl: string;
}>;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function voiceRouteRevision(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isSafeInteger(parsed) && parsed >= 0
    ? parsed
    : null;
}

/**
 * Validate one inventory row without trusting the filters used to fetch it.
 * This pure half is shared by the request boundary and the batched operator
 * view so neither surface can gradually acquire a weaker definition of ready.
 */
export function signalWireVoiceRouteTargets(): Readonly<{
  inboundUrl: string;
  statusUrl: string;
}> | null {
  const origin = trustedProviderCallbackOrigin();
  return origin ? Object.freeze({
    inboundUrl: `${origin}/api/voice/ai`,
    statusUrl: `${origin}/api/voice/provider-status`,
  }) : null;
}

function freshProviderTimestamp(value: unknown, nowMs: number): boolean {
  const raw = text(value);
  if (!raw) return false;
  const timestampMs = Date.parse(raw);
  if (!Number.isFinite(timestampMs)) return false;
  const ageMs = nowMs - timestampMs;
  return ageMs >= -VOICE_NUMBER_PROVIDER_PROOF_MAX_FUTURE_SKEW_MS
    && ageMs <= VOICE_NUMBER_PROVIDER_PROOF_MAX_AGE_MS;
}

export function hasFreshVoiceNumberProviderProof(
  value: unknown,
  nowMs = Date.now(),
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return row.provider_readiness_state === 'ready'
    && freshProviderTimestamp(row.provider_verified_at, nowMs)
    && freshProviderTimestamp(row.last_provider_sync_at, nowMs);
}

export function readySignalWireVoiceNumber(
  value: unknown,
  expected: VoiceNumberExpectation,
): Omit<SignalWireVoiceNumber, 'routeRevision'> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const number = normalizeUsPhone(String(row.e164_number ?? ''));
  const providerNumberId = text(row.provider_number_id);
  const voiceNumberId = text(row.id);
  const accountId = text(row.account_id);
  const callHandler = String(row.call_handler ?? '').toLowerCase();
  const validHandler = callHandler === 'laml_webhooks' || callHandler === 'relay_script';

  if (
    row.provider !== 'signalwire'
    || row.purpose !== 'ai_voice'
    || accountId !== expected.accountId
    || number !== expected.number
    || row.lifecycle_state !== 'active'
    || row.voice_capable !== true
    || !validHandler
    || row.call_request_url !== expected.inboundUrl
    || (callHandler === 'laml_webhooks' && String(row.call_request_method ?? '').toUpperCase() !== 'POST')
    || (row.call_status_callback_url && row.call_status_callback_url !== expected.statusUrl)
    || (row.call_status_callback_method && String(row.call_status_callback_method ?? '').toUpperCase() !== 'POST')
    || !hasFreshVoiceNumberProviderProof(row)
    || !text(row.activated_at)
    || row.suspended_at !== null
    || row.released_at !== null
    || !voiceNumberId
    || !providerNumberId
    || !SIGNALWIRE_RESOURCE_ID.test(providerNumberId)
  ) return null;

  return Object.freeze({
    accountId,
    number,
    voiceNumberId,
    providerNumberId: providerNumberId.toLowerCase(),
  });
}

async function loadAccount(
  admin: SupabaseClient,
  accountId: string,
): Promise<Readonly<{
  kind: 'ready';
  accountId: string;
  number: string;
  routeRevision: number;
}> | Readonly<{ kind: 'not_ready'; currentNumber: string | null }> | Readonly<{ kind: 'unavailable' }>> {
  const { data, error } = await admin
    .from('accounts')
    .select('id, call_tracking_number, ai_voice_route_revision')
    .eq('id', accountId)
    .maybeSingle();
  if (error) {
    console.error('SignalWire voice account-number read failed:', error);
    return { kind: 'unavailable' };
  }
  const row = data as Record<string, unknown> | null;
  const number = normalizeUsPhone(String(row?.call_tracking_number ?? ''));
  const revision = voiceRouteRevision(row?.ai_voice_route_revision);
  if (!row || String(row.id ?? '') !== accountId || !number || revision === null) {
    return { kind: 'not_ready', currentNumber: number || null };
  }
  return { kind: 'ready', accountId, number, routeRevision: revision };
}

/**
 * Service-client proof for the exact number AI Voice is allowed to answer.
 *
 * In inbound mode (`number` only), inventory is read before an account is ever
 * resolved. In activation mode (`accountId` only), the current account number
 * is read and then required to match the same inventory row. Supplying both is
 * used when persisting signed route evidence. Every miss is deliberately the
 * same `not_ready` result, so a caller cannot distinguish an unowned number
 * from one belonging to another workspace.
 */
export async function loadSignalWireVoiceNumberReadiness(
  admin: SupabaseClient,
  input: ReadinessInput,
): Promise<SignalWireVoiceNumberReadiness> {
  const requestedAccountId = text(input.accountId);
  const hasNumberInput = input.number !== undefined;
  const requestedNumber = hasNumberInput
    ? normalizeUsPhone(String(input.number ?? ''))
    : null;
  if ((hasNumberInput && !requestedNumber) || (!requestedAccountId && !requestedNumber)) {
    return { kind: 'not_ready', currentNumber: null };
  }

  try {
    const routeTargets = signalWireVoiceRouteTargets();
    if (!routeTargets) return { kind: 'unavailable' };
    if (requestedAccountId && !requestedNumber) {
      const account = await loadAccount(admin, requestedAccountId);
      if (account.kind !== 'ready') return account;

      const { data: voiceNumber, error: voiceNumberError } = await admin
        .from('voice_number_inventory')
        .select(VOICE_NUMBER_COLUMNS)
        .eq('provider', 'signalwire')
        .eq('purpose', 'ai_voice')
        .eq('account_id', account.accountId)
        .eq('e164_number', account.number)
        .maybeSingle();
      if (voiceNumberError) {
        console.error('SignalWire voice number-inventory read failed:', voiceNumberError);
        return { kind: 'unavailable' };
      }
      const ready = readySignalWireVoiceNumber(voiceNumber, { ...account, ...routeTargets });
      return ready
        ? { kind: 'ready', number: Object.freeze({ ...ready, routeRevision: account.routeRevision }) }
        : { kind: 'not_ready', currentNumber: account.number };
    }

    // Inbound and evidence-writing mode: prove inventory before resolving an
    // account. Adding account_id to the query when supplied makes a number from
    // another workspace indistinguishable from an unprovisioned number.
    let voiceNumberQuery = admin
      .from('voice_number_inventory')
      .select(VOICE_NUMBER_COLUMNS)
      .eq('provider', 'signalwire')
      .eq('e164_number', requestedNumber as string);
    if (requestedAccountId) voiceNumberQuery = voiceNumberQuery.eq('account_id', requestedAccountId);
    const { data: voiceNumber, error: voiceNumberError } = await voiceNumberQuery.maybeSingle();
    if (voiceNumberError) {
      console.error('SignalWire voice number-inventory read failed:', voiceNumberError);
      return { kind: 'unavailable' };
    }
    const row = voiceNumber as Record<string, unknown> | null;
    const inventoryAccountId = text(row?.account_id);
    if (!inventoryAccountId) {
      return { kind: 'not_ready', currentNumber: requestedNumber };
    }
    const readyVoiceNumber = readySignalWireVoiceNumber(row, {
      accountId: requestedAccountId ?? inventoryAccountId,
      number: requestedNumber as string,
      ...routeTargets,
    });
    if (!readyVoiceNumber) return { kind: 'not_ready', currentNumber: requestedNumber };

    const account = await loadAccount(admin, readyVoiceNumber.accountId);
    if (account.kind === 'unavailable') return account;
    if (account.kind !== 'ready' || account.number !== readyVoiceNumber.number) {
      return { kind: 'not_ready', currentNumber: requestedNumber };
    }
    return {
      kind: 'ready',
      number: Object.freeze({ ...readyVoiceNumber, routeRevision: account.routeRevision }),
    };
  } catch (error) {
    console.error('SignalWire voice number readiness threw:', error);
    return { kind: 'unavailable' };
  }
}
