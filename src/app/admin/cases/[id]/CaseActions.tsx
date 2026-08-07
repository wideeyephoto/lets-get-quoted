'use client';

import styles from '../../admin.module.css';
import { addNoteAction, changeStatusAction, assignCaseAction } from './actions';
import type { CaseStatus } from '@/lib/support-cases';

const STATUSES: CaseStatus[] = ['open', 'pending', 'resolved', 'closed'];

export default function CaseActions({
  caseId,
  status,
  assignedTo,
}: {
  caseId: string;
  status: CaseStatus;
  assignedTo: string | null;
}) {
  return (
    <section className={styles.panel}>
      <p className={styles.panelTitle}>Staff actions</p>

      {/* Two buttons, not a checkbox.
          A tickbox has a default, and both defaults are wrong: unticked sends
          an internal note the customer is waiting on into a void, ticked sends
          working notes to the person they are about. Two named buttons make the
          consequence part of the click — you cannot forget which one you meant.
          The `visibility` value rides on the submitter, and the server falls
          back to 'internal' if it somehow arrives as anything else. */}
      <form action={addNoteAction.bind(null, caseId)} className={styles.formStack}>
        <label>Add to the thread</label>
        <textarea className={styles.input} name="body" rows={3} placeholder="What did you find out or do?" />
        <div className={styles.searchRow} style={{ margin: 0 }}>
          <button type="submit" name="visibility" value="internal" className="btn secondary">
            Internal note
          </button>
          <button type="submit" name="visibility" value="customer" className="btn primary">
            Reply to customer
          </button>
        </div>
        <p className={styles.muted} style={{ margin: '.4rem 0 0', fontSize: '.8rem' }}>
          A reply appears in the customer’s thread at /dashboard/help and is emailed to them. An internal note never
          leaves this page.
        </p>
      </form>

      <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1rem 0' }} />

      <form action={changeStatusAction.bind(null, caseId)} className={styles.formStack}>
        <label>Change status</label>
        <div className={styles.searchRow} style={{ margin: 0 }}>
          <select className={styles.input} name="status" defaultValue={status} style={{ minWidth: 0, flex: '0 0 160px' }}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="submit" className="btn secondary">Update status</button>
        </div>
      </form>

      <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1rem 0' }} />

      <form action={assignCaseAction.bind(null, caseId)} className={styles.formStack}>
        <label>Assign to</label>
        <div className={styles.searchRow} style={{ margin: 0 }}>
          <input className={styles.input} name="assigned_to" defaultValue={assignedTo ?? ''} placeholder="Staff email, or leave blank to unassign" />
          <button type="submit" className="btn secondary">Save</button>
        </div>
      </form>
    </section>
  );
}
