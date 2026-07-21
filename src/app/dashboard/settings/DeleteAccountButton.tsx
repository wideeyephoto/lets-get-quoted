'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';

function ConfirmDeleteButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn danger" disabled={disabled || pending} aria-busy={pending}>
      {pending ? 'Deleting…' : 'Permanently delete account'}
    </button>
  );
}

export default function DeleteAccountButton({
  action,
  businessName,
}: {
  action: () => Promise<void>;
  businessName: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  if (!open) {
    return (
      <button type="button" className="btn danger" onClick={() => setOpen(true)}>
        Delete account
      </button>
    );
  }

  const confirmed = confirmText.trim().toUpperCase() === 'DELETE';

  return (
    <form action={action} className="delete-account-confirm">
      <p className="workspace-details-copy" style={{ marginTop: 0 }}>
        This permanently deletes <strong>{businessName}</strong> and everything in it — jobs,
        leads, crew, invoices, and payments — and removes your sign-in so this phone/email can be
        used on another account. <strong>This cannot be undone.</strong>
      </p>
      <label htmlFor="delete-confirm">
        Type <strong>DELETE</strong> to confirm
      </label>
      <input
        id="delete-confirm"
        type="text"
        value={confirmText}
        onChange={(event) => setConfirmText(event.target.value)}
        placeholder="DELETE"
        autoComplete="off"
        style={{ maxWidth: '220px' }}
      />
      <div className="actions" style={{ marginTop: '0.4rem' }}>
        <button
          type="button"
          className="btn secondary"
          onClick={() => {
            setOpen(false);
            setConfirmText('');
          }}
        >
          Cancel
        </button>
        <ConfirmDeleteButton disabled={!confirmed} />
      </div>
    </form>
  );
}
