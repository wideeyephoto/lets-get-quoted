'use client';

import { useCallback, useState, type FormEvent, type ReactNode } from 'react';
import { looksOffline, payloadFor, queueFieldSubmission, type FieldQueueKind } from '@/lib/field-offline-client';

/**
 * A field-app form that survives losing signal mid-tap.
 *
 * ONLINE, THIS COMPONENT DOES NOTHING. The submit event is not touched, the
 * server action runs, the page redirects — byte for byte the behavior that
 * shipped. That is deliberate: the ordinary path runs thousands of times a day
 * and offline support has no business changing it.
 *
 * Offline, the submit is intercepted and posted as JSON to /field/api/queue,
 * where the service worker catches the network failure and holds it. The form
 * clears and says so, because the alternative — a button that appears dead
 * while somebody stands in a basement — is what makes people write hours on the
 * back of a receipt and key them in a week later.
 */
export default function FieldOfflineForm({
  action,
  kind,
  jobId,
  className,
  children,
  queuedLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  kind: FieldQueueKind;
  jobId: string;
  className?: string;
  children: ReactNode;
  /** What to say once it's held. Named per form because "Saved ✓" is a lie. */
  queuedLabel: string;
}) {
  const [held, setHeld] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      if (!looksOffline()) return; // Let the server action have it.
      event.preventDefault();
      const form = event.currentTarget;
      const payload = payloadFor(kind, form);
      setProblem(null);

      void queueFieldSubmission(kind, jobId, payload).then((outcome) => {
        if (outcome.state === 'failed') {
          setProblem(outcome.message);
          return;
        }
        // 'sent' as well as 'queued': the browser said offline and was wrong,
        // which is common on a bad connection. Either way it's off the phone.
        setHeld(outcome.state === 'queued' ? queuedLabel : 'Saved ✓');
        form.reset();
      });
    },
    [jobId, kind, queuedLabel],
  );

  return (
    <form action={action} onSubmit={onSubmit} className={className}>
      {children}
      {held ? (
        <p className="field-queue-note" role="status">
          {held}
        </p>
      ) : null}
      {problem ? (
        <p className="field-flash is-error" role="status">
          {problem}
        </p>
      ) : null}
    </form>
  );
}
