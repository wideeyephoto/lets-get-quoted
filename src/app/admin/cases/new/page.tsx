import { requireAdmin } from '@/lib/auth';
import styles from '../../admin.module.css';
import { createCaseAction } from './actions';
import { listAccountsForAdmin, accountDisplayName } from '@/lib/admin-accounts';
import { listStaff } from '@/lib/staff-directory';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New case' };

const ERROR_MESSAGES: Record<string, string> = {
  subject: 'Enter a subject for the case.',
  account: 'Choose a valid account.',
  assignee: 'Choose a valid staff assignee.',
  sla: 'Enter a valid SLA date and time.',
  failed: 'The case could not be created. Try again.',
};

export default async function NewCasePage({ searchParams }: { searchParams: { account_id?: string; error?: string } }) {
  const ctx = await requireAdmin();
  let accountsAvailable = true;
  let staffAvailable = true;
  const [accounts, staff] = await Promise.all([
    listAccountsForAdmin(ctx.admin, { limit: 200, onError: () => { accountsAvailable = false; } }),
    listStaff(ctx.admin, () => { staffAvailable = false; }),
  ]);

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Support</p>
        <h1 className={styles.title}>New case</h1>
        <p className={styles.lead}>Open a case for anything that needs staff follow-up — a general platform issue or something tied to one account.</p>
      </header>

      {searchParams.error ? <div className={`${styles.banner} ${styles.err}`}>{ERROR_MESSAGES[searchParams.error] ?? 'Something went wrong.'}</div> : null}
      {!accountsAvailable || !staffAvailable ? <div className={`${styles.banner} ${styles.err}`}>Account or staff choices are incomplete. Refresh before assigning this case.</div> : null}

      <section className={styles.panel}>
        <form action={createCaseAction} className={styles.formStack}>
          <label htmlFor="case-subject">Subject</label>
          <input id="case-subject" className={styles.input} name="subject" required placeholder="What's this case about?" autoFocus />

          <label htmlFor="case-account">Account (optional)</label>
          <select id="case-account" className={styles.input} name="account_id" defaultValue={searchParams.account_id ?? ''}>
            <option value="">General platform case</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{accountDisplayName(account)}{account.account_number ? ` · #${account.account_number}` : ''}</option>
            ))}
          </select>

          <label htmlFor="case-body">Initial internal note (optional)</label>
          <textarea id="case-body" className={styles.input} name="body" rows={5} placeholder="Context, investigation already done, and the next useful step" />

          <label htmlFor="case-priority">Priority</label>
          <select id="case-priority" className={styles.input} name="priority" defaultValue="normal">
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>

          <label htmlFor="case-assignee">Assign to</label>
          <select id="case-assignee" className={styles.input} name="assigned_to" defaultValue={ctx.adminEmail}>
            <option value="">Unassigned</option>
            {staff.filter((person) => person.active).map((person) => (
              <option key={person.id} value={person.email}>{person.display_name ? `${person.display_name} · ` : ''}{person.email}</option>
            ))}
          </select>

          <label htmlFor="case-sla">SLA due (UTC)</label>
          <input id="case-sla" className={styles.input} name="sla_due_at" type="datetime-local" />
          <p className={styles.fieldHint}>Leave blank to use the priority default: urgent 4h, high 24h, normal 3 days, low 5 days.</p>

          <div className={styles.actionRow}>
            <button type="submit" className="btn primary">Create case</button>
          </div>
        </form>
      </section>
    </>
  );
}
