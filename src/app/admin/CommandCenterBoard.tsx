'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { moveWithinVisible } from '@/lib/command-center-logic';
import styles from './admin.module.css';

export type BoardCard = {
  key: string;
  title: string;
  content: ReactNode;
  /**
   * Rows the card can actually show. Zero sends it to the All-clear strip
   * instead of the grid — thirteen cards of which ten read "no problems" is a
   * board where the three that matter are the hardest things on it to find.
   */
  rows: number;
  /** The strip's one line for a quiet card: what the check covers, or why it is empty. */
  quietNote: string;
  /** Where the strip entry leads, for the checks that have somewhere to go. */
  quietHref?: string;
};

function storageKeyFor(role: string): string {
  return `admin_command_center_order:${role}`;
}

// Merge whatever order was persisted against the card set this render
// actually has: drop any leftover key the board no longer renders, then
// append any card the board renders that localStorage doesn't know about yet
// (a newly added signal) at the end — so a future card never silently
// disappears just because it postdates someone's saved layout.
function reconcileOrder(stored: string[], defaultOrder: string[], knownKeys: Set<string>): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const key of [...stored.filter((k) => knownKeys.has(k)), ...defaultOrder]) {
    if (seen.has(key) || !knownKeys.has(key)) continue;
    seen.add(key);
    ordered.push(key);
  }
  return ordered;
}

export function CommandCenterBoard({ role, cards, defaultOrder }: { role: string; cards: BoardCard[]; defaultOrder: string[] }) {
  // Seeded with the server-computed default so the first client render
  // matches SSR output exactly — localStorage only gets consulted a moment
  // later, after mount, avoiding a hydration mismatch.
  const [order, setOrder] = useState<string[]>(defaultOrder);
  const [customizing, setCustomizing] = useState(false);

  useEffect(() => {
    const knownKeys = new Set(cards.map((c) => c.key));
    let stored: string[] = [];
    try {
      const raw = window.localStorage.getItem(storageKeyFor(role));
      stored = raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      stored = [];
    }
    setOrder(reconcileOrder(stored, defaultOrder, knownKeys));
  }, [role, cards, defaultOrder]);

  function persist(next: string[]) {
    setOrder(next);
    try {
      window.localStorage.setItem(storageKeyFor(role), JSON.stringify(next));
    } catch {
      // Private-browsing / quota — order still applies for this render, just won't survive a reload.
    }
  }

  const byKey = new Map(cards.map((c) => [c.key, c]));
  const ordered = order.map((k) => byKey.get(k)).filter((c): c is BoardCard => Boolean(c));

  // The split that does the organizing: what needs attention gets a card, what
  // is clear gets a line. Quiet cards keep their slot in `order`, so a card
  // that lights up tomorrow comes back exactly where this staff member put it.
  const active = ordered.filter((c) => c.rows > 0);
  const quiet = ordered.filter((c) => c.rows === 0);
  const activeKeys = active.map((c) => c.key);

  function move(key: string, direction: -1 | 1) {
    persist(moveWithinVisible(order, activeKeys, key, direction));
  }

  return (
    <div>
      <div className={styles.boardHead}>
        <p className={styles.boardCount}>
          {active.length > 0 ? (
            <>
              <strong>{active.length}</strong> {active.length === 1 ? 'card needs' : 'cards need'} attention
            </>
          ) : (
            <strong>Nothing needs attention</strong>
          )}
          {quiet.length > 0 ? <> · {quiet.length} clear</> : null}
        </p>
        <div className={styles.boardActions}>
          {customizing ? (
            <button type="button" className="btn secondary" onClick={() => persist(defaultOrder)}>
              Reset to default
            </button>
          ) : null}
          <button type="button" className="btn secondary" onClick={() => setCustomizing((v) => !v)}>
            {customizing ? 'Done customizing' : 'Customize layout'}
          </button>
        </div>
      </div>

      {active.length > 0 ? (
        <div className={styles.boardGrid}>
          {active.map((card, i) => (
            <section
              key={card.key}
              className={`${styles.panel} ${styles.boardCard} ${customizing ? styles.customizing : ''}`}
            >
              {customizing ? (
                <div className={styles.moveBtns}>
                  <button type="button" className={styles.moveBtn} disabled={i === 0} onClick={() => move(card.key, -1)} aria-label={`Move ${card.title} earlier`}>
                    ←
                  </button>
                  <button type="button" className={styles.moveBtn} disabled={i === active.length - 1} onClick={() => move(card.key, 1)} aria-label={`Move ${card.title} later`}>
                    →
                  </button>
                </div>
              ) : null}
              {card.content}
            </section>
          ))}
        </div>
      ) : null}

      {/* Not a footnote. It is the record that these checks ran and came back
          clean, and it keeps every caveat a quiet card was carrying — "no case
          is within 48 hours of its SLA" means much less without the count of
          cases that have no SLA to be near. */}
      {quiet.length > 0 ? (
        <section className={`${styles.panel} ${styles.allClear}`}>
          <p className={styles.panelTitle}>All clear ({quiet.length})</p>
          <ul className={styles.allClearGrid}>
            {quiet.map((card) => (
              <li key={card.key}>
                <span className={styles.allClearTick} aria-hidden="true">
                  ✓
                </span>
                <span className={styles.allClearName}>
                  {card.quietHref ? (
                    <Link href={card.quietHref} className={styles.rowLink}>
                      {card.title}
                    </Link>
                  ) : (
                    card.title
                  )}
                </span>
                <span className={styles.allClearNote}>{card.quietNote}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
