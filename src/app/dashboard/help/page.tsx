import Link from 'next/link';
import { createAdminClient, requireOfficeContext } from '@/lib/auth';
import {
  BODY_MAX,
  CUSTOMER_STATUS_LABEL,
  SUBJECT_MAX,
  SUPPORT_ERROR_MESSAGE,
  lastActivityByCase,
  listAccountCases,
  type SupportFormError,
} from '@/lib/support-portal';
import { ARTICLES } from '@/lib/resources';
import { MANUAL_ARTICLES } from '@/lib/help/user-manual';
import { HelpTourRestartButton } from '@/components/product-tour/ProductTourLauncher';
import { openSupportCaseAction } from './actions';
import styles from './help.module.css';

export const metadata = { title: 'Help & Guides' };

export const dynamic = 'force-dynamic';

const POPULAR_GUIDE_SLUGS = [
  'contractor-10dlc-sms-compliance-guide',
  'deposits-and-payment-plans',
  'good-better-best-quoting-guide',
  'more-google-reviews',
];

export default async function HelpPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const searchParams = (await searchParamsPromise) || {};
  const { accountId } = await requireOfficeContext('leads.read');
  const admin = createAdminClient();

  const cases = await listAccountCases(admin, accountId);
  const activity = await lastActivityByCase(admin, cases.map((c) => c.id));

  const error = searchParams.error as SupportFormError | undefined;
  const errorMessage = error ? SUPPORT_ERROR_MESSAGE[error] ?? SUPPORT_ERROR_MESSAGE.failed : null;

  const popularGuides = POPULAR_GUIDE_SLUGS.map((slug) => ARTICLES.find((a) => a.slug === slug)).filter(Boolean);

  return (
    <main className="wide-shell workspace-shell">
      <header className={styles.head}>
        <p className="eyebrow">Help & Guides</p>
        <h1 className={styles.title}>Ask us anything or browse guides</h1>
        <p className={styles.lead}>
          Instant answers in our contractor playbooks, or tell us what is going on and a real person will pick it up.
        </p>
        <div style={{ marginTop: '16px' }}>
          <HelpTourRestartButton />
        </div>
      </header>

      {errorMessage ? <p className={`${styles.banner} ${styles.err}`} role="alert">{errorMessage}</p> : null}

      <section className={styles.manualCallout} aria-labelledby="dashboard-manual-heading">
        <div className={styles.manualMark} aria-hidden="true">?</div>
        <div className={styles.manualCopy}>
          <p className={styles.manualEyebrow}>Dashboard user manual</p>
          <h2 id="dashboard-manual-heading">Learn every workflow, from first lead to final payment</h2>
          <p>
            Search {MANUAL_ARTICLES.length} task-focused guides with setup steps, best practices, customer-facing details,
            and troubleshooting for owners, office staff, and crew.
          </p>
        </div>
        <div className={styles.manualActions}>
          <Link href="/help/manual" className="btn primary">Open user manual</Link>
          <Link href="/help/manual/first-30-minutes" className={styles.manualStart}>Start with the first 30 minutes →</Link>
        </div>
      </section>

      {/* Instant self-service guides */}
      <section className={styles.guidesSection} aria-labelledby="help-guides-heading">
        <div className={styles.guidesHead}>
          <p className={styles.sectionTitle} id="help-guides-heading" style={{ margin: 0 }}>
            Instant contractor guides
          </p>
          <Link href="/resources" target="_blank" rel="noopener noreferrer">
            Browse all {ARTICLES.length} guides ↗
          </Link>
        </div>
        <div className={styles.guidesGrid}>
          {popularGuides.map((guide) => (
            <Link
              key={guide!.slug}
              href={`/resources/${guide!.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.guideCard}
            >
              <span className={styles.guideTag}>{guide!.category}</span>
              <strong className={styles.guideTitle}>{guide!.title}</strong>
              <span className={styles.guideExcerpt}>{guide!.excerpt}</span>
            </Link>
          ))}
        </div>
      </section>

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
