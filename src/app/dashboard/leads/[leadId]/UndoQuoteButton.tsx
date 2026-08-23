'use client';

/**
 * THE WAY BACK FROM A QUOTE THAT WENT OUT WRONG.
 *
 * It reads as a correction now rather than as a demolition, because that is
 * what it does. It still deletes the job — it has to, since the job is what the
 * customer holds a link to, and a half-real one left behind is worse than none
 * — but the quote itself comes back to the form: line items, hours, deposit,
 * payment schedule. See LeadQuoteDraft.
 *
 * The confirm stays. Deleting a job is not undoable and the copy has to name
 * what goes with it; what changed is that it no longer has to warn about losing
 * the quote, because the quote is the thing that survives.
 */
export default function UndoQuoteButton({ action }: { action: () => Promise<void> }) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          // "invoices" was in this list and PAYMENTS were not, though they
          // cascade off the job exactly as invoices do. Somebody correcting a
          // price after taking a deposit was told their line items were safe
          // while the deposit record was being deleted underneath them. The
          // delete now refuses outright when money is attached (see deleteJob),
          // so this says what will actually happen in both cases.
          !window.confirm(
            'Pull this quote back to edit it?\n\n'
            + 'The job it created is deleted, along with any costs, invoices or schedule requests on it. '
            + 'Your line items, hours and payment terms are kept, so you can change what you need and send it again.\n\n'
            + 'If a payment has already been taken on this job, nothing is deleted and you will be told to void or refund it first.',
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <button type="submit" className="btn danger">
        Edit &amp; resend quote
      </button>
    </form>
  );
}
