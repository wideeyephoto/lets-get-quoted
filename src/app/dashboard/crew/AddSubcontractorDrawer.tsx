'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useFormState } from 'react-dom';
import SaveButton from '@/components/save-button';
import UnsavedGuard from '@/components/unsaved-guard';
import { CREATE_CREW_IDLE } from '@/lib/crew-add-state';
import SubcontractorFields from './SubcontractorFields';
import { createSubcontractorAction } from './subcontractor-actions';
import styles from './crew.module.css';
import dispatch from './dispatch.module.css';

// "Add subcontractor", as a drawer over the directory.
//
// Deliberately the same shape as AddCrewDrawer — URL-derived open state, a focus
// trap, a discard confirmation, an UnsavedGuard for navigations that leave the
// page entirely. Read the long note at the top of that file for why the open
// state is ?add=sub rather than a useState: it is the bug this pattern exists to
// prevent, and a second drawer written the old way would bring it straight back.

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function AddSubcontractorDrawer({
  knownTrades,
  onAdded,
}: {
  knownTrades: string[];
  onAdded: (member: { id: string; name: string; message: string }) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const open = searchParams.get('add') === 'sub';

  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  const [state, formAction] = useFormState(createSubcontractorAction, CREATE_CREW_IDLE);
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const openerRef = useRef<HTMLElement | null>(null);
  const skipRestoreRef = useRef(false);

  const close = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('add');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const requestClose = useCallback(() => {
    if (confirmDiscard) {
      setConfirmDiscard(false);
      return;
    }
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    close();
  }, [close, confirmDiscard, dirty]);

  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestCloseRef.current();
    };
    document.addEventListener('keydown', onKey);

    const opener = openerRef.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (skipRestoreRef.current) {
        skipRestoreRef.current = false;
        return;
      }
      opener?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (open) return;
    setDirty(false);
    setConfirmDiscard(false);
  }, [open]);

  useEffect(() => {
    if (state.status !== 'added') return;
    formRef.current?.reset();
    skipRestoreRef.current = true;
    onAdded({ id: state.id, name: state.name, message: state.message });
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!open) return null;

  return (
    <div
      className={styles.drawerBackdrop}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          requestClose();
          return;
        }
        if (event.key !== 'Tab' || confirmDiscard) return;
        const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
          (node) => !node.hasAttribute('hidden') && node.getClientRects().length > 0,
        );
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || !panelRef.current?.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div className={styles.drawerScrim} onClick={requestClose} />

      <section
        ref={panelRef}
        className={`${styles.drawer} ${styles.addDrawer} ${dispatch.wideDrawer}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${formId}-title`}
      >
        <header className={styles.drawerHead}>
          <div>
            <h2 id={`${formId}-title`}>Add a subcontractor</h2>
            <p>The firm, what they do, how far they travel and whether their paperwork is current.</p>
          </div>
          <button type="button" className={styles.drawerClose} onClick={requestClose} aria-label="Close">
            ✕
          </button>
        </header>

        {state.status === 'error' ? (
          <p className={styles.addError} role="alert">
            {state.message}
          </p>
        ) : null}

        <form id={formId} ref={formRef} action={formAction} className={styles.addForm}>
          <div
            className={styles.addFormBody}
            onInput={(event) => {
              if (event.nativeEvent.isTrusted) setDirty(true);
            }}
            onChange={(event) => {
              if (event.nativeEvent.isTrusted) setDirty(true);
            }}
          >
            <SubcontractorFields idPrefix={formId} profile={null} knownTrades={knownTrades} />
          </div>

          <footer className={styles.addActions}>
            <SaveButton pendingLabel="Saving…" savedLabel="Saved ✓">
              Save subcontractor
            </SaveButton>
            <button type="button" className="btn ghost" onClick={requestClose}>
              Cancel
            </button>
          </footer>
        </form>

        <UnsavedGuard
          formId={formId}
          title="Leave without adding them?"
          body="You have started adding a subcontractor. If you leave now, nothing is saved."
          stayLabel="Keep adding"
          leaveLabel="Leave and lose it"
        />
      </section>

      {confirmDiscard ? (
        <div className="unsaved-guard-backdrop" role="dialog" aria-modal="true" aria-labelledby={`${formId}-discard`}>
          <div className="unsaved-guard-panel">
            <h3 id={`${formId}-discard`}>Discard this subcontractor?</h3>
            <p>You have filled in part of the form. Closing now throws it away.</p>
            <div className="unsaved-guard-actions">
              <button type="button" className="btn primary" onClick={() => setConfirmDiscard(false)} autoFocus>
                Keep adding
              </button>
              <button type="button" className="btn secondary" onClick={() => { setConfirmDiscard(false); setDirty(false); close(); }}>
                Discard
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
