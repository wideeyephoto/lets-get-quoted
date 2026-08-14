'use client';

// The browser half of the offline queue.
//
// The rule is deliberately narrow: when the browser says it is online, NOTHING
// here runs and the ordinary server action handles the submit exactly as it
// always did. Offline support that quietly reroutes the normal path is offline
// support that breaks the normal path, and the normal path is the one that runs
// ten thousand times a day.
//
// When the browser says it is offline, the submit is intercepted and posted as
// JSON to /field/api/queue instead. The service worker's fetch handler catches
// the failure, writes it to IndexedDB and answers 202 — so from here it looks
// like an ordinary request that succeeded, which is the whole trick.

export type FieldQueueKind = 'clock-in' | 'clock-out' | 'time' | 'material' | 'note';

export type QueueOutcome =
  /** Held on the phone. It'll send itself. */
  | { state: 'queued' }
  /** It actually reached the server. */
  | { state: 'sent' }
  /** No service worker, or the request was refused outright. */
  | { state: 'failed'; message: string };

/**
 * navigator.onLine is a WEAK signal — it means "there is a network interface",
 * not "there is internet". It is used here only to decide whether to try the
 * normal path first, and being wrong in either direction is recoverable: a
 * false "online" falls through to the service worker's queue on the failed
 * fetch, and a false "offline" queues something that sends seconds later.
 */
export function looksOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function newKey(): string {
  const cryptoRef = typeof crypto !== 'undefined' ? crypto : undefined;
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();
  // Older WebViews. Uniqueness only has to hold within one crew member's queue.
  return `k${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** What each kind of submission carries. Mirrors the route's Payload type. */
export function payloadFor(kind: FieldQueueKind, form: HTMLFormElement): Record<string, unknown> {
  const data = new FormData(form);
  const text = (name: string) => String(data.get(name) ?? '').trim();

  switch (kind) {
    case 'clock-in':
      return {};
    case 'clock-out':
      return { note: text('description') || null };
    case 'time':
      return { hours: Number(data.get('hours')), description: text('description') };
    case 'material':
      return { description: text('description'), amount: Number(data.get('amount')) };
    case 'note':
      return { body: text('body'), share: data.get('share') === 'on' };
  }
}

export async function queueFieldSubmission(
  kind: FieldQueueKind,
  jobId: string,
  payload: Record<string, unknown>,
): Promise<QueueOutcome> {
  const body = JSON.stringify({
    kind,
    jobId,
    key: newKey(),
    // The phone's clock, because the moment this happened is not the moment it
    // sends. The server bounds it — see resolveOfflineTime.
    at: new Date().toISOString(),
    ...payload,
  });

  try {
    const response = await fetch('/field/api/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      credentials: 'include',
    });
    // 202 is the service worker saying "I've kept it". Anything else 2xx means
    // it genuinely reached the server.
    if (response.status === 202) return { state: 'queued' };
    if (response.ok) return { state: 'sent' };
    const detail = await response.json().catch(() => null);
    return { state: 'failed', message: (detail as { error?: string } | null)?.error || 'That didn’t save.' };
  } catch {
    // No service worker registered (first load, or a browser that refused it),
    // so there is nothing holding the request. Say so rather than pretending.
    return {
      state: 'failed',
      message: 'You’re offline and this phone hasn’t finished setting up offline saving yet. Try again in signal.',
    };
  }
}
