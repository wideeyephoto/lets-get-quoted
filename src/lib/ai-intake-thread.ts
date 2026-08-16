export const AI_INTAKE_THREAD_TTL_MS = 24 * 60 * 60 * 1000;

export const AI_INTAKE_FLOW_KINDS = ['smart_intake', 'instant_booking'] as const;
export type AiIntakeFlowKind = (typeof AI_INTAKE_FLOW_KINDS)[number];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ThreadRecord = Readonly<{ id: string; issuedAt: number }>;

export type SessionStorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function storageKey(siteId: string, flowKind: AiIntakeFlowKind): string {
  return `lgq:ai-intake-thread:v1:${flowKind}:${siteId}`;
}

function parseRecord(raw: string | null, now: number): ThreadRecord | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ThreadRecord>;
    if (!UUID_PATTERN.test(value.id ?? '') || !Number.isFinite(value.issuedAt)) return null;
    const age = now - Number(value.issuedAt);
    if (age < 0 || age >= AI_INTAKE_THREAD_TTL_MS) return null;
    return { id: String(value.id).toLowerCase(), issuedAt: Number(value.issuedAt) };
  } catch {
    return null;
  }
}

function randomUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  throw new Error('This browser cannot create a secure AI Intake thread ID.');
}

function browserSessionStorage(): SessionStorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * One opaque capability per site/flow/browser tab. The server still resolves
 * the published site and workspace; this value is never tenant authority.
 */
export function getOrCreateAiIntakeThread(input: {
  siteId: string;
  flowKind: AiIntakeFlowKind;
  storage?: SessionStorageLike | null;
  now?: number;
  createUuid?: () => string;
}): ThreadRecord {
  const now = input.now ?? Date.now();
  const storage = input.storage === undefined
    ? browserSessionStorage()
    : input.storage;
  const key = storageKey(input.siteId, input.flowKind);
  let raw: string | null = null;
  try {
    raw = storage?.getItem(key) ?? null;
  } catch {
    // Some privacy modes expose sessionStorage but throw on access. The
    // caller's ref still keeps the generated token stable for this mount.
  }
  const existing = parseRecord(raw, now);
  if (existing) return existing;

  const id = (input.createUuid ?? randomUuid)().toLowerCase();
  if (!UUID_PATTERN.test(id)) throw new Error('AI Intake thread IDs must be secure UUIDs.');
  const created = Object.freeze({ id, issuedAt: now });
  try {
    storage?.setItem(key, JSON.stringify(created));
  } catch {
    // Privacy-mode storage failure still leaves a stable ID for this mount via
    // the caller's ref; it simply cannot survive a reload.
  }
  return created;
}

export function isAiIntakeFlowKind(value: unknown): value is AiIntakeFlowKind {
  return typeof value === 'string' && AI_INTAKE_FLOW_KINDS.includes(value as AiIntakeFlowKind);
}

export function isAiIntakeThreadId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}
