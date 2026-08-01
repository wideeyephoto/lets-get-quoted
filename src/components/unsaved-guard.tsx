'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// Stops a half-written form being thrown away by a stray click.
//
// TWO KINDS OF LEAVING, AND ONLY ONE OF THEM IS beforeunload. Closing the tab,
// reloading, or typing a new URL fires beforeunload and the browser asks. But
// clicking anything in the app — the sidebar, a breadcrumb, "Client profile" —
// is a Next client-side navigation, which fires NOTHING. That is the case this
// exists for, and it is the case that actually loses people's work: nobody
// reloads the page mid-quote, they click Leads and watch it vanish.
//
// So the soft case is caught by intercepting link clicks in the capture phase,
// before Next's router sees them, and the hard case by beforeunload. The
// browser's own dialog handles the second; the first gets a real dialog, which
// can at least name the buttons after what they do.
//
// Deliberately NOT guarded: the back button. Blocking history navigation means
// pushing a decoy entry and unwinding it on cancel, which breaks the back stack
// in ways that are worse than the problem — a browser that won't go back feels
// broken. Back still discards; every in-app route out of the page is covered.

export default function UnsavedGuard({
  formId,
  title = 'Leave without sending?',
  body = 'You have unsaved changes. If you leave now they are gone.',
  stayLabel = 'Keep editing',
  leaveLabel = 'Leave and lose it',
}: {
  /** id of the <form> to watch. Any input inside it marks the page dirty. */
  formId: string;
  title?: string;
  body?: string;
  stayLabel?: string;
  leaveLabel?: string;
}) {
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  // Read inside listeners registered once, so they always see the current value
  // without being torn down and rebuilt on every keystroke.
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  // Dirty means "touched", not "different from what the server sent". A quote is
  // built from empty, so anything typed is something to lose; diffing would be
  // more precise and would still say yes in every case that matters here.
  useEffect(() => {
    const form = document.getElementById(formId);
    if (!form) return;
    // TRUSTED EVENTS ONLY. Several fields in this form are kept in sync by
    // script — the quote builder writes the itemised JSON into a hidden input
    // and dispatches `input` so React and the form agree. Those fire on load,
    // which marked a form dirty that nobody had touched and put the "you'll lose
    // your work" dialog in front of anyone merely passing through a lead.
    // isTrusted is false for anything dispatched from code, which is exactly the
    // line we want.
    const touch = (event: Event) => { if (event.isTrusted) setDirty(true); };
    const clear = () => setDirty(false);
    form.addEventListener('input', touch);
    form.addEventListener('change', touch);
    form.addEventListener('submit', clear);
    return () => {
      form.removeEventListener('input', touch);
      form.removeEventListener('change', touch);
      form.removeEventListener('submit', clear);
    };
  }, [formId]);

  // Tab close / reload / external URL.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  // In-app navigation. Capture phase so this runs before the router's own
  // handler and can still cancel it.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!dirtyRef.current) return;
      // Let the browser have modified clicks — those open a new tab and leave
      // this one, and its form, exactly where it is.
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || anchor.target === '_blank' || anchor.hasAttribute('download')) return;

      // Same-page anchors and external hosts are not our problem: the first
      // does not leave, the second gets beforeunload.
      let destination: URL;
      try {
        destination = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (destination.origin !== window.location.origin) return;
      if (destination.pathname === window.location.pathname) return;

      event.preventDefault();
      event.stopPropagation();
      setPendingHref(destination.pathname + destination.search + destination.hash);
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  const leave = useCallback(() => {
    const href = pendingHref;
    setPendingHref(null);
    setDirty(false);
    if (href) router.push(href);
  }, [pendingHref, router]);

  // Escape means "stay" — the safe half of a destructive choice.
  useEffect(() => {
    if (!pendingHref) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setPendingHref(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pendingHref]);

  if (!pendingHref) return null;

  return (
    <div className="unsaved-guard-backdrop" role="dialog" aria-modal="true" aria-labelledby="unsaved-guard-title">
      <div className="unsaved-guard-panel">
        <h3 id="unsaved-guard-title">{title}</h3>
        <p>{body}</p>
        <div className="unsaved-guard-actions">
          {/* Staying is the default action and gets the focus, because the other
              one cannot be undone. */}
          <button type="button" className="btn primary" onClick={() => setPendingHref(null)} autoFocus>
            {stayLabel}
          </button>
          <button type="button" className="btn secondary" onClick={leave}>
            {leaveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
