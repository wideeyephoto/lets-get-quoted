'use client';

import { resolveIncidentAction } from './actions';

/**
 * Resolving stamps a time that goes on record as how long an outage lasted, and
 * the action refuses a second click — so the confirm is here to stop the first
 * one being accidental rather than to protect the data.
 */
export default function ResolveIncidentButton({ incidentId, title }: { incidentId: string; title: string }) {
  return (
    <form
      action={resolveIncidentAction.bind(null, incidentId)}
      style={{ display: 'inline' }}
      onSubmit={(event) => {
        if (!window.confirm(`Mark "${title}" resolved as of now?`)) event.preventDefault();
      }}
    >
      <button type="submit" className="btn secondary" style={{ minHeight: 32, fontSize: '.8rem' }}>
        Mark resolved
      </button>
    </form>
  );
}
