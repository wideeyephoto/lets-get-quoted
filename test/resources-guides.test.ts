import { describe, expect, it } from 'vitest';
import {
  ARTICLES,
  ARTICLE_CATEGORIES,
  getArticle,
  relatedArticles,
  formatArticleDate,
} from '@/lib/resources';

describe('contractor guides & resources library', () => {
  it('has unique slugs for all articles', () => {
    const slugs = ARTICLES.map((a) => a.slug);
    const uniqueSlugs = new Set(slugs);
    expect(uniqueSlugs.size).toBe(ARTICLES.length);
  });

  it('contains comprehensive guides across all expected categories', () => {
    expect(ARTICLES.length).toBeGreaterThanOrEqual(18);
    expect(ARTICLE_CATEGORIES).toContain('Pricing & profit');
    expect(ARTICLE_CATEGORIES).toContain('Getting leads');
    expect(ARTICLE_CATEGORIES).toContain('Getting paid');
    expect(ARTICLE_CATEGORIES).toContain('Reputation');
    expect(ARTICLE_CATEGORIES).toContain('Operations & crew');
    expect(ARTICLE_CATEGORIES).toContain('Customer messaging');
  });

  it('every article has valid content, structure, and positive read time', () => {
    for (const article of ARTICLES) {
      expect(article.slug.trim()).not.toBe('');
      expect(article.title.trim()).not.toBe('');
      expect(article.excerpt.trim()).not.toBe('');
      expect(article.category.trim()).not.toBe('');
      expect(article.readMinutes).toBeGreaterThan(0);
      expect(article.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(article.body.length).toBeGreaterThan(2);

      // Verify each block
      for (const block of article.body) {
        if (block.type === 'p' || block.type === 'h2') {
          expect(block.text.trim()).not.toBe('');
        } else if (block.type === 'ul') {
          expect(block.items.length).toBeGreaterThan(0);
          for (const item of block.items) {
            expect(item.trim()).not.toBe('');
          }
        }
      }

      // Verify feature links if present
      if (article.featureLinks) {
        for (const link of article.featureLinks) {
          expect(link.href.startsWith('/')).toBe(true);
          expect(link.label.trim()).not.toBe('');
          expect(link.blurb.trim()).not.toBe('');
        }
      }
    }
  });

  it('resolves getArticle correctly for every slug', () => {
    for (const article of ARTICLES) {
      const found = getArticle(article.slug);
      expect(found).toBeDefined();
      expect(found?.slug).toBe(article.slug);
    }
    expect(getArticle('non-existent-guide-slug')).toBeUndefined();
  });

  it('returns related articles excluding current article', () => {
    for (const article of ARTICLES) {
      const related = relatedArticles(article.slug, 3);
      expect(related.length).toBeGreaterThan(0);
      expect(related.map((r) => r.slug)).not.toContain(article.slug);
    }
  });

  it('formats dates consistently', () => {
    expect(formatArticleDate('2026-07-08')).toBe('July 8, 2026');
    expect(formatArticleDate('2026-08-25')).toBe('August 25, 2026');
  });
});
