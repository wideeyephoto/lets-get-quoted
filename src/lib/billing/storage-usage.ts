import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The storage allowance: reading it, and refusing an upload that would exceed it.
 *
 * The measurement itself is not computed here. 20260819000000 sweeps
 * storage.objects into workspace_storage_usage, because Supabase Storage already
 * keeps an authoritative row per object and the alternative was bookkeeping at
 * seven upload sites and seven delete sites. This module reads that number,
 * pairs it with the effective limit, and decides one upload.
 *
 * TWO THINGS ARE DELIBERATELY NOT ERRORS, and both fail OPEN:
 *
 *   A workspace the sweep has not reached yet has no row, and a null
 *   measurement is not a zero one. Treating "unknown" as "empty" would be
 *   generous; treating it as "full" would block every upload in the workspace.
 *   Neither is a fact, so the guard admits the file and the surface says the
 *   number is not known yet.
 *
 *   A workspace with no entitlement row has no known limit. Returning 0 there
 *   would mean "allowed nothing", which would stop a contractor uploading a job
 *   photo because a billing row was never provisioned. Storage is a billing
 *   boundary, not a security one, and the failure mode that costs money is
 *   strictly better than the one that breaks the field app.
 */

/**
 * Mirrors public.workspace_storage_metered_buckets(). A test asserts the two
 * lists agree, because a bucket in one and not the other is storage that is
 * either charged and not guarded or guarded and not charged.
 */
export const METERED_STORAGE_BUCKETS = [
  'job-photos',
  'lead-photos',
  'crew-photos',
  'insurance-proof',
  'site-images',
  'site-videos',
  'account-attachments',
] as const;

export type MeteredStorageBucket = (typeof METERED_STORAGE_BUCKETS)[number];

/**
 * 1 GB = 2^30 bytes, matching workspace_storage_limit_bytes. The binary reading
 * is the larger one, so a workspace that bought 100 GB is never cut off short of
 * the number it was sold.
 */
export const BYTES_PER_GB = 1_073_741_824;

export const STORAGE_CAP_ENFORCEMENT_FLAG = 'LGQ_STORAGE_CAP_ENFORCED' as const;

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * Enforcement ships dark. Turning it on before the first sweep has run, or with
 * a bucket list that does not match what the app writes, would refuse real
 * uploads from contractors standing on a roof. Anything except the exact value
 * `1` is off, including a missing or misspelled value -- the house pattern.
 */
export function storageCapEnforcementEnabled(env: ServerEnvironment = process.env): boolean {
  return env[STORAGE_CAP_ENFORCEMENT_FLAG] === '1';
}

export type WorkspaceStorageState = Readonly<{
  /** Null means the sweep has not measured this workspace. It must not be shown as zero. */
  bytesUsed: number | null;
  objectCount: number | null;
  measuredAt: string | null;
  /** Null means no entitlement row, so no known limit. Not the same as a limit of zero. */
  limitBytes: number | null;
}>;

type StorageStateRow = {
  bytes_used: unknown;
  object_count: unknown;
  measured_at: unknown;
  limit_bytes: unknown;
};

/**
 * bigint columns arrive from PostgREST as a number when they fit and a string
 * when the client is configured to preserve them, so both are accepted. A value
 * that is neither is billing data we cannot reinterpret, and becomes null rather
 * than a guess.
 */
