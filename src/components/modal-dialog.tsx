'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal, useFormStatus } from 'react-dom';

// The app's modal: a trigger button, a portaled dialog, Escape and backdrop to
// close, and a way for a Server Action form inside it to close it on success.
//
// Portaled to <body> rather than rendered in place, and that is load-bearing on
// iOS: several of our surfaces use backdrop-filter, which makes an ancestor a
// containing block and traps position:fixed children inside it. A modal that
// works everywhere else appears frozen behind the panel on an iPad.
//
// Lived in dashboard/jobs/[id] as AddExpenseModal until the cash-flow page
// needed the same thing. Nothing about it was ever job- or expense-specific.

type ModalActions = { close: () => void; onSuccess?: () => void };

// Null when the form is rendered outside a modal.
const ModalContext = createContext<ModalActions | null>(null);

// Drop this inside a modal's Server Action <form> (next to the submit button).
// It watches the form's pending state and closes the modal on the pending
// true→false edge — the same success signal SaveButton uses. Renders nothing.
export function CloseOnSuccess() {
  const { pending } = useFormStatus();
  const actions = useContext(ModalContext);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && actions) {
      // Small delay so the "Added ✓" confirmation flashes before we close.
      const timer = setTimeout(() => {
        actions.close();
        actions.onSuccess?.();
      }, 450);
      return () => clearTimeout(timer);
    }
    wasPending.current = pending;
  }, [pending, actions]);

  return null;
}

type ModalDialogProps = {
  triggerLabel: ReactNode;
  triggerClassName?: string;
  title: string;
  // When the page is reached via a deep link that means "open this" (e.g. the
  // schedule calendar's ?open=costs link), open on load instead of scrolling.
  // INITIAL state only, so a server-action revalidation doesn't force the modal
  // back open after the user closes it.
  defaultOpen?: boolean;
  // Runs after a successful submit closes the dialog — NOT on Escape or a
  // backdrop click. Used to take the owner to whatever they just created.
  onSuccess?: () => void;
  /**
   * Hide the page behind the dialog, rather than merely dimming it.
   *
   * Opt-in and defaults to the ordinary scrim, because on every other modal in
   * the app the context behind it is the point — you want to see the job you
   * are adding a cost to. The one place that inverts is the texting-setup
   * dialog: it opens over the inbox, it gets screenshotted for a carrier
   * campaign submission, and a 3px blur over a 66% scrim leaves customer names
   * and phone numbers legible in the result. That is somebody else's personal
   * information leaving the building inside our compliance evidence.
   */
  obscureBackdrop?: boolean;
  children: ReactNode;
};

export default function ModalDialog({
  triggerLabel, triggerClassName, title, defaultOpen = false, onSuccess, obscureBackdrop = false, children,
}: ModalDialogProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    // Prevent the page behind the modal from scrolling.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    /**
     * ...and from being reached, which is a different thing.
     *
     * The dialog is `aria-modal`, but that is a promise to assistive tech about
     * what is behind it, not an instruction to the browser — Tab still walked
     * out of "New message" and into the inbox behind the backdrop, where every
     * conversation link and the whole nav rail were operable through the scrim.
     * `inert` on the body's other children is what actually holds, and doing it
     * per sibling rather than on <body> is what leaves the portal — a child of
     * <body> itself — alive.
     *
     * Captured as a list rather than re-queried on close: a Server Action can
     * revalidate the page underneath while the dialog is open, and the set of
     * body children is not guaranteed to be the same one we marked.
     *
     * Every backdrop is spared, not just this one, so a dialog opened from
     * inside another does not silence its parent.
     */
    const inerted = Array.from(document.body.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && !el.classList.contains('app-modal-backdrop'),
    );
    inerted.forEach((el) => el.toggleAttribute('inert', true));

    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      inerted.forEach((el) => el.toggleAttribute('inert', false));
    };
    // `mounted` too: the portal only exists after it flips, and with
    // defaultOpen the dialog is already open by then — without it, the one
    // modal that opens on load would be the one that never inerted anything.
  }, [open, mounted]);

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>

      {mounted && open
        ? createPortal(
            <div
              // Still carries app-modal-backdrop, because the inert sweep above
              // identifies backdrops by that class — a modifier that replaced it
              // would silence this dialog's own portal.
              className={`app-modal-backdrop${obscureBackdrop ? ' is-private' : ''}`}
              role="presentation"
              onClick={(event) => {
                if (event.target === event.currentTarget) setOpen(false);
              }}
            >
              <div className="app-modal" role="dialog" aria-modal="true" aria-label={title}>
                <div className="app-modal-head">
                  <h2>{title}</h2>
                  <button ref={closeRef} type="button" className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}>
                    ✕
                  </button>
                </div>
                <div className="app-modal-body">
                  <ModalContext.Provider value={{ close, onSuccess }}>{children}</ModalContext.Provider>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
