'use client';

import SaveButton from '@/components/save-button';

// Permanent delete, offered only inside Set aside.
//
// Everything else on this page is reversible — archive, snooze, decline all
// hide a lead and keep it. That made the drawer a one-way street where junk
// piled up: test submissions, bots past the honeypot, the same person three
// times. This is the way out.
//
// It asks first, and the question names the lead and says plainly that it does
// not come back, because this is the only button on the page that means it.

export default function DeleteLeadButton({
  action,
  name,
}: {
  action: (formData: FormData) => Promise<void>;
  name: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(`Delete ${name} for good?\n\nThe request and any photos they sent are removed. This can't be undone — "Set aside" is the reversible one.`)) {
          event.preventDefault();
        }
      }}
    >
      <SaveButton className="btn danger" pendingLabel="Deleting…" savedLabel="Deleted ✓">
        Delete
      </SaveButton>
    </form>
  );
}
