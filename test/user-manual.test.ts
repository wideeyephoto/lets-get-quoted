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

  it('includes all 5 new articles and adheres to verified technical truths', () => {
    expect(MANUAL_ARTICLES).toHaveLength(51);

    const newSlugs = [
      'turn-on-the-customer-portal',
      'set-up-your-own-text-alerts',
      'install-the-field-app-and-work-without-signal',
      'manage-your-marketing-list-and-opt-outs',
      'cancel-your-plan-or-delete-your-account',
    ];
    for (const slug of newSlugs) {
      expect(getManualArticle(slug), `Article ${slug} should exist`).toBeDefined();
      expect(getManualFieldNotes(slug), `Field notes for ${slug} should exist`).toBeDefined();
    }

    // Custom domain verification: never cname.letsgetquoted.com, always domains.letsgetquoted.com
    const websiteArticle = getManualArticle('build-and-publish-your-website');
    expect(JSON.stringify(websiteArticle)).toContain('domains.letsgetquoted.com');
    expect(JSON.stringify(websiteArticle)).not.toContain('cname.letsgetquoted.com');

    // Platform fee verification
    const stripeArticle = getManualArticle('connect-stripe-and-get-paid');
    expect(JSON.stringify(stripeArticle)).toContain('125 bps (1.25%)');
    expect(JSON.stringify(stripeArticle)).toContain('50 bps (0.50%)');
    expect(JSON.stringify(stripeArticle)).toContain('25 bps (0.25%)');
    expect(JSON.stringify(stripeArticle)).toContain('10 bps (0.10%)');

    // Chargeback verification
    const refundArticle = getManualArticle('manage-refunds-and-payment-problems');
    expect(JSON.stringify(refundArticle)).toContain('dispute_due_by');
    expect(JSON.stringify(refundArticle)).toContain('support@letsgetquoted.com');

    // Irreversible actions warnings
    const jobArticle = getManualArticle('manage-the-job-workspace');
    expect(JSON.stringify(jobArticle)).toContain('cannot be undone');
    const clientArticle = getManualArticle('manage-client-records');
    expect(JSON.stringify(clientArticle)).toContain('cannot be undone');
    const deletePlanArticle = getManualArticle('cancel-your-plan-or-delete-your-account');
    expect(JSON.stringify(deletePlanArticle)).toContain('cannot be undone');
  });

  it('precomputes search text and successfully indexes core task keywords', () => {
    const summaries = getManualArticleSummaries();
    expect(summaries.every((s) => typeof s.searchText === 'string' && s.searchText.length > 20)).toBe(true);

    const indexedTerms = [
      'delete',
      'discount',
      'undo',
      'password',
      'print',
      'decline',
      'offline',
      'cancel',
      'weather alerts',
      'magic link',
    ];

    for (const term of indexedTerms) {
      const matchCount = summaries.filter(
        (s) =>
          s.searchText?.toLowerCase().includes(term) ||
          s.title.toLowerCase().includes(term) ||
          s.summary.toLowerCase().includes(term) ||
          s.keywords.some((k) => k.toLowerCase().includes(term)),
      ).length;
      expect(matchCount, `Search indexing should match term: "${term}"`).toBeGreaterThan(0);
    }
  });
});

