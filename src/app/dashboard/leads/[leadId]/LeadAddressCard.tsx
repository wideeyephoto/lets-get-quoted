'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import AddressAutocomplete from '@/components/address-autocomplete';
import LeadRadiusMap from '@/components/lead-radius-map';
import { updateLeadAddressAction } from '../actions';
import styles from '../leads.module.css';

type LeadAddressCardProps = {
  leadId: string;
  initialAddress: string | null | undefined;
  radiusMiles?: number;
};

export default function LeadAddressCard({
  leadId,
  initialAddress,
  radiusMiles = 10,
}: LeadAddressCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [address, setAddress] = useState<string | null>(initialAddress ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setAddress(initialAddress ?? null);
  }, [initialAddress]);

  useEffect(() => {
    if (!isEditing) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsEditing(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isEditing]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submitted = (formData.get('address') as string)?.trim() || null;
    setError(null);

    startTransition(async () => {
      try {
        await updateLeadAddressAction(leadId, submitted);
        setAddress(submitted);
        setIsEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save project address.');
      }
    });
  }

  return (
    <div className={styles.heroContactItem}>
      <div className={styles.heroAddressHead}>
        <span>Project address</span>
        <button
          type="button"
          className={styles.heroAddressEditBtn}
          onClick={() => setIsEditing(true)}
          aria-label="Quick edit project address"
        >
          Edit
        </button>
      </div>
      <strong>{address || 'Not provided'}</strong>
      <LeadRadiusMap address={address} radiusMiles={radiusMiles} size="mini" />

      {isEditing && (
        <div
          className={styles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="quickAddressTitle"
          onClick={() => {
            if (!isPending) setIsEditing(false);
          }}
        >
          <div
            className={styles.quickAddressModal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.editModalHeader}>
              <div>
                <p className="eyebrow">Quick update</p>
                <h2 id="quickAddressTitle">Edit project address</h2>
              </div>
              <button
                type="button"
                className={styles.modalCloseButton}
                onClick={() => {
                  if (!isPending) setIsEditing(false);
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className={styles.quickAddressForm}>
              <div className="field">
                <label htmlFor="quick-edit-lead-address">Project address</label>
                <AddressAutocomplete
                  id="quick-edit-lead-address"
                  name="address"
                  defaultValue={address ?? ''}
                  placeholder="1418 Maplewood Ave, Royal Oak, MI"
                  inputRef={inputRef}
                />
              </div>

              {error ? (
                <p className={styles.quickAddressError} role="alert">
                  {error}
                </p>
              ) : null}

              <div className={styles.editModalActions}>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={isPending}
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={isPending}
                >
                  {isPending ? 'Saving…' : 'Save address'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
