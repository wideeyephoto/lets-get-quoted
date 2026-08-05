'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientDetailDto } from '@/lib/client-detail';

/**
 * Loading a customer's deep detail for a master-detail pane.
 *
 * Lifted verbatim out of ClientFocusView so Smoothie can have the same behaviour
 * rather than a second copy of it that drifts. Nothing here changed in the
 * move — the cache limits, the debounce, the abort, the stale-response guard
 * and the visibility drop are the originals, and Focus now calls this.
 *
 * The model, unchanged:
 *   * The header and money strip render from the row the server already
 *     shipped, so a click paints immediately with the answer to "what do they
 *     owe me" — no spinner on the part you came for.
 *   * Everything deeper comes from /api/clients/[id]/detail behind a skeleton.
 */

const CACHE_LIMIT = 30;
const CACHE_TTL_MS = 5 * 60 * 1000;
const SELECT_DEBOUNCE_MS = 140;
const PREFETCH_DWELL_MS = 120;

type CacheEntry = { detail: ClientDetailDto; at: number };

export type ClientDetailState = {
  detail: ClientDetailDto | null;
  loading: boolean;
  error: string | null;
  /** Warm the cache after a dwell. Hover only — never keyboard traversal. */
  armPrefetch: (id: string) => void;
  cancelPrefetch: () => void;
};

export function useClientDetail({
  selectedId,
  clients,
  details,
}: {
  selectedId: string | null;
  /**
   * The list itself. Only its identity is used: the server just re-rendered, so
   * anything cached may be stale. Correctness guard, not a performance bug.
   */
  clients: unknown;
  /**
   * Pre-loaded detail, keyed by customer id. Supplying it makes the pane read from
   * memory instead of calling the API — which is what lets the logged-out demo
   * render the real component rather than a replica that drifts.
   */
  details?: Record<string, ClientDetailDto>;
}): ClientDetailState {
  const [detail, setDetail] = useState<ClientDetailDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const wantRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dwellRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    cacheRef.current.clear();
  }, [clients]);

  // A tab left open on a truck holds signed photo URLs that expire, and a
  // balance that may have been paid. Drop the cache when the window comes back.
  useEffect(() => {
    let last = 0;
    const drop = () => {
      const now = Date.now();
      if (document.visibilityState !== 'visible' || now - last < 60_000) return;
      last = now;
      cacheRef.current.clear();
    };
    document.addEventListener('visibilitychange', drop);
    window.addEventListener('focus', drop);
    return () => {
      document.removeEventListener('visibilitychange', drop);
      window.removeEventListener('focus', drop);
    };
  }, []);

  const readCache = useCallback((id: string): ClientDetailDto | null => {
    const hit = cacheRef.current.get(id);
    if (!hit) return null;
    if (Date.now() - hit.at > CACHE_TTL_MS) {
      cacheRef.current.delete(id);
      return null;
    }
    return hit.detail;
  }, []);

  const writeCache = useCallback((id: string, value: ClientDetailDto) => {
    const cache = cacheRef.current;
    cache.delete(id);
    cache.set(id, { detail: value, at: Date.now() });
    while (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }, []);

  const fetchDetail = useCallback(
    async (id: string, signal?: AbortSignal): Promise<ClientDetailDto | null> => {
      // Pre-loaded wins outright: there is no endpoint to fall back to when the
      // caller supplied its own data, and a miss here means the id is unknown.
      if (details) return details[id] ?? null;
      const response = await fetch(`/api/clients/${id}/detail`, { cache: 'no-store', signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Could not load that customer.');
      const value = body?.detail as ClientDetailDto | undefined;
      if (!value) return null;
      writeCache(id, value);
      return value;
    },
    [details, writeCache],
  );

  // Selection -> detail. Debounced so holding ArrowDown through the list fires
  // one request, not one per row.
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    wantRef.current = selectedId;

    const cached = readCache(selectedId);
    if (cached) {
      setDetail(cached);
      setLoading(false);
      setError(null);
      return;
    }

    setDetail(null);
    setLoading(true);
    setError(null);

    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      fetchDetail(selectedId, controller.signal)
        .then((value) => {
          // The response that comes back last is not necessarily the one for the
          // row that's highlighted. Without this, a slow request for customer A can
          // paint A's balance under B's name — silent, and the kind of mistake
          // that gets a payment link sent to the wrong homeowner.
          if (wantRef.current !== selectedId) return;
          setDetail(value);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted || wantRef.current !== selectedId) return;
          setError(err instanceof Error ? err.message : 'Could not load that customer.');
          setLoading(false);
        });
    }, SELECT_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [selectedId, readCache, fetchDetail]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const armPrefetch = useCallback(
    (id: string) => {
      if (readCache(id) || id === selectedId) return;
      if (dwellRef.current) clearTimeout(dwellRef.current);
      dwellRef.current = setTimeout(() => {
        fetchDetail(id).catch(() => {});
      }, PREFETCH_DWELL_MS);
    },
    [readCache, selectedId, fetchDetail],
  );

  const cancelPrefetch = useCallback(() => {
    if (dwellRef.current) clearTimeout(dwellRef.current);
  }, []);

  return { detail, loading, error, armPrefetch, cancelPrefetch };
}
