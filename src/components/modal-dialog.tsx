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
  children: ReactNode;
};

export default function ModalDialog({
  triggerLabel, triggerClassName, title, defaultOpen = false, onSuccess, children,
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
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>

      {mounted && open
        ? createPortal(
            <div
              className="app-modal-backdrop"
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
