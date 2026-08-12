'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * EVERYTHING THAT ISN'T THE NEXT STEP.
 *
 * The hero used to offer every control this job could ever need, all at once,
 * all the same size: request a payment, add an expense, start the job, mark it
 * complete — on a job whose crew wasn't booked until Thursday. Four buttons of
 * equal weight is the same as no recommendation at all, and the two expensive
 * ones (a payment ask, a completion that can text a customer) sat next to the
 * cheap ones with nothing to say which was which.
 *
 * So the stage picks ONE bright control (see primaryJobAction) and the rest
 * live in here. Not hidden — every one of them is two taps away and named — but
 * no longer competing with the thing you actually came to do.
 *
 * It stays open across a server action on purpose. Several of these submit and
 * revalidate, and a menu that snapped shut underneath the button you just
 * pressed would take the confirmation ("Added ✓") with it.
 */
export default function JobActionMenu({
  label = 'More actions',
  defaultOpen = false,
  children,
}: {
  label?: string;
  /**
   * Open on arrival, for the deep links that land on something in here.
   *
   * "Add expense" is reached from the schedule calendar, the focus pane, the
   * smoothie view and the job tabs, all as `?open=costs` — and the modal behind
   * that link opens itself on mount. Inside a menu that starts closed it never
   * mounts, so four working links would quietly land on a job page and do
   * nothing.
   */
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const shell = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    // pointerdown rather than click: a click that lands on a menu item first
    // does its job and only then reaches the document, so closing here can't
    // swallow the press that opened something.
    const onPointerDown = (event: PointerEvent) => {
      if (!shell.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className={`job-actions-menu${open ? ' is-open' : ''}`} ref={shell}>
      <button
        type="button"
        className="btn secondary job-actions-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        {label}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9.5 6 6 6-6" />
        </svg>
      </button>
      {/* Rendered only while open, so nothing inside it is tabbable behind a
          closed menu — and so the confirm dialogs some of these controls own
          are torn down with it rather than left mounted off-screen. */}
      {open ? <div className="job-actions-pop" role="menu">{children}</div> : null}
    </div>
  );
}
