import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AI_INTAKE_THREAD_TTL_MS,
  isAiIntakeFlowKind,
  isAiIntakeThreadId,
  type AiIntakeFlowKind,
} from '@/lib/ai-intake-thread';

export const AI_INTAKE_USAGE_FLAG = 'LGQ_AI_INTAKE_USAGE_GATE_ENABLED' as const;
export const AI_INTAKE_RESOURCE_CODE = 'ai_intake_threads' as const;
export const AI_INTAKE_OPERATION_TYPE = 'ai_intake' as const;
export const AI_INTAKE_PROVIDER_ATTEMPT_LIMIT = 10;
export const AI_INTAKE_PROVIDER_ATTEMPT_WINDOW_SECONDS = 24 * 60 * 60;

const RESERVATION_TTL_MS = 15 * 60 * 1000;
const RESERVATION_SCHEMA = 'ai_intake_thread_v1';

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

export function aiIntakeUsageGateEnabled(env: ServerEnvironment = process.env): boolean {
  return env[AI_INTAKE_USAGE_FLAG] === '1';
}

type ReservationMetadata = Readonly<{
  schema: typeof RESERVATION_SCHEMA;
  account_id: string;
  site_id: string;
  thread_id: string;
  flow_kind: AiIntakeFlowKind;
  claim_nonce: string;
}>;

type ReservationRow = Readonly<{
  id: string;
  account_id: string;
  resource_code: string;
  operation_type: string;
  idempotency_key: string;
  state: string;
  finalization_key: string | null;
  metadata: unknown;
  created_at: string;
  expires_at: string;
}>;

export type AiIntakeUsageInput = Readonly<{
  accountId: string;
  siteId: string;
  threadId: string;
  flowKind: AiIntakeFlowKind;
}>;

export type AiIntakeUsageLease = Readonly<{
  kind: 'allowed';
  reservationId: string;
  idempotencyKey: string;
  finalizationKey: string;
  state: 'reserved' | 'committed';
  ownsReservation: boolean;
}>;

export type AiIntakeUsageDecision =
  | Readonly<{ kind: 'disabled' }>
  | AiIntakeUsageLease
  | Readonly<{
      kind: 'classic_fallback';
      reason: 'invalid_thread' | 'unavailable' | 'no_credits' | 'finalized' | 'expired';
    }>;

export async function allowAiIntakeProviderAttempt(
  lease: AiIntakeUsageLease | null,
  limiter: (bucket: string, limit: number, windowSeconds: number) => Promise<boolean>,
): Promise<boolean> {
  // A null lease means the rollout is dark. Preserve legacy behavior without
  // touching either the new-thread or per-thread limiter.
  if (!lease) return true;
  return limiter(
    `ai-intake:provider:${lease.idempotencyKey}`,
    AI_INTAKE_PROVIDER_ATTEMPT_LIMIT,
    AI_INTAKE_PROVIDER_ATTEMPT_WINDOW_SECONDS,
  );
}

type UsageDependencies = Readonly<{
  now?: () => Date;
  allowNewThread?: () => Promise<boolean>;
}>;

function digest(parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex');
}

export function buildAiIntakeUsageIdentity(input: AiIntakeUsageInput): Readonly<{
  idempotencyKey: string;
  finalizationKey: string;
}> {
  const value = digest([
    'ai_intake_thread_v1',
    input.accountId,
    input.siteId,
    input.flowKind,
    input.threadId.toLowerCase(),
  ]);
  return Object.freeze({
    idempotencyKey: `ai-intake:v1:${value}`,
    finalizationKey: `ai-intake:v1:${value}:commit`,
  });
}

function metadataRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function rowMatches(input: {
  row: ReservationRow;
  request: AiIntakeUsageInput;
  idempotencyKey: string;
}): input is typeof input & { row: ReservationRow & { metadata: ReservationMetadata } } {
  const metadata = metadataRecord(input.row.metadata);
  return Boolean(
    metadata
    && input.row.account_id === input.request.accountId
    && input.row.resource_code === AI_INTAKE_RESOURCE_CODE
    && input.row.operation_type === AI_INTAKE_OPERATION_TYPE
    && input.row.idempotency_key === input.idempotencyKey
    && metadata.schema === RESERVATION_SCHEMA
    && metadata.account_id === input.request.accountId
    && metadata.site_id === input.request.siteId
    && metadata.thread_id === input.request.threadId.toLowerCase()
    && metadata.flow_kind === input.request.flowKind
    && isAiIntakeThreadId(metadata.claim_nonce),
  );
}

