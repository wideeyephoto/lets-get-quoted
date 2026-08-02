'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ViewOption } from '@/components/view-gear';
import { avatarTone } from '@/lib/avatar-tone';
import styles from './crew.module.css';

// Overview — the Clients page's Focus shape, worn by all three Crew & Labor tabs.
//
// A scrolling list on the left, one thing open beside it. It answers "is THIS
// one right" without giving up the list you were working through, which is the
// question every tab here actually has: is this person's timesheet right, is
// this job's labor right.
//
// One component rather than three, because the three tabs have to agree about
// what a row looks like or the page changes character as you move across it —
// the same reason the page mode lives in one cookie. Each tab keeps its own
// content: it maps its rows to OverviewItem and supplies its own actions, which
// is the only part that can't be shared (approving hours and opening a job are
// not the same button wearing different words).

export type OverviewStat = {
  label: string;
  value: ReactNode;
  /** Hover text. Used for the figures that are estimates rather than records. */
  title?: string;
};

export type OverviewItem = {
  id: string;
  /** Fallback when there's no photo. Two letters. */
  initials: string;
  photoUrl?: string | null;
  name: string;
  /** The line under the name IN THE LIST — enough to tell two people apart. */
  sub: string;
  /** The figure on the right of the row. Money, so it stays tabular. */
  amount: string;
  amountTitle?: string;
  /** A state word beside the name in the open pane: Available, Paid, Over. */
  badge?: { label: string; tone?: 'ok' | 'warn' | 'alert' | 'muted'; title?: string } | null;
  /** The line under the name IN THE PANE. Contact details, or the job's crew. */
  headline: string;
  /** Three at most — a fourth wraps to a second row and stops being a glance. */
  stats: OverviewStat[];
  /** One quiet line under the stats: an address, a warning, a payment note. */
  note?: ReactNode;
  /**
   * A block under the note, for a tab whose pane would otherwise be three
   * numbers — Labor by job puts the entries here. Left empty everywhere the
   * detail already has somewhere better to live.
   */
  detail?: ReactNode;
  actions?: ReactNode;
};

/** The option every tab's gear carries. One label, so it's one thing. */
export function overviewOption<T extends string>(hint: string): ViewOption<T> {
  return { id: 'overview' as T, label: 'Overview', hint };
}

export default function OverviewBoard({
  items,
  empty,
  listLabel,
}: {
  items: OverviewItem[];
  /** What to say when the filters match nothing. */
  empty: string;
  /** Names the list for a screen reader — "Crew members", "Jobs". */
  listLabel: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filtering swaps the rows without touching the scroll offset, so searching
  // from halfway down would open partway into the results.
  const signature = items.map((item) => item.id).join('|');
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [signature]);

  // Something is always open, or the pane is a hole in the page. The first match
  // is the sensible something, and it follows the filters rather than stranding
  // a selection that has been filtered away.
  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  );

  if (items.length === 0) return <p className="empty-state">{empty}</p>;

  return (
    <div className={styles.ovLayout}>
      <div className={styles.ovList} ref={listRef} role="list" aria-label={listLabel}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="listitem"
            className={`${styles.ovRow}${selected?.id === item.id ? ` ${styles.ovRowOn}` : ''}`}
            onClick={() => setSelectedId(item.id)}
            aria-current={selected?.id === item.id ? 'true' : undefined}
          >
            <span className={styles.ovAvatar} data-avatar-tone={avatarTone(item.name)} aria-hidden="true">
              {item.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.photoUrl} alt="" />
              ) : (
                item.initials
              )}
            </span>
            <span className={styles.ovWho}>
              <strong>{item.name}</strong>
              <small>{item.sub}</small>
            </span>
            <span className={styles.ovAmount} title={item.amountTitle}>{item.amount}</span>
          </button>
        ))}
      </div>

      {selected ? (
        // Keyed so switching remounts the pane — the entrance animation is the
        // thing that makes a click feel like it landed.
        <div className={styles.ovPane} key={selected.id}>
          <div className={styles.ovHead}>
            <span className={`${styles.ovAvatar} ${styles.ovAvatarLg}`} data-avatar-tone={avatarTone(selected.name)} aria-hidden="true">
              {selected.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selected.photoUrl} alt="" />
              ) : (
                selected.initials
              )}
            </span>
            <div>
              <h3>
                {selected.name}
                {selected.badge ? (
                  <span className={styles.ovBadge} data-tone={selected.badge.tone ?? 'muted'} title={selected.badge.title}>
                    {selected.badge.label}
                  </span>
                ) : null}
              </h3>
              <p>{selected.headline}</p>
            </div>
          </div>

          <dl className={styles.ovStats}>
            {selected.stats.map((stat) => (
              <div key={stat.label} title={stat.title}>
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
          </dl>

          {selected.note ? <div className={styles.ovNote}>{selected.note}</div> : null}

          {selected.detail ? <div className={styles.ovDetail}>{selected.detail}</div> : null}

          {selected.actions ? <div className={styles.ovActions}>{selected.actions}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
