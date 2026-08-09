'use client';

import { useFormStatus } from 'react-dom';

/**
 * "Job started" — and, when the quote has not been approved, what else it means.
 *
 * Pressing this on a job still at the quote stage now records the acceptance
 * that starting work implies: the job leaves the quote stage, the lead behind it
 * is won, and the feed says the customer agreed. That is the right record — no
 * contractor sends a crew to a job nobody said yes to — but it is more than the
 * button's two words promise, and the customer can see the feed entry.
 *
 * So it asks first, and only in that case. A job already approved gets no
 * dialog, because nothing surprising happens.
 */
export default function StartJobButton({
  action,
  clientName,
  quoteUnapproved,
}: {
  action: (formData: FormData) => Promise<void>;
  clientName: string;
  /** The job is still sitting at the quote stage. */
  quoteUnapproved: boolean;
}) {
  const who = clientName?.trim() || 'the customer';

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!quoteUnapproved) return;
        const message =
          `Start work on a quote that hasn't been approved?\n\n` +
          `Starting is a record that ${who} said yes, so the job moves out of the quote stage, ` +
          `the lead is marked won, and "${who} accepted the quote" goes on the job feed — where they can see it.\n\n` +
          `Press cancel if you're just tidying up dates.`;
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      <StartSubmit />
    </form>
  );
}

/** Its own component so useFormStatus reads THIS form's pending state. */
function StartSubmit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn secondary" disabled={pending} aria-busy={pending}>
      {pending ? 'Starting…' : 'Job started'}
    </button>
  );
}