function insufficientCredits(error: { code?: string; message?: string } | null): boolean {
  return error?.code === 'P0001' && /insufficient usage credits/i.test(error.message ?? '');
}

const RESERVATION_COLUMNS = 'id, account_id, resource_code, operation_type, idempotency_key, state, finalization_key, metadata, created_at, expires_at';

async function readReservation(
  admin: SupabaseClient,
  input: Readonly<{ accountId: string; idempotencyKey: string; reservationId?: string }>,
): Promise<Readonly<{ row: ReservationRow | null; unavailable: boolean }>> {
  try {
    let query = admin
      .from('usage_reservations')
      .select(RESERVATION_COLUMNS)
      .eq('account_id', input.accountId)
      .eq('resource_code', AI_INTAKE_RESOURCE_CODE)
      .eq('idempotency_key', input.idempotencyKey);
    if (input.reservationId) query = query.eq('id', input.reservationId);
    const { data, error } = await query.maybeSingle();
    return Object.freeze({
      row: error || !data ? null : data as ReservationRow,
      unavailable: Boolean(error),
    });
  } catch {
    return Object.freeze({ row: null, unavailable: true });
  }
}

function inspectReservation(input: Readonly<{
  row: ReservationRow;
  request: AiIntakeUsageInput;
  identity: Readonly<{ idempotencyKey: string; finalizationKey: string }>;
  now: Date;
  claimNonce?: string;
}>): AiIntakeUsageDecision {
  const { row, request, identity, now, claimNonce } = input;
  if (!rowMatches({ row, request, idempotencyKey: identity.idempotencyKey })) {
    return Object.freeze({ kind: 'classic_fallback', reason: 'unavailable' });
  }
  const metadata = row.metadata as ReservationMetadata;
  const createdAt = Date.parse(row.created_at);
  if (!Number.isFinite(createdAt) || createdAt > now.getTime() + 60_000) {
    return Object.freeze({ kind: 'classic_fallback', reason: 'unavailable' });
  }
  if (now.getTime() - createdAt >= AI_INTAKE_THREAD_TTL_MS) {
    return Object.freeze({ kind: 'classic_fallback', reason: 'expired' });
  }

  if (row.state === 'committed') {
    if (row.finalization_key !== identity.finalizationKey) {
      return Object.freeze({ kind: 'classic_fallback', reason: 'unavailable' });
    }
    return Object.freeze({
      kind: 'allowed',
      reservationId: row.id,
      ...identity,
      state: 'committed',
      ownsReservation: false,
    });
  }
  if (row.state === 'released' || row.state === 'expired') {
    return Object.freeze({ kind: 'classic_fallback', reason: 'finalized' });
  }
  if (row.state !== 'reserved') {
    return Object.freeze({ kind: 'classic_fallback', reason: 'unavailable' });
  }
  const expiresAt = Date.parse(row.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
    // Do not buy a provider call on a stale row while waiting for the expiry
    // sweeper. The SQL commit would reject it after the paid work was done.
    return Object.freeze({ kind: 'classic_fallback', reason: 'expired' });
  }
  // A stable reserved row may be retried after a process/network interruption,
  // but only the request whose nonce the atomic reserve stored may release it.
  // A concurrent idempotent loser (or a later recovery request) can still
  // commit substantive work, but cannot refund a reservation another request
  // may be using in flight.
  return Object.freeze({
    kind: 'allowed',
    reservationId: row.id,
    ...identity,
    state: 'reserved',
    ownsReservation: Boolean(claimNonce && metadata.claim_nonce === claimNonce),
  });
}

/**
 * Reserve one thread credit. The published-site lookup happens in the route;
 * this helper accepts only that server-resolved account/site pair.
 */
