import { describe, it, expect } from 'vitest';
import {
  MANUAL_ARTICLES,
  MANUAL_CHAPTER_DEFS,
  MANUAL_VISUALS,
  canStaffReadArticle,
  getPermittedManualArticle,
  getPermittedManualChapters,
  getPermittedManualSummaries,
  summarizeManualArticle,
} from '@/lib/admin-manual';
import { PERMISSIONS, STAFF_ROLES, type StaffRole } from '@/lib/staff';
import { ADMIN_MANUAL_VISUAL_COMPONENTS } from '@/components/admin-manual/visuals';

describe('Admin Manual Content Registry & Integrity', () => {
  it('has unique slugs across all articles', () => {
    const slugs = MANUAL_ARTICLES.map((a) => a.slug);
    const uniqueSlugs = new Set(slugs);
    expect(uniqueSlugs.size).toBe(slugs.length);
  });

  it('assigns valid chapterIds that match chapter definitions', () => {
    const chapterIds = new Set(MANUAL_CHAPTER_DEFS.map((c) => c.id));
    for (const article of MANUAL_ARTICLES) {
      expect(
        chapterIds.has(article.chapterId),
        `Article ${article.slug} has unknown chapterId ${article.chapterId}`,
      ).toBe(true);
    }
  });

  it('has strictly sequential chapter numbers starting at 1', () => {
    const numbers = MANUAL_CHAPTER_DEFS.map((c) => c.number);
    for (let i = 0; i < numbers.length; i++) {
      expect(numbers[i]).toBe(i + 1);
    }
  });

  it('ensures every requiredPermission is defined in PERMISSIONS in staff.ts', () => {
    for (const article of MANUAL_ARTICLES) {
      if (article.requiredPermission) {
        expect(
          (PERMISSIONS as readonly string[]).includes(article.requiredPermission),
          `Article ${article.slug} has invalid permission ${article.requiredPermission}`,
        ).toBe(true);
      }
    }
  });

  it('ensures every visualId has a corresponding registered SVG visual component', () => {
    for (const article of MANUAL_ARTICLES) {
      if (article.visualId) {
        expect(
          ADMIN_MANUAL_VISUAL_COMPONENTS[article.visualId],
          `Article ${article.slug} references unregistered visualId ${article.visualId}`,
        ).toBeDefined();
      }
    }
  });

  it('ensures all visuals have required accessibility and ownership metadata', () => {
    for (const visual of MANUAL_VISUALS) {
      expect(visual.id).toBeTruthy();
      expect(visual.title).toBeTruthy();
      expect(visual.questionAnswered).toBeTruthy();
      expect(visual.caption).toBeTruthy();
      expect(visual.textEquivalent).toBeTruthy();
      expect(visual.authoritativeFiles.length).toBeGreaterThan(0);
      expect(visual.owner).toBeTruthy();
      expect(visual.lastVerified).toBeTruthy();
      expect(ADMIN_MANUAL_VISUAL_COMPONENTS[visual.id]).toBeDefined();
    }
  });

  it('ensures all articles contain structured operational procedures with stop conditions', () => {
    for (const article of MANUAL_ARTICLES) {
      expect(article.title.trim().length).toBeGreaterThan(5);
      expect(article.summary.trim().length).toBeGreaterThan(15);
      expect(article.useThisWhen.trim().length).toBeGreaterThan(10);
      expect(article.desiredOutcome.trim().length).toBeGreaterThan(10);
      expect(article.procedure.length).toBeGreaterThan(0);
      expect(article.owner.trim().length).toBeGreaterThan(2);
      expect(article.backupOwner.trim().length).toBeGreaterThan(2);
      expect(article.authoritativeFiles.length).toBeGreaterThan(0);
      expect(article.lastVerifiedCommit).toBeTruthy();

      if (article.riskLevel === 'production') {
        expect(
          article.stopConditions.length,
          `Production article ${article.slug} must declare stop conditions`,
        ).toBeGreaterThan(0);
        expect(article.auditLogExpectation).toBeTruthy();
        expect(article.recoveryOrRollback).toBeTruthy();
        expect(article.escalationContact).toBeTruthy();
      }
    }
  });
});

