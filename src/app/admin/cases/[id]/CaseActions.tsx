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

      <form action={addNoteAction.bind(null, caseId)} className={styles.formStack}>
        <label>Add a note</label>
        <textarea className={styles.input} name="body" rows={3} placeholder="What did you find out or do?" />
        <button type="submit" className="btn secondary">Add note</button>
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
