import type { Metadata } from 'next';
import Link from 'next/link';
import { ManualExplorer } from './ManualExplorer';
import {
  FEATURED_MANUAL_ARTICLE_SLUGS,
  MANUAL_ARTICLES,
  MANUAL_CHAPTERS,
  MANUAL_LAST_VERIFIED,
  getManualArticle,
  getManualArticleSummaries,
} from '@/lib/help/user-manual';
import styles from './manual.module.css';

export const metadata: Metadata = {
  title: 'Dashboard User Manual',
  description: 'Learn how to set up and use every part of the Let’s Get Quoted dashboard, from new leads to final payment.',
  alternates: { canonical: 'https://letsgetquoted.com/help/manual' },
};

const featuredArticles = FEATURED_MANUAL_ARTICLE_SLUGS.map((slug) => getManualArticle(slug)).filter(Boolean);

export default function UserManualPage() {
  return (
    <main className={styles.manualRoot}>
      <div className={styles.topBar}>
        <div className={styles.shell}>
          <Link href="/help" className={styles.backLink}>← Help Center</Link>
          <nav className={styles.topLinks} aria-label="Manual shortcuts">
            <a href="#quick-start">Quick start</a>
            <a href="#manual-library-heading">All guides</a>
            <Link href="/dashboard/help">Contact support</Link>
          </nav>
        </div>
      </div>

      <header className={`${styles.hero} ${styles.shell}`}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Let’s Get Quoted · Dashboard User Manual</p>
          <h1>Run the whole job from one clear playbook.</h1>
          <p className={styles.heroLead}>
            Task-by-task guidance for setting up the dashboard, responding to leads, scheduling work,
            coordinating crews, getting paid, and growing repeat business.
          </p>
          <div className={styles.heroActions}>
            <Link href="/help/manual/first-30-minutes" className={styles.primaryAction}>Start with the first 30 minutes</Link>
            <a href="#manual-library-heading" className={styles.secondaryAction}>Browse all guides</a>
          </div>
          <p className={styles.verified}>Content verified {MANUAL_LAST_VERIFIED}</p>
        </div>
        <aside className={styles.heroPanel} aria-label="What the manual covers">
          <div className={styles.statGrid}>
            <div><strong>{MANUAL_CHAPTERS.length}</strong><span>chapters</span></div>
            <div><strong>{MANUAL_ARTICLES.length}</strong><span>task guides</span></div>
            <div><strong>3</strong><span>team roles</span></div>
            <div><strong>1</strong><span>complete workflow</span></div>
          </div>
          <p>Each guide tells you where to go, what to do, what the customer sees, and how to recover when something goes wrong.</p>
        </aside>
      </header>

      <section className={`${styles.quickStart} ${styles.shell}`} id="quick-start" aria-labelledby="quick-start-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>Most-used workflows</p>
            <h2 id="quick-start-heading">Get productive quickly</h2>
          </div>
          <p>New here? Read these in order. Already working? Jump straight to the task in front of you.</p>
        </div>
        <div className={styles.featuredGrid}>
          {featuredArticles.map((article, index) => article ? (
            <Link href={`/help/manual/${article.slug}`} className={styles.featuredCard} key={article.slug}>
              <span className={styles.featuredIndex}>{String(index + 1).padStart(2, '0')}</span>
              <span>
                <strong>{article.title}</strong>
                <span>{article.summary}</span>
              </span>
              <span className={styles.featuredTime}>{article.readMinutes} min</span>
            </Link>
          ) : null)}
        </div>
      </section>

      <div className={styles.shell}>
        <ManualExplorer articles={getManualArticleSummaries()} chapters={MANUAL_CHAPTERS} />
      </div>

      <section className={styles.supportBand}>
        <div className={styles.shell}>
          <div>
            <p className={styles.kicker}>Still stuck?</p>
            <h2>Bring the exact issue to our team.</h2>
            <p>Tell us what you were doing, what you expected, and what happened instead.</p>
          </div>
          <Link href="/dashboard/help#new-request" className={styles.primaryAction}>Contact support</Link>
        </div>
      </section>
    </main>
  );
}