export async function beginAiIntakeUsage(
  admin: SupabaseClient,
  input: AiIntakeUsageInput,
  options: Readonly<{ enabled?: boolean; dependencies?: UsageDependencies }> = {},
): Promise<AiIntakeUsageDecision> {
  const enabled = options.enabled ?? aiIntakeUsageGateEnabled();
  if (!enabled) return Object.freeze({ kind: 'disabled' });
  if (!isAiIntakeThreadId(input.threadId) || !isAiIntakeFlowKind(input.flowKind)) {
    return Object.freeze({ kind: 'classic_fallback', reason: 'invalid_thread' });
  }

  const now = (options.dependencies?.now ?? (() => new Date()))();
  const normalizedInput = Object.freeze({ ...input, threadId: input.threadId.toLowerCase() });
  const identity = buildAiIntakeUsageIdentity(normalizedInput);
  const claimNonce = randomUUID().toLowerCase();
  const metadata: ReservationMetadata = Object.freeze({
    schema: RESERVATION_SCHEMA,
    account_id: normalizedInput.accountId,
    site_id: normalizedInput.siteId,
    thread_id: normalizedInput.threadId,
    flow_kind: normalizedInput.flowKind,
    claim_nonce: claimNonce,
  });

  // Follow-ups for an already reserved/committed 24-hour thread do not spend
  // the new-thread anti-drain allowance. A lookup failure is uncertainty about
  // whether this is new, so fail closed to the classic form before paid work.
  const existing = await readReservation(admin, {
    accountId: normalizedInput.accountId,
    idempotencyKey: identity.idempotencyKey,
  });
  if (existing.unavailable) {
    return Object.freeze({ kind: 'classic_fallback', reason: 'unavailable' });
  }
  if (existing.row) {
    return inspectReservation({
      row: existing.row,
      request: normalizedInput,
      identity,
      now,
    });
  }
  if (!options.dependencies?.allowNewThread) {
    return Object.freeze({ kind: 'classic_fallback', reason: 'unavailable' });
  }
  try {
    if (!(await options.dependencies.allowNewThread())) {
      return Object.freeze({ kind: 'classic_fallback', reason: 'unavailable' });
    }
  } catch {
    return Object.freeze({ kind: 'classic_fallback', reason: 'unavailable' });
  }

  let reservationIdValue: unknown;
  let reserveError: { code?: string; message?: string } | null;
  try {
    const result = await admin.rpc('reserve_usage_credits', {
      p_account_id: normalizedInput.accountId,
      p_resource_code: AI_INTAKE_RESOURCE_CODE,
      p_units: 1,
      p_idempotency_key: identity.idempotencyKey,
      p_operation_type: AI_INTAKE_OPERATION_TYPE,
      p_expires_at: new Date(now.getTime() + RESERVATION_TTL_MS).toISOString(),
      p_metadata: metadata,
    });
    reservationIdValue = result.data;
    reserveError = result.error;
  } catch {
    return Object.freeze({ kind: 'classic_fallback', reason: 'unavailable' });
  }
  if (reserveError) {
    return Object.freeze({
      kind: 'classic_fallback',
      reason: insufficientCredits(reserveError) ? 'no_credits' : 'unavailable',
    });
  }
  if (typeof reservationIdValue !== 'string' || !isAiIntakeThreadId(reservationIdValue)) {
    return Object.freeze({ kind: 'classic_fallback', reason: 'unavailable' });
  }

  const reserved = await readReservation(admin, {
    accountId: normalizedInput.accountId,
    idempotencyKey: identity.idempotencyKey,
    reservationId: reservationIdValue,
  });
  if (reserved.unavailable || !reserved.row) {
    return Object.freeze({ kind: 'classic_fallback', reason: 'unavailable' });
  }
  return inspectReservation({
    row: reserved.row,
    request: normalizedInput,
    identity,
    now,
    claimNonce,
  });
}

export async function commitAiIntakeUsage(
  admin: SupabaseClient,
  lease: AiIntakeUsageLease,
): Promise<boolean> {
  if (lease.state === 'committed') return true;
  const { data, error } = await admin.rpc('commit_usage_reservation', {
    p_reservation_id: lease.reservationId,
    p_finalization_key: lease.finalizationKey,
  });
  return !error && data === true;
}

export async function releaseAiIntakeUsage(
  admin: SupabaseClient,
  lease: AiIntakeUsageLease,
  reason: string,
): Promise<boolean> {
  if (!lease.ownsReservation || lease.state !== 'reserved') return false;
  const { data, error } = await admin.rpc('release_usage_reservation', {
    p_reservation_id: lease.reservationId,
    p_finalization_key: lease.finalizationKey,
    p_reason: reason.slice(0, 500),
  });
  return !error && data === true;
}
