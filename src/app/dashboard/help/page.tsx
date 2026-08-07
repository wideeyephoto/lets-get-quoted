import Link from 'next/link';
import { createAdminClient, requireOwnerContext } from '@/lib/auth';
import {
  BODY_MAX,
  CUSTOMER_STATUS_LABEL,
  SUBJECT_MAX,
  SUPPORT_ERROR_MESSAGE,
  lastActivityByCase,
  listAccountCases,
  type SupportFormError,
} from '@/lib/support-portal';
import { openSupportCaseAction } from './actions';
import styles from './help.module.css';

/**
 * Help — where a contractor asks us something and can see what happened next.
 *
 * Until now the only support route from inside the product was an email address
 * on the account-suspended page, which you can only reach by being suspended.
 * Everything else went through the public /contact form into an inbox, so
 * nobody could check on their own request and nothing linked it to an account.
 *
 * The list comes FIRST when there is one. People arrive here twice: once to ask
 * and many times to find out whether anyone answered, and the second visit is
 * the more common one.
 */

export const dynamic = 'force-dynamic';

export default async function HelpPage({ searchParams }: { searchParams: { error?: string; done?: string } }) {
  const { accountId } = await requireOwnerContext();
  const admin = createAdminClient();

  const cases = await listAccountCases(admin, accountId);
  const activity = await lastActivityByCase(admin, cases.map((c) => c.id));

  const error = searchParams.error as SupportFormError | undefined;
  const errorMessage = error ? SUPPORT_ERROR_MESSAGE[error] ?? SUPPORT_ERROR_MESSAGE.failed : null;

  return (
    <main className="wide-shell workspace-shell">
      <header className={styles.head}>
        <p className="eyebrow">Help</p>
        <h1 className={styles.title}>Ask us anything</h1>
        <p className={styles.lead}>
          Tell us what is going on and a real person will pick it up. Everything you send lands here, so you can
          check on it without digging through your email.
        </p>
      </header>

      {errorMessage ? <p className={`${styles.banner} ${styles.err}`} role="alert">{errorMessage}</p> : null}

      {cases.length > 0 ? (
        <>
          <p className={styles.sectionTitle}>Your requests</p>
          <ul className={styles.cases}>
            {cases.map((entry) => {
              const live = entry.status === 'open' || entry.status === 'pending';
              const last = activity.get(entry.id) ?? entry.created_at;
              return (
                <li key={entry.id}>
                  <Link href={`/dashboard/help/${entry.id}`} className={styles.case} data-live={live ? 'true' : 'false'}>
                    <span>
                      <span className={styles.caseSubject}>{entry.subject}</span>
                      <span className={styles.caseMeta}>
                        Opened {formatWhen(entry.created_at)}
                        {last !== entry.created_at ? ` · last update ${formatWhen(last)}` : ''}
                      </span>
                    </span>
                    {/* The word carries the state. The tint only agrees with it. */}
                    <span className={styles.status} data-status={entry.status}>
                      {CUSTOMER_STATUS_LABEL[entry.status]}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      <section className={styles.form} id="new-request">
        <h2 className={styles.formTitle}>{cases.length > 0 ? 'Something else?' : 'What do you need?'}</h2>
        <p className={styles.formNote}>
          One thing per request, so nothing gets lost in a long thread.
        </p>

        <form action={openSupportCaseAction}>
          <label className={styles.field}>
            <span className={styles.label}>What is it about?</span>
            <input
              className={styles.input}
              name="subject"
              maxLength={SUBJECT_MAX}
              required
              placeholder="e.g. Payouts stopped after I updated Stripe"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>
              What is going on? <span className={styles.hint}>The more detail the fewer times we have to ask.</span>
            </span>
            <textarea
              className={styles.textarea}
              name="body"
              maxLength={BODY_MAX}
              required
              placeholder="What you were doing, what you expected, and what happened instead."
            />
          </label>

          <div className={styles.submitRow}>
            <button type="submit" className="btn primary">Send to support</button>
            <span className={styles.reassure}>We will email you when we reply.</span>
          </div>
        </form>
      </section>
    </main>
  );
}

/** Rendered on the server, so no clock is read during hydration. */
function formatWhen(iso: string): string {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return 'recently';
  return at.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}
