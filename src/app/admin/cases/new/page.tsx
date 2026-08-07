import { requireAdmin } from '@/lib/auth';
import styles from '../../admin.module.css';
import { createCaseAction } from './actions';

export const dynamic = 'force-dynamic';

const ERROR_MESSAGES: Record<string, string> = {
  subject: 'Enter a subject for the case.',
};

export default async function NewCasePage({ searchParams }: { searchParams: { account_id?: string; error?: string } }) {
  await requireAdmin();

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Support</p>
        <h1 className={styles.title}>New case</h1>
        <p className={styles.lead}>Open a case for anything that needs staff follow-up — a general platform issue or something tied to one account.</p>
      </header>

      {searchParams.error ? <div className={`${styles.banner} ${styles.err}`}>{ERROR_MESSAGES[searchParams.error] ?? 'Something went wrong.'}</div> : null}

      <section className={styles.panel}>
        <form action={createCaseAction} className={styles.formStack}>
          <label>Subject</label>
          <input className={styles.input} name="subject" placeholder="What's this case about?" autoFocus />

          <label>Account ID (optional)</label>
          <input className={styles.input} name="account_id" defaultValue={searchParams.account_id ?? ''} placeholder="Leave blank for a general/platform case" />

          <label>Priority</label>
          <select className={styles.input} name="priority" defaultValue="normal">
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>

          <label>Assign to (staff email, optional)</label>
          <input className={styles.input} name="assigned_to" placeholder="e.g. support@letsgetquoted.com" />

          <label>SLA due (optional)</label>
          <input className={styles.input} name="sla_due_at" type="datetime-local" />

          <div className={styles.actionRow}>
            <button type="submit" className="btn primary">Create case</button>
          </div>
        </form>
      </section>
    </>
  );
}
