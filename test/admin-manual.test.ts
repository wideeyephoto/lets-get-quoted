import { describe, it, expect } from 'vitest';
import {
  MANUAL_ARTICLES,
  MANUAL_CHAPTER_DEFS,
  MANUAL_VISUALS,
  getPermittedManualChapters,
  getPermittedManualSummaries,
  getPermittedManualArticle,
  getAdjacentPermittedManualArticles,
  canStaffReadArticle,
} from '@/lib/admin-manual';
import { ADMIN_MANUAL_VISUAL_COMPONENTS } from '@/components/admin-manual/visuals';

describe('Admin Manual Authoritative Articles & Chapters', () => {
  it('has unique slugs across all manual articles', () => {
    const slugs = MANUAL_ARTICLES.map((a) => a.slug);
    const uniqueSlugs = new Set(slugs);
    expect(slugs.length).toBe(uniqueSlugs.size);
  });

  it('ensures every article references a valid defined chapter', () => {
    const validChapterIds = new Set(MANUAL_CHAPTER_DEFS.map((c) => c.id));
    for (const article of MANUAL_ARTICLES) {
      expect(
        validChapterIds.has(article.chapterId),
        `Article "${article.slug}" references unknown chapterId "${article.chapterId}"`,
      ).toBe(true);
    }
  });

  it('ensures every visualId in articles is registered in visuals array and components map', () => {
    const registeredVisualIds = new Set(MANUAL_VISUALS.map((v) => v.id));
    for (const article of MANUAL_ARTICLES) {
      if (article.visualId) {
        expect(
          registeredVisualIds.has(article.visualId),
          `Article "${article.slug}" references visualId "${article.visualId}" not in MANUAL_VISUALS`,
        ).toBe(true);
        expect(
          ADMIN_MANUAL_VISUAL_COMPONENTS[article.visualId],
          `Article "${article.slug}" references visualId "${article.visualId}" not mapped in ADMIN_MANUAL_VISUAL_COMPONENTS`,
        ).toBeDefined();
      }
    }
  });

  it('validates all required article fields and procedural steps', () => {
    for (const article of MANUAL_ARTICLES) {
      expect(article.slug.trim().length).toBeGreaterThan(0);
      expect(article.title.trim().length).toBeGreaterThan(0);
      expect(article.summary.trim().length).toBeGreaterThan(0);
      expect(article.keywords.length).toBeGreaterThan(0);
      expect(article.intendedRoles.length).toBeGreaterThan(0);
      expect(article.useThisWhen.trim().length).toBeGreaterThan(0);
      expect(article.desiredOutcome.trim().length).toBeGreaterThan(0);
      expect(article.procedure.length).toBeGreaterThan(0);
      expect(article.stopConditions.length).toBeGreaterThan(0);
      expect(article.expectedResult.trim().length).toBeGreaterThan(0);
      expect(article.impact.customer.trim().length).toBeGreaterThan(0);
      expect(article.impact.business.trim().length).toBeGreaterThan(0);
      expect(article.auditLogExpectation.trim().length).toBeGreaterThan(0);
      expect(article.recoveryOrRollback.trim().length).toBeGreaterThan(0);
      expect(article.escalationContact.trim().length).toBeGreaterThan(0);
      expect(article.authoritativeFiles.length).toBeGreaterThan(0);

      article.procedure.forEach((step, idx) => {
        expect(step.stepNumber).toBe(idx + 1);
        expect(step.title.trim().length).toBeGreaterThan(0);
        expect(step.instruction.trim().length).toBeGreaterThan(0);
      });
    }
  });

  it('verifies the new SOPs exist and are properly indexed', () => {
    const slugs = new Set(MANUAL_ARTICLES.map((a) => a.slug));
    expect(slugs.has('ai-operator-copilot-triage')).toBe(true);
    expect(slugs.has('homeowner-service-requests-triage')).toBe(true);
    expect(slugs.has('ad-budget-wallets-billing')).toBe(true);
    expect(slugs.has('speed-to-lead-tcpa-compliance')).toBe(true);
    expect(slugs.has('theme-engine-custom-domains')).toBe(true);
    expect(slugs.has('quickbooks-sync-triage')).toBe(true);
    expect(slugs.has('sms-hotline-provisioning')).toBe(true);
    expect(slugs.has('contractor-lifecycle-dunning')).toBe(true);
  });
});

describe('Admin Manual Role Permissions & Filtering', () => {
  it('allows super_admin to access all articles and chapters', () => {
    const chapters = getPermittedManualChapters('super_admin', true);
    const summaries = getPermittedManualSummaries('super_admin', true);

    expect(chapters.length).toBe(MANUAL_CHAPTER_DEFS.length);
    expect(summaries.length).toBe(MANUAL_ARTICLES.length);
  });

  it('returns empty array when staff is inactive', () => {
    const chapters = getPermittedManualChapters('super_admin', false);
    const summaries = getPermittedManualSummaries('super_admin', false);
    const article = getPermittedManualArticle('start-here', 'super_admin', false);

    expect(chapters).toEqual([]);
    expect(summaries).toEqual([]);
    expect(article).toBeNull();
  });

  it('filters role access appropriately for support and finance', () => {
    const aiArticle = MANUAL_ARTICLES.find((a) => a.slug === 'ai-operator-copilot-triage')!;
    const adArticle = MANUAL_ARTICLES.find((a) => a.slug === 'ad-budget-wallets-billing')!;
    const qbArticle = MANUAL_ARTICLES.find((a) => a.slug === 'quickbooks-sync-triage')!;
    const deleteArticle = MANUAL_ARTICLES.find((a) => a.slug === 'account-closure-cascade')!;

    // Support can read AI operator copilot & QuickBooks triage
    expect(canStaffReadArticle(aiArticle, 'support', true)).toBe(true);
    expect(canStaffReadArticle(qbArticle, 'support', true)).toBe(true);
    // Support cannot read account closure cascade
    expect(canStaffReadArticle(deleteArticle, 'support', true)).toBe(false);

    // Finance can read ad budget wallet billing & QuickBooks triage
    expect(canStaffReadArticle(adArticle, 'finance', true)).toBe(true);
    expect(canStaffReadArticle(qbArticle, 'finance', true)).toBe(true);
    // Finance cannot read account closure cascade
    expect(canStaffReadArticle(deleteArticle, 'finance', true)).toBe(false);
  });

  it('correctly calculates adjacent permitted articles within the same chapter', () => {
    const startHereAdjacent = getAdjacentPermittedManualArticles('start-here', 'super_admin', true);
    expect(startHereAdjacent.prev).toBeNull();
    expect(startHereAdjacent.next).not.toBeNull();
    expect(startHereAdjacent.next?.slug).toBe('console-navigation-map');

    const consoleMapAdjacent = getAdjacentPermittedManualArticles('console-navigation-map', 'super_admin', true);
    expect(consoleMapAdjacent.prev?.slug).toBe('start-here');
    expect(consoleMapAdjacent.next).toBeNull();
  });

  it('sanitizes article summaries for client search indexing without exposing procedures', () => {
    const summaries = getPermittedManualSummaries('super_admin', true);
    for (const summary of summaries) {
      expect((summary as Record<string, unknown>).procedure).toBeUndefined();
      expect((summary as Record<string, unknown>).stopConditions).toBeUndefined();
      expect((summary as Record<string, unknown>).impact).toBeUndefined();
      expect(summary.slug).toBeDefined();
      expect(summary.title).toBeDefined();
      expect(summary.chapterId).toBeDefined();
    }
  });
});

