'use client';

export default function DeleteInvoiceButton({ action }: { action: (formData: FormData) => Promise<void> }) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm('Delete this invoice and all of its line items? This cannot be undone.')) {
          event.preventDefault();
        }
      }}
    >
      <button type="submit" className="btn danger">
        Delete invoice
      </button>
    </form>
  );
}
