'use client';

export default function UndoQuoteButton({ action }: { action: () => Promise<void> }) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm('Undo this sent quote? This deletes the job it created (and any linked costs, invoices, or schedule requests) so you can resend it with the correct details.')) {
          event.preventDefault();
        }
      }}
    >
      <button type="submit" className="btn danger">
        Undo sent quote
      </button>
    </form>
  );
}
