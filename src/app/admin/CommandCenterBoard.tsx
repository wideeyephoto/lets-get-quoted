'use client';

import { useEffect, useState, type ReactNode } from 'react';
import styles from './admin.module.css';

export type BoardCard = {
  key: string;
  title: string;
  content: ReactNode;
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

  function move(key: string, direction: -1 | 1) {
    const i = order.indexOf(key);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = order.slice();
    [next[i], next[j]] = [next[j], next[i]];
    persist(next);
  }

  const byKey = new Map(cards.map((c) => [c.key, c]));
  const ordered = order.map((k) => byKey.get(k)).filter((c): c is BoardCard => Boolean(c));

  return (
    <div>
      <div className={styles.boardHead}>
        {customizing ? (
          <button type="button" className="btn secondary" onClick={() => persist(defaultOrder)}>
            Reset to default
          </button>
        ) : null}
        <button type="button" className="btn secondary" onClick={() => setCustomizing((v) => !v)}>
          {customizing ? 'Done customizing' : 'Customize layout'}
        </button>
      </div>
      <div className={styles.boardGrid}>
        {ordered.map((card, i) => (
          <section key={card.key} className={`${styles.panel} ${styles.boardCard}`}>
            {customizing ? (
              <div className={styles.moveBtns}>
                <button type="button" className={styles.moveBtn} disabled={i === 0} onClick={() => move(card.key, -1)} aria-label={`Move ${card.title} earlier`}>
                  ←
                </button>
                <button type="button" className={styles.moveBtn} disabled={i === ordered.length - 1} onClick={() => move(card.key, 1)} aria-label={`Move ${card.title} later`}>
                  →
                </button>
              </div>
            ) : null}
            {card.content}
          </section>
        ))}
      </div>
    </div>
  );
}
