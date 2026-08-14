'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import styles from './rowmenu.module.css';

/**
 * The secondary actions on a lead, behind one clearly labelled button.
 *
 * The inbox used to put four 32×32 icon buttons beside every row — 📞 💬 💤 →.
 * Emoji are not labels: a screen reader announces "telephone receiver", the
 * targets were well under 44px, and on a phone the four of them left about
 * 42px for the lead's name.
 *
 * So: one primary action decided by the lead, and everything else in here.
 * Real buttons, real text, a real accessible name on the trigger, Escape and
 * outside-click to close, and focus returned to the trigger when it does —
 * otherwise a keyboard user is dropped at the top of the document every time
 * they close a menu.
 */

export type RowMenuItem =
  | { key: string; kind: 'button'; label: string; onSelect: () => void; danger?: boolean }
  | { key: string; kind: 'link'; label: string; href: string };

export default function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  // One of these renders per row, so the menu's id has to be per-instance.
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Opening with a keyboard should land you IN the menu, not leave you on the
  // trigger having to tab past everything the menu was rendered over.
  useEffect(() => {
    if (!open) return;
    popRef.current?.querySelector<HTMLElement>('a, button')?.focus();
  }, [open]);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        ref={triggerRef}
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={() => setOpen((was) => !was)}
      >
        More
        <span aria-hidden="true" className={styles.chev}>▾</span>
      </button>

      {open ? (
        <div id={menuId} className={styles.pop} role="menu" ref={popRef} aria-label={label}>
          {items.map((item) =>
            item.kind === 'link' ? (
              <Link key={item.key} role="menuitem" className={styles.item} href={item.href} onClick={() => setOpen(false)}>
                {item.label}
              </Link>
            ) : (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className={`${styles.item}${item.danger ? ` ${styles.danger}` : ''}`}
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
