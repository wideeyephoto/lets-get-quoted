'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import AddressAutocomplete from '@/components/address-autocomplete';
import QuickEditModal from './QuickEditModal';
import styles from './quick-edit.module.css';

type QuickEditAddressModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  label?: string;
  initialAddress?: string | null;
  onSave: (address: string | null) => Promise<void>;
};

export default function QuickEditAddressModal({
  isOpen,
  onClose,
  title = 'Edit address',
  label = 'Address',
  initialAddress,
  onSave,
}: QuickEditAddressModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setError(null);
  }, [isOpen]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submitted = (formData.get('address') as string)?.trim() || null;
    setError(null);

    startTransition(async () => {
      try {
        await onSave(submitted);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save address.');
      }
    });
  }

  return (
    <QuickEditModal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div>
          <label htmlFor="quick-edit-address-field">{label}</label>
          <AddressAutocomplete
            id="quick-edit-address-field"
            name="address"
            defaultValue={initialAddress ?? ''}
            placeholder="1418 Maplewood Ave, Royal Oak, MI"
            inputRef={inputRef}
          />
        </div>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className="btn secondary"
            disabled={isPending}
            onClick={onClose}
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
    </QuickEditModal>
  );
}
