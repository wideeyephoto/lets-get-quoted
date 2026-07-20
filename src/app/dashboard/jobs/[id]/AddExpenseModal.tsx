'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal, useFormStatus } from 'react-dom';


// Lets a Server Action form inside the modal ask the modal to close once its
// submission finishes. Null when rendered outside a modal.
const ModalCloseContext = createContext<(() => void) | null>(null);

// Drop this inside a modal's Server Action <form> (next to the submit button).
// It watches the form's pending state and closes the modal on the pending
// true→false edge — the same success signal SaveButton uses. Renders nothing.
export function CloseOnSuccess() {
  const { pending } = useFormStatus();
  const close = useContext(ModalCloseContext);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && close) {
      // Small delay so the "Added ✓" confirmation flashes before we close.
      const timer = setTimeout(() => close(), 450);
      return () => clearTimeout(timer);
    }
    wasPending.current = pending;
  }, [pending, close]);

  return null;
}

type AddExpenseModalProps = {
  triggerLabel: string;
  triggerClassName?: string;
  title: string;
  // When the page is reached via a deep link that means "add an expense"
  // (e.g. the schedule calendar's ?open=costs link), open the modal on load
  // instead of scrolling. Used only as the INITIAL state, so a server-action
  // revalidation doesn't force the modal back open after the user closes it.
  defaultOpen?: boolean;
  children: ReactNode;
};

export default function AddExpenseModal({ triggerLabel, triggerClassName, title, defaultOpen = false, children }: AddExpenseModalProps) {
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
                  <ModalCloseContext.Provider value={close}>{children}</ModalCloseContext.Provider>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
