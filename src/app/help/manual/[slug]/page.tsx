import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  MANUAL_ARTICLES,
  MANUAL_LAST_VERIFIED,
  getManualArticle,
  getManualChapter,
  getManualNeighbors,
  getRelatedManualArticles,
} from '@/lib/help/user-manual';
import { getManualFieldNotes } from '@/lib/help/manual-field-notes';
import { ManualArticleActions } from './ManualArticleActions';
import styles from '../manual.module.css';

type ManualArticlePageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return MANUAL_ARTICLES.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params: paramsPromise }: ManualArticlePageProps): Promise<Metadata> {
  const params = await paramsPromise;
  const article = getManualArticle(params.slug);
  if (!article) return { title: 'Guide not found' };
  return {
    title: `${article.title} | Dashboard User Manual`,
    description: article.summary,
    alternates: { canonical: `https://letsgetquoted.com/help/manual/${article.slug}` },
  };
}

export default async function ManualArticlePage({ params: paramsPromise }: ManualArticlePageProps) {
  const params = await paramsPromise;
  const article = getManualArticle(params.slug);
  if (!article) notFound();

  const chapter = getManualChapter(article.chapterId);
  if (!chapter) notFound();

  const relatedArticles = getRelatedManualArticles(article);
  const neighbors = getManualNeighbors(article.slug);
  const fieldNotes = getManualFieldNotes(article.slug);
  if (!fieldNotes) notFound();

  return (
    <main className={styles.manualRoot}>
      <div className={styles.topBar}>
        <div className={styles.shell}>
          <Link href="/help/manual" className={styles.backLink}>← User Manual</Link>
          <nav className={styles.topLinks} aria-label="Guide shortcuts">
            <a href="#at-a-glance">At a glance</a>
            <a href="#steps">Instructions</a>
            <a href="#completion-check">Checklist</a>
            <Link href="/dashboard/help">Contact support</Link>
          </nav>
        </div>
      </div>

      <div className={`${styles.articleShell} ${styles.shell}`}>
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          <Link href="/help">Help Center</Link><span aria-hidden="true">/</span>
          <Link href="/help/manual">User Manual</Link><span aria-hidden="true">/</span>
          <span>{chapter.shortTitle}</span>
        </nav>

        <header className={styles.articleHero}>
          <div>
            <p className={styles.eyebrow}>Chapter {chapter.number} · Guide {chapter.number}.{article.order}</p>
            <h1>{article.title}</h1>
            <p className={styles.articleLead}>{article.summary}</p>
            <div className={styles.articleDetails}>
              <span>{article.readMinutes} minute read</span>
              <span>Verified {MANUAL_LAST_VERIFIED}</span>
            </div>
            <div className={styles.audienceList} aria-label={`For ${article.audiences.join(', ')}`}>
              {article.audiences.map((role) => <span key={role}>{role}</span>)}
            </div>
            <ManualArticleActions />
          </div>
          <aside className={styles.outcomeCard}>
            <span>When you’re done</span>
            <strong>{article.outcome}</strong>
          </aside>
        </header>

        <section className={styles.guideSnapshot} id="at-a-glance" aria-labelledby="at-a-glance-heading">
          <h2 className={styles.srOnly} id="at-a-glance-heading">At a glance</h2>
          <article>
            <span className={styles.snapshotIcon} aria-hidden="true">01</span>
            <div><strong>Use this guide when</strong><p>{fieldNotes.useWhen}</p></div>
          </article>
          <article>
            <span className={styles.snapshotIcon} aria-hidden="true">02</span>
            <div><strong>Best practice</strong><p>{fieldNotes.bestPractice}</p></div>
          </article>
          <article data-caution="true">
            <span className={styles.snapshotIcon} aria-hidden="true">!</span>
            <div><strong>Watch for</strong><p>{fieldNotes.watchFor}</p></div>
          </article>
        </section>

        <div className={styles.articleLayout}>
          <aside className={styles.articleSidebar}>
            <div className={styles.sidebarBlock}>
              <strong>Open in the dashboard</strong>
              {article.routes.map((route) => (
                <Link href={route.href} key={`${route.href}-${route.label}`}>{route.label}<span aria-hidden="true">↗</span></Link>
              ))}
            </div>
            <div className={styles.sidebarBlock}>
              <strong>Before you begin</strong>
              <ul>{article.prerequisites.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
            <div className={styles.sidebarBlock}>
              <strong>In this guide</strong>
              <ol>
                <li><a href="#at-a-glance">At a glance</a></li>
                {article.sections.map((section, index) => (
                  <li key={section.title}><a href={`#section-${index + 1}`}>{section.title}</a></li>
                ))}
                <li><a href="#completion-check">Completion check</a></li>
                <li><a href="#troubleshooting">Troubleshooting</a></li>
              </ol>
            </div>
          </aside>

          <article className={styles.articleBody} id="steps">
            {article.sections.map((section, index) => (
              <section id={`section-${index + 1}`} key={section.title}>
                <div className={styles.sectionNumber}>{String(index + 1).padStart(2, '0')}</div>
                <h2>{section.title}</h2>
                {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {section.steps ? (
                  <ol className={styles.stepsList}>
                    {section.steps.map((step) => <li key={step}>{step}</li>)}
                  </ol>
                ) : null}
                {section.bullets ? (
                  <ul className={styles.bulletList}>
                    {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                  </ul>
                ) : null}
              </section>
            ))}

            {article.customerView ? (
              <aside className={styles.customerView}>
                <span>What the customer sees</span>
                <p>{article.customerView}</p>
              </aside>
            ) : null}

            <section id="completion-check" className={styles.completionSection}>
              <p className={styles.kicker}>Completion check</p>
              <h2>Confirm before moving on</h2>
              <p>Use these checks to make sure the dashboard and the real-world workflow agree.</p>
              <ul className={styles.completionList}>
                {fieldNotes.completionChecks.map((check) => (
                  <li key={check}><span aria-hidden="true">✓</span>{check}</li>
                ))}
              </ul>
            </section>

            <section id="troubleshooting" className={styles.troubleshooting}>
              <p className={styles.kicker}>Troubleshooting</p>
              <h2>When the workflow doesn’t look right</h2>
              <div className={styles.problemList}>
                {article.troubleshooting.map((item) => (
                  <details key={item.problem}>
                    <summary>{item.problem}</summary>
                    <p>{item.fix}</p>
                  </details>
                ))}
              </div>
            </section>

            <aside className={styles.articleSupportCard}>
              <div>
                <p className={styles.kicker}>Need a second set of eyes?</p>
                <strong>Send support one issue with the record, time, expected result, and what happened instead.</strong>
              </div>
              <Link href="/dashboard/help#new-request">Open a support request →</Link>
            </aside>

            {relatedArticles.length > 0 ? (
              <section className={styles.relatedSection}>
                <p className={styles.kicker}>Keep going</p>
                <h2>Related guides</h2>
                <div className={styles.relatedGrid}>
                  {relatedArticles.map((related) => (
                    <Link href={`/help/manual/${related.slug}`} key={related.slug}>
                      <strong>{related.title}</strong>
                      <span>{related.summary}</span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </article>
        </div>

        <nav className={styles.articlePager} aria-label="Adjacent manual guides">
          {neighbors.previous ? (
            <Link href={`/help/manual/${neighbors.previous.slug}`}>
              <span>← Previous</span><strong>{neighbors.previous.title}</strong>
            </Link>
          ) : <span />}
          {neighbors.next ? (
            <Link href={`/help/manual/${neighbors.next.slug}`}>
              <span>Next →</span><strong>{neighbors.next.title}</strong>
            </Link>
          ) : <span />}
        </nav>
      </div>
    </main>
  );
}