function safeNonNegativeInteger(value: unknown): number | null {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof parsed === 'number' && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function optionalIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

export function normalizeStorageState(row: StorageStateRow | null): WorkspaceStorageState {
  if (!row) return { bytesUsed: null, objectCount: null, measuredAt: null, limitBytes: null };
  return {
    bytesUsed: safeNonNegativeInteger(row.bytes_used),
    objectCount: safeNonNegativeInteger(row.object_count),
    measuredAt: optionalIso(row.measured_at),
    limitBytes: safeNonNegativeInteger(row.limit_bytes),
  };
}

/**
 * workspace_storage_state_v1 returns exactly one row by construction, but a
 * `returns table` RPC still arrives as an array. An empty array means the call
 * itself did not behave as declared, which is unknown rather than empty.
 */
export async function loadWorkspaceStorageState(
  admin: SupabaseClient,
  accountId: string,
): Promise<WorkspaceStorageState> {
  const { data, error } = await admin.rpc('workspace_storage_state_v1', { p_account_id: accountId });
  if (error) {
    console.error('loadWorkspaceStorageState failed:', error);
    return { bytesUsed: null, objectCount: null, measuredAt: null, limitBytes: null };
  }
  const rows = Array.isArray(data) ? (data as StorageStateRow[]) : [];
  return normalizeStorageState(rows[0] ?? null);
}

export type StorageAdmission =
  | Readonly<{ kind: 'allowed' }>
  /** No measurement yet. Named separately so a caller can log why it let a byte through. */
  | Readonly<{ kind: 'allowed_unmeasured' }>
  /** No entitlement row, so no known limit. */
  | Readonly<{ kind: 'allowed_no_limit' }>
  /** Enforcement flag is off. The decision was computed and then not applied. */
  | Readonly<{ kind: 'allowed_not_enforced'; wouldRefuse: boolean }>
  | Readonly<{
    kind: 'refused';
    bytesUsed: number;
    limitBytes: number;
    incomingBytes: number;
  }>;

/**
 * Decide one upload. Pure, so the fail-open branches can be tested without a
 * database -- they are the ones most likely to be got wrong and least likely to
 * be noticed, because every one of them looks like success.
 *
 * The comparison is `used + incoming > limit`, so a file that lands exactly on
 * the cap is allowed. A workspace with 5 GB allowed and 5 GB stored is at its
 * limit, not over it, and the next byte is what crosses.
 */
export function decideStorageAdmission(
  state: WorkspaceStorageState,
  incomingBytes: number,
  enforced: boolean,
): StorageAdmission {
  const incoming = Number.isSafeInteger(incomingBytes) && incomingBytes >= 0 ? incomingBytes : 0;

  if (state.limitBytes === null) return { kind: 'allowed_no_limit' };
  if (state.bytesUsed === null) return { kind: 'allowed_unmeasured' };

  const wouldRefuse = state.bytesUsed + incoming > state.limitBytes;
  if (!enforced) return { kind: 'allowed_not_enforced', wouldRefuse };
  if (!wouldRefuse) return { kind: 'allowed' };

  return {
    kind: 'refused',
    bytesUsed: state.bytesUsed,
    limitBytes: state.limitBytes,
    incomingBytes: incoming,
  };
}

/** One decimal place, and never a bare byte count -- 5.4 GB, not 5798205849 bytes. */
export function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  const gb = bytes / BYTES_PER_GB;
  return `${gb < 10 ? gb.toFixed(1) : gb.toFixed(0)} GB`;
}

/**
 * The sentence an owner sees when an upload is refused. It has to say what is
 * stored, what is allowed, and what to do -- a bare "storage full" leaves them
 * with no next step and a photo they still need to attach.
 */
export function storageRefusalMessage(admission: Extract<StorageAdmission, { kind: 'refused' }>): string {
  return `This workspace is using ${formatStorageBytes(admission.bytesUsed)} of its ${formatStorageBytes(admission.limitBytes)} storage allowance, so this ${formatStorageBytes(admission.incomingBytes)} upload would put it over. Delete files you no longer need, or add storage from Settings, then try again.`;
}

/**
 * Guard an upload. Throws only when enforcement is on AND the workspace is
 * measured AND the limit is known AND the file would cross it.
 *
 * Called with the incoming byte count BEFORE the upload, so the file never
 * reaches the bucket it would have overfilled. The measurement it reads is stale
 * by up to one sweep, which is the documented cost of not summing every object
 * on every upload.
 */
export async function assertStorageCapacity(
  admin: SupabaseClient,
  accountId: string,
  incomingBytes: number,
  env: ServerEnvironment = process.env,
): Promise<StorageAdmission> {
  const state = await loadWorkspaceStorageState(admin, accountId);
  const admission = decideStorageAdmission(state, incomingBytes, storageCapEnforcementEnabled(env));
  if (admission.kind === 'refused') throw new Error(storageRefusalMessage(admission));
  return admission;
}
