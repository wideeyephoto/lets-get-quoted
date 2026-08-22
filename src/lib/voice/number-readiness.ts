import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { normalizeUsPhone } from '@/lib/phone';

const SIGNALWIRE_RESOURCE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SENDER_COLUMNS = [
  'id',
  'provider',
  'e164_number',
  'provider_number_id',
  'purpose',
  'account_id',
  'assignment_state',
  'provisioning_status',
  'inbound_ready',
  'activated_at',
  'suspended_at',
].join(', ');

export type SignalWireVoiceNumber = Readonly<{
  accountId: string;
  number: string;
  senderNumberId: string;
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

type SenderExpectation = Readonly<{ accountId: string; number: string }>;

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
export function readySignalWireVoiceSender(
  value: unknown,
  expected: SenderExpectation,
): Omit<SignalWireVoiceNumber, 'routeRevision'> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const number = normalizeUsPhone(String(row.e164_number ?? ''));
  const providerNumberId = text(row.provider_number_id);
  const senderNumberId = text(row.id);
  const accountId = text(row.account_id);

  if (
    row.provider !== 'signalwire'
    || row.purpose !== 'contractor_dedicated'
    || accountId !== expected.accountId
    || number !== expected.number
    || row.provisioning_status !== 'active'
    || row.assignment_state !== 'assigned'
    || row.inbound_ready !== true
    || !text(row.activated_at)
    || row.suspended_at !== null
    || !senderNumberId
    || !providerNumberId
    || !SIGNALWIRE_RESOURCE_ID.test(providerNumberId)
  ) return null;

  return Object.freeze({
    accountId,
    number,
    senderNumberId,
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
    if (requestedAccountId && !requestedNumber) {
      const account = await loadAccount(admin, requestedAccountId);
      if (account.kind !== 'ready') return account;

      const { data: sender, error: senderError } = await admin
        .from('sms_sender_numbers')
        .select(SENDER_COLUMNS)
        .eq('provider', 'signalwire')
        .eq('purpose', 'contractor_dedicated')
        .eq('account_id', account.accountId)
        .eq('e164_number', account.number)
        .maybeSingle();
      if (senderError) {
        console.error('SignalWire voice sender-inventory read failed:', senderError);
        return { kind: 'unavailable' };
      }
      const ready = readySignalWireVoiceSender(sender, account);
      return ready
        ? { kind: 'ready', number: Object.freeze({ ...ready, routeRevision: account.routeRevision }) }
        : { kind: 'not_ready', currentNumber: account.number };
    }

    // Inbound and evidence-writing mode: prove inventory before resolving an
    // account. Adding account_id to the query when supplied makes a number from
    // another workspace indistinguishable from an unprovisioned number.
    let senderQuery = admin
      .from('sms_sender_numbers')
      .select(SENDER_COLUMNS)
      .eq('provider', 'signalwire')
      .eq('e164_number', requestedNumber as string);
    if (requestedAccountId) senderQuery = senderQuery.eq('account_id', requestedAccountId);
    const { data: sender, error: senderError } = await senderQuery.maybeSingle();
    if (senderError) {
      console.error('SignalWire voice sender-inventory read failed:', senderError);
      return { kind: 'unavailable' };
    }
    const row = sender as Record<string, unknown> | null;
    const inventoryAccountId = text(row?.account_id);
    if (!inventoryAccountId) {
      return { kind: 'not_ready', currentNumber: requestedNumber };
    }
    const readySender = readySignalWireVoiceSender(row, {
      accountId: requestedAccountId ?? inventoryAccountId,
      number: requestedNumber as string,
    });
    if (!readySender) return { kind: 'not_ready', currentNumber: requestedNumber };

    const account = await loadAccount(admin, readySender.accountId);
    if (account.kind === 'unavailable') return account;
    if (account.kind !== 'ready' || account.number !== readySender.number) {
      return { kind: 'not_ready', currentNumber: requestedNumber };
    }
    return {
      kind: 'ready',
      number: Object.freeze({ ...readySender, routeRevision: account.routeRevision }),
    };
  } catch (error) {
    console.error('SignalWire voice number readiness threw:', error);
    return { kind: 'unavailable' };
  }
}
