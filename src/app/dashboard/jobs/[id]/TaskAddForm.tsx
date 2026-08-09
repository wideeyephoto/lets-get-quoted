'use client';

import { useRef, useState, useTransition } from 'react';

/**
 * Adding one item to the punch list.
 *
 * Its own client component for one reason: THE BOX HAS TO EMPTY. This was a
 * plain `<form action={serverAction}>`, and a server action does not reset the
 * form it was submitted from — so after adding "Haul away debris" the words
 * stayed in the input with an Add button beside them, which is a picture of an
 * unsaved task rather than a saved one. The obvious response is to press Add
 * again, and now the job has the same item twice.
 *
 * RESET ONLY ON SUCCESS, which is why this is not a `resetOnSave` flag bolted
 * onto SaveButton. SaveButton reads useFormStatus, and a server action that
 * THROWS also takes pending back to false — so a reset driven from there would
 * clear the box on a failed add and lose what somebody typed. The same reason
 * ContactForm calls the action itself and only resets inside `if (res.ok)`.
 *
 * Failure is also now visible at all, which it was not. The old form's only
 * feedback was SaveButton's "Added ✓", which it showed whether the add landed
 * or threw.
 */
export default function TaskAddForm({ action }: { action: (formData: FormData) => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startAdding] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const title = String(new FormData(form).get('title') ?? '').trim();
    if (!title || pending) return;

    const data = new FormData();
    data.set('title', title);
    setProblem(null);
    startAdding(async () => {
      try {
        await action(data);
        form.reset();
        // Straight back to typing. Somebody building a punch list is adding
        // five things, not one, and reaching for the mouse between each is the
        // difference between a list that gets finished and one that does not.
        inputRef.current?.focus();
      } catch (error) {
        setProblem(error instanceof Error ? error.message : 'Could not add that task.');
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="task-add-form">
      <input
        ref={inputRef}
        name="title"
        placeholder="Add a task (e.g. Haul away debris)"
        required
        maxLength={120}
        aria-label="New task"
        aria-describedby="task-add-problem"
      />
      <button type="submit" className="btn secondary" disabled={pending} aria-busy={pending}>
        {pending ? 'Adding…' : 'Add'}
      </button>
      <p id="task-add-problem" className="task-add-problem" role="alert">{problem ?? ''}</p>
    </form>
  );
}
