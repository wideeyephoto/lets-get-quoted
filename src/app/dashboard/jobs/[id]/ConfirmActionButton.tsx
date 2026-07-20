'use client';

import type { ReactNode } from 'react';
import SaveButton from '@/components/save-button';

type Props = {
  action: (formData: FormData) => Promise<void>;
  confirmMessage: string;
  className?: string;
  pendingLabel?: string;
  savedLabel?: string;
  children: ReactNode;
};

// Generic confirm-then-submit wrapper for destructive/undo-style server
// actions on the job page (cancel a payment request, void an invoice, etc.)
// — mirrors the pattern established by DeleteJobButton.
export default function ConfirmActionButton({
  action,
  confirmMessage,
  className = 'feed-undo-btn',
  pendingLabel = 'Working…',
  savedLabel = 'Done ✓',
  children,
}: Props) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      <SaveButton className={className} pendingLabel={pendingLabel} savedLabel={savedLabel}>
        {children}
      </SaveButton>
    </form>
  );
}
