'use client';

import { useEffect, useRef } from 'react';
import AddressAutocomplete from '@/components/address-autocomplete';
import SaveButton from '@/components/save-button';
import { createLeadAction } from './actions';
import styles from './leads.module.css';

export default function QuickAddLeadModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Focus first interactive text field
    const timer = setTimeout(() => {
      nameInputRef.current?.focus();
    }, 50);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    // Prevent background scrolling while modal is active
    document.body.style.overflow = 'hidden';

    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={styles.modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-add-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modalContent} ref={modalRef}>
        <div className={styles.modalHead}>
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>Manual intake</p>
            <h2 id="quick-add-modal-title" style={{ margin: '0.2rem 0 0', fontSize: '1.25rem' }}>+ Add manual lead</h2>
            <p style={{ margin: '0.25rem 0 0', color: 'var(--muted, #94a3b8)', fontSize: '0.82rem' }}>
              Log a lead that came in by phone, in person, or referral.
            </p>
          </div>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="Close dialog (Esc)"
          >
            ✕
          </button>
        </div>

        <form action={createLeadAction} className="form-grid">
          <div className="field">
            <label htmlFor="quick-add-name">Name</label>
            <input
              ref={nameInputRef}
              id="quick-add-name"
              name="name"
              required
              autoComplete="name"
              placeholder="Sarah Whitfield"
            />
          </div>
          <div className="field">
            <label htmlFor="quick-add-phone">Phone</label>
            <input
              id="quick-add-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(248) 555-0117"
            />
          </div>
          <div className="field">
            <label htmlFor="quick-add-email">Email</label>
            <input
              id="quick-add-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="sarah@example.com"
            />
          </div>
          <div className="field">
            <label htmlFor="quick-add-address">Address</label>
            <AddressAutocomplete id="quick-add-address" name="address" placeholder="1418 Maplewood Ave, Royal Oak, MI" />
          </div>
          <div className="field full">
            <label htmlFor="quick-add-projectType">Project type</label>
            <input id="quick-add-projectType" name="projectType" placeholder="Roof replacement" />
          </div>
          <div className="field">
            <label htmlFor="quick-add-estimatedHours">Estimated hours</label>
            <input
              id="quick-add-estimatedHours"
              name="estimatedHours"
              type="number"
              min="0"
              step="0.25"
              placeholder="16"
            />
          </div>
          <div className="field full">
            <label htmlFor="quick-add-message">Notes</label>
            <textarea id="quick-add-message" name="message" placeholder="Details from the call or conversation..." />
          </div>
          <div className="field full">
            <label htmlFor="quick-add-photos">Photos</label>
            <input
              id="quick-add-photos"
              name="photos"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              multiple
            />
          </div>
          <div className={`field full ${styles.modalActions}`}>
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <SaveButton pendingLabel="Adding lead…">Add lead</SaveButton>
          </div>
        </form>
      </div>
    </div>
  );
}
