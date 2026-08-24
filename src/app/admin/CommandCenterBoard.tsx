'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { moveWithinVisible } from '@/lib/command-center-logic';
import styles from './admin.module.css';

export type BoardCard = {
  key: string;
  title: string;
  content: ReactNode;
  rows: number;
  quietNote: string;
  quietHref?: string;
  available?: boolean;
};

function storageKeyFor(role: string, staffKey: string): string {
  return `admin_command_center_order:${role}:${staffKey.toLowerCase()}`;
}

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

export function CommandCenterBoard({
  role,
  staffKey,
  cards,
  defaultOrder,
}: {
  role: string;
  staffKey: string;
  cards: BoardCard[];
  defaultOrder: string[];
}) {
  const [order, setOrder] = useState<string[]>(defaultOrder);
  const [customizing, setCustomizing] = useState(false);
  const [showAllClear, setShowAllClear] = useState(true);

  useEffect(() => {
    const knownKeys = new Set(cards.map((c) => c.key));
    let stored: string[] = [];
    try {
      const raw = window.localStorage.getItem(storageKeyFor(role, staffKey));
      stored = raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      stored = [];
    }
    setOrder(reconcileOrder(stored, defaultOrder, knownKeys));
  }, [role, staffKey, cards, defaultOrder]);

  function persist(next: string[]) {
    setOrder(next);
    try {
      window.localStorage.setItem(storageKeyFor(role, staffKey), JSON.stringify(next));
    } catch {
      // Best-effort storage
    }
  }

  const byKey = new Map(cards.map((c) => [c.key, c]));
  const ordered = order.map((k) => byKey.get(k)).filter((c): c is BoardCard => Boolean(c));

  const unavailable = ordered.filter((c) => c.available === false);
  const active = ordered.filter((c) => c.available !== false && c.rows > 0);
  const quiet = ordered.filter((c) => c.available !== false && c.rows === 0);
  const activeKeys = active.map((c) => c.key);

  function move(key: string, direction: -1 | 1) {
    persist(moveWithinVisible(order, activeKeys, key, direction));
  }

  return (
    <div>
      <div className={styles.boardHead}>
        <div className={styles.boardCountRow}>
          {active.length > 0 ? (
            <span className={`${styles.statusBadge} ${styles.attention}`}>
              <span className={`${styles.pulseDot} ${styles.bad}`} aria-hidden="true" />
              <strong>{active.length}</strong> {active.length === 1 ? 'card needs attention' : 'cards need attention'}
            </span>
          ) : (
            <span className={`${styles.statusBadge} ${styles.clear}`}>
              <span className={`${styles.pulseDot} ${styles.good}`} aria-hidden="true" />
              <strong>All systems operational</strong>
            </span>
          )}
          {quiet.length > 0 ? (
            <span className={`${styles.statusBadge} ${styles.clear}`}>
              ✓ {quiet.length} checks clear
            </span>
          ) : null}
          {unavailable.length > 0 ? (
            <span className={`${styles.statusBadge} ${styles.unavailable}`}>
              ! {unavailable.length} unavailable
            </span>
          ) : null}
        </div>
        <div className={styles.boardActions}>
          {customizing ? (
            <button type="button" className="btn secondary" onClick={() => persist(defaultOrder)}>
              Reset layout
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
                  <button
                    type="button"
                    className={styles.moveBtn}
                    disabled={i === 0}
                    onClick={() => move(card.key, -1)}
                    aria-label={`Move ${card.title} earlier`}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className={styles.moveBtn}
                    disabled={i === active.length - 1}
                    onClick={() => move(card.key, 1)}
                    aria-label={`Move ${card.title} later`}
                  >
                    →
                  </button>
                </div>
              ) : null}
              {card.content}
            </section>
          ))}
        </div>
      ) : null}

      {unavailable.length > 0 ? (
        <section className={`${styles.panel} ${styles.dataUnavailable}`} aria-labelledby="unavailable-signals-title">
          <h2 className={styles.panelTitle} id="unavailable-signals-title">
            <span className={`${styles.pulseDot} ${styles.warn}`} aria-hidden="true" />
            Data unavailable ({unavailable.length})
          </h2>
          <p className={styles.muted}>These checks could not complete. They are excluded from All clear until their data sources recover.</p>
          <ul className={styles.allClearGrid}>
            {unavailable.map((card) => (
              <li key={card.key}>
                <span className={styles.unavailableMarkWrap} aria-hidden="true">!</span>
                <div>
                  <span className={styles.allClearName}>{card.title}</span>
                  <div className={styles.allClearNote}>Could not verify this signal. Retry by refreshing the page.</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {quiet.length > 0 ? (
        <section className={`${styles.panel} ${styles.allClear}`}>
          <div className={styles.allClearHead}>
            <h2 className={styles.panelTitle} style={{ margin: 0 }}>
              <span className={`${styles.pulseDot} ${styles.good}`} aria-hidden="true" />
              Verified Clear Checks ({quiet.length})
            </h2>
            <button
              type="button"
              className={styles.allClearToggleBtn}
              onClick={() => setShowAllClear((v) => !v)}
              aria-expanded={showAllClear}
              aria-controls="admin-verified-clear-list"
            >
              {showAllClear ? 'Collapse ↑' : 'Expand ↓'}
            </button>
          </div>
          {showAllClear ? (
            <ul id="admin-verified-clear-list" className={styles.allClearGrid}>
              {quiet.map((card) => (
                <li key={card.key}>
                  <span className={styles.allClearIconWrap} aria-hidden="true">✓</span>
                  <div>
                    <span className={styles.allClearName}>
                      {card.quietHref ? (
                        <Link href={card.quietHref} className={styles.rowLink}>
                          {card.title}
                        </Link>
                      ) : (
                        card.title
                      )}
                    </span>
                    <div className={styles.allClearNote}>{card.quietNote}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
