'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import styles from './crew.module.css';

// The shell every pay dialog sits in.
//
// Recording a payment is the one thing on this screen that can't be taken back
// without a reason and a history line, so it happens behind a deliberate stop —
// never a button that acts on the first click.
//
// Escape closes it, focus moves inside on open and returns to whatever opened
// it on close, and the backdrop is inert for the payment form: a stray click
// outside must not throw away a reference number somebody just typed.

export default function PayModal({
  title,
  lead,
  onClose,
  children,
  dismissOnBackdrop = true,
  wide = false,
}: {
  title: string;
  lead?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  dismissOnBackdrop?: boolean;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusTo.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // The first thing you can type into, or the panel itself — so a screen
    // reader lands inside the dialog rather than back at the top of the page.
    const focusable = panel?.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([disabled]), select, textarea, button',
    );
    (focusable ?? panel)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      // Keep Tab inside the dialog. Without this, tabbing walks out into the
      // page behind it, which for a confirmation dialog means tabbing onto the
      // very buttons the dialog is asking you to think about.
      const stops = [...panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])')];
      if (stops.length === 0) return;
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      returnFocusTo.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className={styles.modalBackdrop}
      onMouseDown={(event) => {
        if (dismissOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`${styles.modal}${wide ? ` ${styles.modalWide}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pay-modal-title"
        ref={panelRef}
        tabIndex={-1}
      >
        <header className={styles.modalHead}>
          <div>
            <h3 id="pay-modal-title">{title}</h3>
            {lead ? <p>{lead}</p> : null}
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className={styles.modalBody}>{children}</div>
      </div>
    </div>
  );
}

/** The result line every pay action reports back through. */
export function ActionResult({ state }: { state: { ok: boolean; message: string; detail?: string[] } | null }) {
  if (!state?.message) return null;
  return (
    <div className={styles.actionResult} data-ok={state.ok || undefined} role="status" aria-live="polite">
      <strong>{state.message}</strong>
      {state.detail && state.detail.length > 0 ? (
        <ul>
          {state.detail.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