describe('Server-Side Role Filtering & Permission Boundary', () => {
  it('gives super_admin access to all articles and chapters', () => {
    const chapters = getPermittedManualChapters('super_admin', true);
    expect(chapters.length).toBe(MANUAL_CHAPTER_DEFS.length);

    for (const article of MANUAL_ARTICLES) {
      const fetched = getPermittedManualArticle(article.slug, 'super_admin', true);
      expect(fetched, `super_admin could not read ${article.slug}`).not.toBeNull();
    }
  });

  it('gives read_only only general non-sensitive articles', () => {
    const chapters = getPermittedManualChapters('read_only', true);
    const permittedSlugs = chapters.flatMap((c) => c.articles.map((a) => a.slug));

    // read_only should see Start here and general navigation
    expect(permittedSlugs).toContain('start-here');
    expect(permittedSlugs).toContain('console-navigation-map');

    // read_only MUST NOT see mutating financial refunds or account delete
    expect(permittedSlugs).not.toContain('refunds-and-disputes');
    expect(permittedSlugs).not.toContain('account-closure-cascade');
    expect(permittedSlugs).not.toContain('suspensions-quick-stop-locks');
    expect(permittedSlugs).not.toContain('email-campaign-broadcasts');

    // Direct access to forbidden slug returns null
    expect(getPermittedManualArticle('refunds-and-disputes', 'read_only', true)).toBeNull();
    expect(getPermittedManualArticle('account-closure-cascade', 'read_only', true)).toBeNull();
  });

  it('restricts finance from viewing risk enforcement or account deletion runbooks', () => {
    const chapters = getPermittedManualChapters('finance', true);
    const permittedSlugs = chapters.flatMap((c) => c.articles.map((a) => a.slug));

    expect(permittedSlugs).toContain('payment-rails-overview');
    expect(permittedSlugs).toContain('payment-investigation-reconciliation');
    expect(permittedSlugs).toContain('refunds-and-disputes');

    expect(permittedSlugs).not.toContain('account-closure-cascade');
    expect(permittedSlugs).not.toContain('suspensions-quick-stop-locks');
  });

  it('restricts risk from viewing financial refund runbooks', () => {
    const chapters = getPermittedManualChapters('risk', true);
    const permittedSlugs = chapters.flatMap((c) => c.articles.map((a) => a.slug));

    expect(permittedSlugs).toContain('review-queue-verifications');
    expect(permittedSlugs).toContain('suspensions-quick-stop-locks');

    expect(permittedSlugs).not.toContain('refunds-and-disputes');
    expect(permittedSlugs).not.toContain('account-closure-cascade');
  });

  it('denies inactive staff members completely', () => {
    for (const role of STAFF_ROLES) {
      expect(getPermittedManualChapters(role, false)).toEqual([]);
      expect(getPermittedManualSummaries(role, false)).toEqual([]);
      for (const article of MANUAL_ARTICLES) {
        expect(getPermittedManualArticle(article.slug, role, false)).toBeNull();
      }
    }
  });
});

describe('Sanitized Client Summary Serialization', () => {
  it('strips sensitive procedure steps, stop conditions, and impact details from summaries', () => {
    for (const article of MANUAL_ARTICLES) {
      const summary = summarizeManualArticle(article);

      expect((summary as unknown as { procedure?: unknown }).procedure).toBeUndefined();
      expect((summary as unknown as { stopConditions?: unknown }).stopConditions).toBeUndefined();
      expect((summary as unknown as { impact?: unknown }).impact).toBeUndefined();
      expect((summary as unknown as { auditLogExpectation?: unknown }).auditLogExpectation).toBeUndefined();
      expect((summary as unknown as { recoveryOrRollback?: unknown }).recoveryOrRollback).toBeUndefined();

      expect(summary.slug).toBe(article.slug);
      expect(summary.title).toBe(article.title);
      expect(summary.summary).toBe(article.summary);
      expect(summary.keywords).toEqual(article.keywords);
    }
  });
});
