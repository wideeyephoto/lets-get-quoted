import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import {
  FEATURED_MANUAL_ARTICLE_SLUGS,
  MANUAL_ARTICLES,
  MANUAL_CHAPTERS,
  getManualArticle,
  getManualArticleSummaries,
  getManualArticlesInReadingOrder,
} from '@/lib/help/user-manual';
import { MANUAL_FIELD_NOTES, getManualFieldNotes } from '@/lib/help/manual-field-notes';

describe('dashboard user manual', () => {
  it('covers every chapter with substantial, task-focused guidance', () => {
    expect(MANUAL_CHAPTERS).toHaveLength(9);
    expect(MANUAL_ARTICLES.length).toBeGreaterThanOrEqual(40);

    for (const chapter of MANUAL_CHAPTERS) {
      expect(MANUAL_ARTICLES.some((article) => article.chapterId === chapter.id)).toBe(true);
    }

    for (const article of MANUAL_ARTICLES) {
      expect(article.title.trim().length).toBeGreaterThan(8);
      expect(article.summary.trim().length).toBeGreaterThan(20);
      expect(article.outcome.trim().length).toBeGreaterThan(20);
      expect(article.sections.length).toBeGreaterThanOrEqual(2);
      expect(article.troubleshooting.length).toBeGreaterThan(0);
      expect(article.audiences.length).toBeGreaterThan(0);
      expect(article.routes.length).toBeGreaterThan(0);
      expect(article.routes.every((route) => route.href.startsWith('/dashboard') || route.href.startsWith('/help'))).toBe(true);
    }
  });

  it('uses unique slugs and only references guides that exist', () => {
    const slugs = MANUAL_ARTICLES.map((article) => article.slug);
    expect(new Set(slugs).size).toBe(slugs.length);

    const missingRelated = MANUAL_ARTICLES.flatMap((article) =>
      article.related
        .filter((relatedSlug) => !getManualArticle(relatedSlug))
        .map((relatedSlug) => `${article.slug} -> ${relatedSlug}`),
    );
    expect(missingRelated).toEqual([]);

    for (const slug of FEATURED_MANUAL_ARTICLE_SLUGS) {
      expect(getManualArticle(slug)).toBeDefined();
    }
  });

  it('keeps the browser search payload compact and preserves reading order', () => {
    const summaries = getManualArticleSummaries();
    expect(summaries).toHaveLength(MANUAL_ARTICLES.length);
    expect(summaries.every((article) => !('sections' in article) && !('troubleshooting' in article))).toBe(true);

    const ordered = getManualArticlesInReadingOrder();
    expect(ordered[0]?.slug).toBe('first-30-minutes');
    expect(ordered.at(-1)?.slug).toBe('find-help-and-contact-support');
  });

  it('gives every guide task-specific field notes and completion proof', () => {
    const articleSlugs = MANUAL_ARTICLES.map((article) => article.slug).sort();
    const fieldNoteSlugs = Object.keys(MANUAL_FIELD_NOTES).sort();
    expect(fieldNoteSlugs).toEqual(articleSlugs);

    for (const article of MANUAL_ARTICLES) {
      const notes = getManualFieldNotes(article.slug);
      expect(notes).toBeDefined();
      expect(notes?.useWhen.length).toBeGreaterThan(40);
      expect(notes?.bestPractice.length).toBeGreaterThan(40);
      expect(notes?.watchFor.length).toBeGreaterThan(40);
      expect(notes?.completionChecks).toHaveLength(3);
      expect(notes?.completionChecks.every((check) => check.length > 30)).toBe(true);
    }
  });

  it('renders the strengthened article controls and sections through the shared template', () => {
    const articlePage = readFileSync('src/app/help/manual/[slug]/page.tsx', 'utf8');
    const articleActions = readFileSync('src/app/help/manual/[slug]/ManualArticleActions.tsx', 'utf8');
    expect(articlePage).toContain('id="at-a-glance"');
    expect(articlePage).toContain('id="completion-check"');
    expect(articlePage).toContain('fieldNotes.bestPractice');
    expect(articlePage).toContain('fieldNotes.watchFor');
    expect(articleActions).toContain('navigator.clipboard.writeText');
    expect(articleActions).toContain('window.print()');
  });

  it('is discoverable from both Help Center entry points', () => {
    const publicHelp = readFileSync('src/components/help-center/HelpCenter.tsx', 'utf8');
    const dashboardHelp = readFileSync('src/app/dashboard/help/page.tsx', 'utf8');
    expect(publicHelp).toContain('href="/help/manual"');
    expect(dashboardHelp).toContain('href="/help/manual"');
    expect(dashboardHelp).toContain('href="/help/manual/first-30-minutes"');
  });
});
