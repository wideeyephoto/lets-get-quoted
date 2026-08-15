import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { getSupportCase, listSupportCaseNotes } from '@/lib/support-cases';
import { accountDisplayName } from '@/lib/admin-accounts';
import { listStaff } from '@/lib/staff-directory';
import styles from '../../admin.module.css';
import CaseActions from './CaseActions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Case detail' };

const DONE_MESSAGES: Record<string, string> = {
  created: 'Case created.',
  noted: 'Internal note added — the customer cannot see it.',
  replied: 'Reply sent to the customer and emailed to them.',
  status: 'Status updated.',
  assigned: 'Assignment updated.',
};
const ERROR_MESSAGES: Record<string, string> = {
  note: 'Enter a note before submitting.',
  status: 'Pick a valid status.',
  assignee: 'Choose an active staff member.',
  save: 'That change could not be saved. Try again.',
  initial_note: 'The case was created, but its initial note could not be saved.',
};

function statusPill(status: string) {
  const cls = status === 'open' ? styles.warn : status === 'pending' ? styles.neutral : styles.good;
  return <span className={`${styles.pill} ${cls}`}>{status}</span>;
}
function priorityPill(priority: string) {
  const cls = priority === 'urgent' ? styles.bad : priority === 'high' ? styles.warn : styles.neutral;
  return <span className={`${styles.pill} ${cls}`}>{priority}</span>;
}

export default async function AdminCaseDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { done?: string; error?: string };
}) {
  const { admin } = await requireAdmin();
  const supportCase = await getSupportCase(admin, params.id);
  if (!supportCase) notFound();

  let staffAvailable = true;
  const [notes, staff] = await Promise.all([
    listSupportCaseNotes(admin, params.id),
    listStaff(admin, () => { staffAvailable = false; }),
  ]);
  type CaseAccountRow = { id: string; business_name: string | null; account_number: number | null };
  let account: CaseAccountRow | null = null;
  if (supportCase.account_id) {
    const { data, error } = await admin.from('accounts').select('id, business_name, account_number').eq('id', supportCase.account_id).maybeSingle();
    if (error) console.error('case account lookup failed:', error);
    account = data as CaseAccountRow | null;
  }

  return (
    <>
      <Link href="/admin/cases" className={styles.backLink}>← Cases</Link>

      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Case</p>
        <h1 className={styles.title}>{supportCase.subject}</h1>
        <p className={styles.lead}>
          Opened by <strong>{supportCase.created_by}</strong> on {new Date(supportCase.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
        <div className={styles.actionRow} style={{ marginTop: '.6rem' }}>
          {statusPill(supportCase.status)}
          {priorityPill(supportCase.priority)}
        </div>
      </header>

      {searchParams.done ? <div className={`${styles.banner} ${styles.ok}`}>{DONE_MESSAGES[searchParams.done] ?? 'Done.'}</div> : null}
      {searchParams.error ? <div className={`${styles.banner} ${styles.err}`}>{ERROR_MESSAGES[searchParams.error] ?? 'Something went wrong.'}</div> : null}
      {!staffAvailable ? <div className={`${styles.banner} ${styles.err}`}>The staff directory is unavailable, so assignment choices are incomplete.</div> : null}

      <div className={styles.detailGrid}>
        <div>
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Summary</h2>
            <dl className={styles.kv}>
              <dt>Account</dt>
              <dd>{account ? <Link href={`/admin/accounts/${account.id}`} className={styles.rowLink}>{accountDisplayName(account)}</Link> : <span className={styles.muted}>General / platform case</span>}</dd>
              <dt>Raised by</dt>
              <dd>
                {supportCase.source === 'customer' ? 'The customer, from /dashboard/help' : 'Staff'}
                {supportCase.requester_email ? <> — replies go to <strong>{supportCase.requester_email}</strong></> : null}
                {supportCase.source === 'customer' && !supportCase.requester_email ? (
                  <span className={styles.muted}> — no reply address on file, so a reply will not be emailed</span>
                ) : null}
              </dd>
              <dt>Assigned to</dt><dd>{supportCase.assigned_to || <span className={styles.muted}>Unassigned</span>}</dd>
              <dt>SLA due</dt><dd>{supportCase.sla_due_at ? new Date(supportCase.sla_due_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : <span className={styles.muted}>—</span>}</dd>
            </dl>
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Thread</h2>
            {/* Staff see the whole thread; the customer sees only the rows
                marked Shared. Marking every row means the distinction is read
                off the note in front of you rather than inferred from who wrote
                it — which is how somebody eventually pastes an internal note
                into a reply. */}
            {notes.length === 0 ? (
              <p className={styles.emptyState}>Nothing on this case yet.</p>
            ) : (
              <ul className={styles.timeline}>
                {notes.map((n) => (
                  <li key={n.id}>
                    <time>{new Date(n.created_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}</time>
                    <span>
                      <span className={`${styles.pill} ${n.visibility === 'customer' ? styles.good : styles.neutral}`}>
                        {n.visibility === 'customer' ? 'Shared' : 'Internal'}
                      </span>{' '}
                      <span className={styles.timelineActor}>{n.created_by}</span>
                      {n.kind === 'status_change' ? <span className={styles.muted}> ({n.body})</span> : <>{' — '}{n.body}</>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div>
          <CaseActions caseId={supportCase.id} status={supportCase.status} assignedTo={supportCase.assigned_to} staff={staff.filter((person) => person.active)} />
        </div>
      </div>
    </>
  );
}
