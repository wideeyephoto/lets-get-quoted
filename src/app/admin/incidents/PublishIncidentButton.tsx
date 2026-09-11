'use client';

import { useState } from 'react';
import { togglePublishIncidentAction } from './actions';

/**
 * Publishing is the step that puts words in front of customers.
 *
 * togglePublishIncidentAction has existed since the status page was written and
 * had no caller anywhere in the app, so an operator could mark an incident
 * resolved and still had no way to tell anyone outside the company about it —
 * /status could only ever have been empty. This is the control.
 *
 * The confirm is deliberate in one direction only. Publishing is the
 * consequential click, so it asks; unpublishing is the retraction and should
 * never be the slow path when something wrong is already public.
 */
export default function PublishIncidentButton({
  incidentId,
  title,
  published,
}: {
  incidentId: string;
  title: string;
  published: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  if (published) {
    return (
      <form action={togglePublishIncidentAction} style={{ display: 'inline' }}>
        <input type="hidden" name="incident_id" value={incidentId} />
        <input type="hidden" name="published" value="false" />
        <button type="submit" className="btn secondary" style={{ minHeight: 32, fontSize: '.8rem' }}>
          Unpublish from /status
        </button>
      </form>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className="btn secondary"
        style={{ minHeight: 32, fontSize: '.8rem' }}
        onClick={() => setConfirming(true)}
      >
        Publish to /status…
      </button>
    );
  }

  return (
    <form action={togglePublishIncidentAction} style={{ display: 'inline' }} aria-label={`Publish ${title}`}>
      <input type="hidden" name="incident_id" value={incidentId} />
      <input type="hidden" name="published" value="true" />
      <button type="submit" className="btn primary" style={{ minHeight: 32, fontSize: '.8rem' }}>
        Confirm — show customers
      </button>{' '}
      <button type="button" className="btn secondary" style={{ minHeight: 32, fontSize: '.8rem' }} onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </form>
  );
}
