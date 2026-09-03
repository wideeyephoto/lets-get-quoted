'use client';

import { useEffect, useState, useTransition } from 'react';
import QuickEditModal from './QuickEditModal';
import styles from './quick-edit.module.css';

type QuickEditNameModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  label?: string;
  initialName: string;
  onSave: (name: string) => Promise<void>;
};

export default function QuickEditNameModal({
  isOpen,
  onClose,
  title = 'Edit name',
  label = 'Client name',
  initialName,
  onSave,
}: QuickEditNameModalProps) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setName(initialName);
    setError(null);
  }, [initialName, isOpen]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(`${label} cannot be empty.`);
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        await onSave(trimmed);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save name.');
      }
    });
  }

  return (
    <QuickEditModal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div>
          <label htmlFor="quick-edit-name-field">{label}</label>
          <input
            id="quick-edit-name-field"
            name="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isPending}
            required
            autoFocus
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
            {isPending ? 'Saving…' : 'Save name'}
          </button>
        </div>
      </form>
    </QuickEditModal>
  );
}
