import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient, requireOwnerContext } from '@/lib/auth';
import {
  BODY_MAX,
  CUSTOMER_STATUS_LABEL,
  CUSTOMER_STATUS_NOTE,
  SUPPORT_ERROR_MESSAGE,
  canCustomerReply,
  loadAccountCaseThread,
  type SupportFormError,
} from '@/lib/support-portal';
import { replyToSupportCaseAction } from '../actions';
import styles from '../help.module.css';

export const metadata = { title: 'Help request' };

/**
 * One request, and the conversation on it.
 *
 * The thread is the SAME support_case_notes rows staff work in — filtered to
 * visibility='customer'. There is no second copy to keep in step, which is the
 * whole reason the case system got a front end rather than a mail merge.
 *
 * loadAccountCaseThread proves the case belongs to this account before it will
 * read a single note. A case belonging to somebody else comes back null and
 * lands on notFound(), identical to a case id that never existed — so guessing
 * ids tells an attacker nothing.
 */

export const dynamic = 'force-dynamic';

const DONE_MESSAGE: Record<string, string> = {
  opened: 'Sent. We will email you when somebody replies.',
  replied: 'Reply sent.',
};

export default async function HelpCasePage({
  params,
  searchParams,
}: {
  params: { caseId: string };
  searchParams: { error?: string; done?: string };
}) {
  const { accountId, userEmail } = await requireOwnerContext();
  const admin = createAdminClient();

  const loaded = await loadAccountCaseThread(admin, accountId, params.caseId);
  if (!loaded) notFound();
  const { supportCase, thread } = loaded;

  const error = searchParams.error as SupportFormError | undefined;
  const errorMessage = error ? SUPPORT_ERROR_MESSAGE[error] ?? SUPPORT_ERROR_MESSAGE.failed : null;
  const doneMessage = searchParams.done ? DONE_MESSAGE[searchParams.done] ?? null : null;
  const open = canCustomerReply(supportCase.status);

  return (
    <main className="wide-shell workspace-shell">
      <Link href="/dashboard/help" className={styles.backLink}>← All requests</Link>

      <header className={styles.head}>
        <p className="eyebrow">Your request</p>
        <h1 className={styles.title}>{supportCase.subject}</h1>
      </header>

      {doneMessage ? <p className={`${styles.banner} ${styles.ok}`} role="status">{doneMessage}</p> : null}
      {errorMessage ? <p className={`${styles.banner} ${styles.err}`} role="alert">{errorMessage}</p> : null}

      {/* The state, then what it means. "Pending" on its own tells somebody
          waiting on an answer nothing about who is holding the ball. */}
      <div className={styles.statusCard}>
        <span className={styles.status} data-status={supportCase.status}>
          {CUSTOMER_STATUS_LABEL[supportCase.status]}
        </span>
        <p className={styles.statusNote}>{CUSTOMER_STATUS_NOTE[supportCase.status]}</p>
      </div>

      {thread.length === 0 ? (
        <p className="empty-state">Nothing on this one yet.</p>
      ) : (
        <ul className={styles.thread}>
          {thread.map((note) => {
            // Ours or theirs. created_by is an email, and on a case where a
            // second person from the business replied it is not the requester's
            // — so this asks whether it is a LGQ address rather than whether it
            // matches one particular customer.
            const fromSupport = isSupportAuthor(note.created_by);
            return (
              <li key={note.id} className={styles.message} data-mine={fromSupport ? 'false' : 'true'}>
                <div className={styles.messageHead}>
                  <span className={styles.messageWho}>
                    {fromSupport ? 'Let’s Get Quoted support' : authorLabel(note.created_by, userEmail)}
                  </span>
                  <span className={styles.messageWhen}>{formatWhen(note.created_at)}</span>
                </div>
                <p className={styles.messageBody}>{note.body}</p>
              </li>
            );
          })}
        </ul>
      )}

      {open ? (
        <section className={styles.form}>
          <h2 className={styles.formTitle}>Add to this request</h2>
          <p className={styles.formNote}>Anything else that would help, or an answer to what we asked.</p>
          <form action={replyToSupportCaseAction.bind(null, supportCase.id)}>
            <label className={styles.field}>
              <span className={styles.label}>Your reply</span>
              <textarea className={styles.textarea} name="body" maxLength={BODY_MAX} required placeholder="Type your reply…" />
            </label>
            <div className={styles.submitRow}>
              <button type="submit" className="btn primary">Send reply</button>
            </div>
          </form>
        </section>
      ) : (
        <p className={styles.closedNote}>
          This request is closed. If it comes back, <Link href="/dashboard/help#new-request">open a new one</Link> and
          we will pick it up from there.
        </p>
      )}
    </main>
  );
}

/**
 * Whether a note was written by us.
 *
 * Staff identity is an email allowlist in config, which a server component
 * could read — but the thread here is already filtered to customer-visible
 * notes, so the only question left is presentation. Matching the sending
 * domain keeps that decision out of the account's data and cannot leak which
 * individual staff address wrote it.
 */
function isSupportAuthor(createdBy: string): boolean {
  return createdBy.trim().toLowerCase().endsWith('@letsgetquoted.com');
}

function authorLabel(createdBy: string, viewerEmail: string | null): string {
  if (viewerEmail && createdBy.trim().toLowerCase() === viewerEmail.trim().toLowerCase()) return 'You';
  return createdBy;
}

function formatWhen(iso: string): string {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return '';
  return at.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}
