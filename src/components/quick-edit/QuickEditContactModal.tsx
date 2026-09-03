'use client';

import { useEffect, useState, useTransition } from 'react';
import QuickEditModal from './QuickEditModal';
import styles from './quick-edit.module.css';

type QuickEditContactModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  initialPhone?: string | null;
  initialEmail?: string | null;
  onSave: (phone: string | null, email: string | null) => Promise<void>;
};

export default function QuickEditContactModal({
  isOpen,
  onClose,
  title = 'Edit contact details',
  initialPhone,
  initialEmail,
  onSave,
}: QuickEditContactModalProps) {
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [email, setEmail] = useState(initialEmail ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setPhone(initialPhone ?? '');
    setEmail(initialEmail ?? '');
    setError(null);
  }, [initialPhone, initialEmail, isOpen]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedPhone = phone.trim() || null;
    const submittedEmail = email.trim() || null;
    setError(null);

    startTransition(async () => {
      try {
        await onSave(submittedPhone, submittedEmail);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save contact details.');
      }
    });
  }

  return (
    <QuickEditModal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div>
          <label htmlFor="quick-edit-contact-phone">Phone number</label>
          <input
            id="quick-edit-contact-phone"
            name="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(248) 555-0117"
            disabled={isPending}
            autoFocus
          />
        </div>

        <div>
          <label htmlFor="quick-edit-contact-email">Email address</label>
          <input
            id="quick-edit-contact-email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="client@example.com"
            disabled={isPending}
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
            {isPending ? 'Saving…' : 'Save contact'}
          </button>
        </div>
      </form>
    </QuickEditModal>
  );
}
