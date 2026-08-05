'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { ClientDetailDto } from '@/lib/client-detail';
import { avatarTone } from '@/lib/avatar-tone';
import { hueFor } from '../RecordCover';
import type { ClientRow } from './ClientsWorkspace';
import styles from '../focus.module.css';

// Master-detail for the customer book — the same shape leads and jobs use,
// sharing their stylesheet, so moving between the three doesn't mean learning a
// third layout.
//
// What's different is what a customer IS. A lead is a race against a clock and a
// job is work in flight; a customer is a RELATIONSHIP, and the numbers that
// describe one are cumulative rather than urgent: how many times they've hired
// you, what that came to, what's still owed, and how long since you last saw
// them. So the strip along the bottom counts history, and the one figure allowed
// to be loud is money still outstanding.
//
// Loading model, unchanged from the other two panes:
//   * The header and stats render from the ClientRow the server already shipped,
//     so a click paints immediately — no spinner on the part you came for.
//   * Everything deeper (jobs, payments, notes) comes from
//     /api/clients/[id]/detail behind a skeleton.

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'money', label: 'Money' },
  { id: 'notes', label: 'Notes' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const CACHE_LIMIT = 30;
const CACHE_TTL_MS = 5 * 60 * 1000;
const SELECT_DEBOUNCE_MS = 140;
const PREFETCH_DWELL_MS = 120;

type CacheEntry = { detail: ClientDetailDto; at: number };

export default function ClientFocusView({
  clients,
  selectedId,
  onSelect,
  basePath = '/dashboard',
}: {
  clients: ClientRow[];
  /** Owned by the workspace, so search and the other views stay in step. */
  selectedId: string | null;
  onSelect: (clientId: string) => void;
  /** The logged-out demo passes '/demo' so its links stay inside it. */
  basePath?: string;
}) {
  const base = basePath;
  const [detail, setDetail] = useState<ClientDetailDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('overview');

  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const wantRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dwellRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = useMemo(
    () => clients.find((client) => client.id === selectedId) ?? null,
    [clients, selectedId],
  );

  // The server just re-rendered — which is also what happens after adding a
  // customer — so anything cached may be stale. Correctness guard, not a
  // performance bug: leave it alone.
  useEffect(() => {
    cacheRef.current.clear();
  }, [clients]);

  // A tab left open in a truck holds a balance that may since have been paid.
  // Drop the cache when the window comes back.
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
      const response = await fetch(`/api/clients/${id}/detail`, { cache: 'no-store', signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Could not load that customer.');
      const value = body?.detail as ClientDetailDto | undefined;
      if (!value) return null;
      writeCache(id, value);
      return value;
    },
    [writeCache],
  );

  // Load whoever is selected, debounced — arrowing down a long list would
  // otherwise fire a request per row passed through.
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

    setLoading(true);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      fetchDetail(selectedId, controller.signal)
        .then((value) => {
          // A slower earlier request must never overwrite a newer selection.
          if (wantRef.current !== selectedId) return;
          setDetail(value);
          setLoading(false);
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted || wantRef.current !== selectedId) return;
          setError(cause instanceof Error ? cause.message : 'Could not load that customer.');
          setLoading(false);
        });
    }, SELECT_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [selectedId, readCache, fetchDetail]);

  function armPrefetch(id: string) {
    if (readCache(id) || id === selectedId) return;
    if (dwellRef.current) clearTimeout(dwellRef.current);
    dwellRef.current = setTimeout(() => {
      fetchDetail(id).catch(() => {});
    }, PREFETCH_DWELL_MS);
  }
  function cancelPrefetch() {
    if (dwellRef.current) clearTimeout(dwellRef.current);
  }

  // Rows are real links: cmd/middle-click opens the full profile in a new tab,
  // and the URL is copyable. A plain <button> would silently kill all of that —
  // which is exactly what the old Clients focus list did.
  function rowClick(event: React.MouseEvent, id: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    onSelect(id);
  }

  function onListKeyDown(event: React.KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const index = clients.findIndex((client) => client.id === selectedId);
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
    if (next < 0 || next >= clients.length) return;
    onSelect(clients[next].id);
  }

  if (clients.length === 0) {
    return <p className="empty-state">No customers to show.</p>;
  }

  // Deep panels render only when the payload matches the highlighted row, so a
  // stale response can never interleave with the shell.
  const fresh = detail && detail.id === selectedId ? detail : null;

  return (
    <div className={styles.focus}>
      <section className={styles.pane} aria-label="Selected customer">
        {selected ? (
          <>
            <header className={styles.hero}>
              <div className={styles.heroLayout}>
                {/* A customer has no photos, so the monogram IS the cover —
                    drawn on the same hashed wash the jobs and leads panes fall
                    back to, with initials where their trade glyph goes. Same
                    hue function, so a customer sits beside a job without
                    looking like it came from a different app. */}
                <figure
                  className={styles.cover}
                  style={{ '--cover-hue': hueFor(selected.id) } as React.CSSProperties}
                  aria-hidden="true"
                >
                  <span className={styles.coverArt}>
                    <span className={styles.coverMono}>{selected.initials}</span>
                  </span>
                </figure>

                <div className={styles.heroCopy}>
                  <p className={styles.heroTag}>Selected customer</p>
                  <div className={styles.heroTop}>
                    <h2>{selected.name}</h2>
                  </div>

                  <div className={styles.chips}>
                    {selected.isRepeat ? <span className={styles.repeat}>Repeat customer</span> : null}
                    {fresh && fresh.openJobCount > 0 ? (
                      <span className="status-badge">
                        {fresh.openJobCount} job{fresh.openJobCount === 1 ? '' : 's'} open
                      </span>
                    ) : null}
                    {fresh && fresh.totals.outstanding > 0 ? (
                      <span className={styles.owed}>{fresh.totals.outstandingLabel} owed</span>
                    ) : null}
                  </div>

                  <dl className={styles.heroMeta}>
                    <div>
                      <dt>Phone</dt>
                      <dd>{selected.phoneLabel || 'None on file'}</dd>
                    </div>
                    <div>
                      <dt>Email</dt>
                      <dd>{selected.email || 'None on file'}</dd>
                    </div>
                    <div>
                      <dt>Where</dt>
                      <dd>{selected.address || 'No address given'}</dd>
                    </div>
                  </dl>

                  {/* Straight off the row — on screen the instant you click. */}
                  <div className={styles.heroStats}>
                    <span>
                      <small>Jobs</small>
                      <strong>{selected.jobsLabel}</strong>
                    </span>
                    <span>
                      <small>Total billed</small>
                      <strong>{selected.totalLabel}</strong>
                    </span>
                    <span>
                      <small>Last job</small>
                      <strong>{selected.lastLabel}</strong>
                    </span>
                  </div>

                  <div className={styles.heroActions}>
                    {selected.phone ? (
                      <a className="btn primary" href={`tel:${selected.phone}`}>📞 Call</a>
                    ) : null}
                    {selected.phone ? (
                      <a className="btn secondary" href={`sms:${selected.phone}`}>💬 Text</a>
                    ) : null}
                    {selected.email ? (
                      <a className="btn secondary" href={`mailto:${selected.email}`}>✉️ Email</a>
                    ) : null}
                    <Link className="btn ghost" href={`${base}/clients/${selected.id}`}>
                      Open full profile →
                    </Link>
                  </div>
                </div>
              </div>
            </header>

            <div className={styles.tabs} role="tablist" aria-label="Customer detail sections">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={`${styles.tab}${tab === t.id ? ` ${styles.tabOn}` : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className={styles.tabBody} key={selected.id}>
              {error ? (
                <p className={styles.error}>{error}</p>
              ) : loading || !fresh ? (
                <Skeleton />
              ) : (
                <TabPanel tab={tab} detail={fresh} base={base} />
              )}
            </div>

            {/* Cumulative, not urgent — except what is still owed, which is the
                one number here anybody acts on today. */}
            <footer className={styles.moneyStrip}>
              <span>
                <small>Jobs</small>
                <strong>{selected.jobCount || '—'}</strong>
              </span>
              <span>
                <small>Billed</small>
                <strong>{fresh ? fresh.totals.quotedLabel : selected.totalLabel}</strong>
              </span>
              <span>
                <small>Paid</small>
                <strong>{fresh ? fresh.totals.paidLabel : '—'}</strong>
              </span>
              <span>
                <small>Customer since</small>
                <strong>{fresh ? fresh.customerSinceLabel : '—'}</strong>
              </span>
              <span className={styles.moneyStripEnd}>
                <small>Outstanding</small>
                <strong className={fresh && fresh.totals.outstanding > 0 ? styles.waiting : undefined}>
                  {fresh ? fresh.totals.outstandingLabel : '—'}
                </strong>
              </span>
            </footer>
          </>
        ) : (
          <p className="empty-state">Pick a customer from the list.</p>
        )}
      </section>

      <section className={styles.list} aria-label={`All customers (${clients.length})`}>
        <header className={styles.listHead}>
          <h3>All customers</h3>
          <span>{clients.length}</span>
        </header>
        <div className={`${styles.listCols} ${styles.listColsLead}`} aria-hidden="true">
          <span />
          <span>Customer</span>
          <span>Total billed</span>
        </div>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role */}
        <ul className={styles.rows} onKeyDown={onListKeyDown}>
          {clients.map((client) => (
            <li key={client.id}>
              <a
                id={`client-row-${client.id}`}
                href={`${base}/clients/${client.id}`}
                className={`${styles.row} ${styles.rowLead}${client.id === selectedId ? ` ${styles.rowOn}` : ''}`}
                aria-current={client.id === selectedId ? 'true' : undefined}
                onClick={(event) => rowClick(event, client.id)}
                onMouseEnter={() => armPrefetch(client.id)}
                onMouseLeave={cancelPrefetch}
              >
                <span
                  className="client-avatar small"
                  data-avatar-tone={avatarTone(client.name)}
                  aria-hidden="true"
                >
                  {client.initials}
                </span>
                <span className={styles.rowMain}>
                  <strong>{client.name}</strong>
                  <small>{client.contactLine}</small>
                </span>
                <span className={styles.rowValue}>
                  {client.totalLabel}
                  <small>{client.lastLabel}</small>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Skeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <span /><span /><span /><span />
    </div>
  );
}

function TabPanel({ tab, detail, base }: { tab: TabId; detail: ClientDetailDto; base: string }) {
  if (tab === 'overview') {
    return (
      <div className={styles.grid}>
        <section className={styles.card}>
          <h4>Contact</h4>
          <dl className={styles.defs}>
            <div>
              <dt>Phone</dt>
              <dd>{detail.phoneDigits ? <a href={`tel:${detail.phoneDigits}`}>{detail.phone}</a> : 'Not on file'}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{detail.email ? <a href={`mailto:${detail.email}`}>{detail.email}</a> : 'Not on file'}</dd>
            </div>
            <div><dt>Address</dt><dd>{detail.address || 'Not on file'}</dd></div>
            <div><dt>Customer since</dt><dd>{detail.customerSinceLabel}</dd></div>
          </dl>
        </section>

        <section className={styles.card}>
          <h4>Standing</h4>
          <dl className={styles.defs}>
            <div><dt>Jobs</dt><dd>{detail.jobCount}</dd></div>
            <div><dt>Open now</dt><dd>{detail.openJobCount || 'None'}</dd></div>
            <div><dt>Open requests</dt><dd>{detail.openRequestCount || 'None'}</dd></div>
            <div><dt>Last invited back</dt><dd>{detail.lastInvitedLabel ?? 'Never'}</dd></div>
          </dl>
        </section>

        <section className={styles.card}>
          <h4>Money</h4>
          <dl className={styles.defs}>
            <div><dt>Billed</dt><dd>{detail.totals.quotedLabel}</dd></div>
            <div><dt>Paid</dt><dd>{detail.totals.paidLabel}</dd></div>
            <div>
              <dt>Outstanding</dt>
              <dd className={detail.totals.outstanding > 0 ? styles.waiting : undefined}>
                {detail.totals.outstandingLabel}
              </dd>
            </div>
          </dl>
          {detail.totals.outstanding <= 0 && detail.jobCount > 0 ? (
            <p className={styles.muted}>Everything billed has been paid.</p>
          ) : null}
        </section>
      </div>
    );
  }

  if (tab === 'jobs') {
    if (detail.jobs.length === 0) {
      return <p className={styles.muted}>No jobs for this customer yet.</p>;
    }
    return (
      <div className={styles.grid}>
        {detail.jobs.map((job) => (
          <Link key={job.id} href={`${base}/jobs/${job.id}`} className={`${styles.card} ${styles.cardLink}`}>
            <h4>{job.ref}</h4>
            <dl className={styles.defs}>
              <div><dt>Stage</dt><dd>{job.statusLabel}</dd></div>
              <div><dt>Started</dt><dd>{job.dateLabel}</dd></div>
              <div><dt>Quoted</dt><dd>{job.quotedLabel}</dd></div>
              <div>
                <dt>Balance</dt>
                <dd className={job.balance > 0 ? styles.waiting : undefined}>{job.balanceLabel}</dd>
              </div>
            </dl>
          </Link>
        ))}
      </div>
    );
  }

  if (tab === 'money') {
    if (detail.payments.length === 0) {
      return <p className={styles.muted}>Nothing has been charged to this customer yet.</p>;
    }
    return (
      <div className={styles.grid}>
        <section className={styles.card}>
          <h4>Payments</h4>
          <dl className={styles.defs}>
            {detail.payments.map((payment) => (
              <div key={payment.id}>
                <dt>
                  {payment.label}
                  <span className={styles.muted}> · {payment.jobRef}</span>
                </dt>
                <dd>
                  {payment.amountLabel}
                  <span className={styles.muted}> · {payment.status} · {payment.dateLabel}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      <section className={styles.card}>
        <h4>Notes</h4>
        {detail.notes ? (
          <p className={styles.scope}>{detail.notes}</p>
        ) : (
          <p className={styles.muted}>
            Nothing noted about this customer. Gate codes, dogs, where they like the truck parked — the
            things the next person on this job would have to ask.
          </p>
        )}
      </section>
    </div>
  );
}
