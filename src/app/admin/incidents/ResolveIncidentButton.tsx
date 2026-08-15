'use client';

import { useState } from 'react';
import { resolveIncidentAction } from './actions';
import styles from '../admin.module.css';

/**
 * Resolving stamps a time that goes on record as how long an outage lasted, and
 * the action refuses a second click — so the confirm is here to stop the first
 * one being accidental rather than to protect the data.
 */
export default function ResolveIncidentButton({ incidentId, title }: { incidentId: string; title: string }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="btn secondary" style={{ minHeight: 32, fontSize: '.8rem' }} onClick={() => setOpen(true)}>Resolve…</button>;
  return (
    <form action={resolveIncidentAction.bind(null, incidentId)} className={styles.formStack} aria-label={`Resolve ${title}`}>
      <label htmlFor={`resolution-${incidentId}`}>Resolution summary</label>
      <input id={`resolution-${incidentId}`} className={styles.compactInput} name="resolution_summary" required minLength={4} placeholder="What restored service?" />
      <label htmlFor={`root-cause-${incidentId}`}>Root cause (optional)</label>
      <input id={`root-cause-${incidentId}`} className={styles.compactInput} name="root_cause" placeholder="Underlying cause, if known" />
      <button type="submit" className="btn secondary" style={{ minHeight: 32, fontSize: '.8rem' }}>
        Confirm resolved now
      </button>
      <button type="button" className="btn secondary" onClick={() => setOpen(false)}>Cancel</button>
    </form>
  );
}
