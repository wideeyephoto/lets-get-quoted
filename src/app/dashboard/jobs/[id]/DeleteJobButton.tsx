'use client';

export default function DeleteJobButton({ action }: { action: (formData: FormData) => Promise<void> }) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm('Delete this job and all its logged costs? This cannot be undone.')) {
          event.preventDefault();
        }
      }}
    >
      <button type="submit" className="btn danger">
        Delete job
      </button>
    </form>
  );
}
