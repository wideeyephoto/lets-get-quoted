import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { getAllArticles } from '@/components/help-center/help-center-data';

describe('Help Center Article & Global Heading Typography', () => {
  it('has exactly 17 public help center articles with non-empty titles', () => {
    const articles = getAllArticles();
    expect(articles.length).toBe(17);
    for (const article of articles) {
      expect(article.slug).toBeTruthy();
      expect(article.title.trim().length).toBeGreaterThan(10);
    }
  });

  it('ensures article.module.css overrides max-width to unconstrained for articleTitle', () => {
    const cssPath = path.resolve(__dirname, '../src/app/help/articles/[slug]/article.module.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    expect(css).toContain('.articleTitle');
    expect(css).toMatch(/\.articleTitle\s*\{[^}]*max-width:\s*none;/);
  });

  it('ensures globals.css bare h1 rule does not constrain max-width to 11ch', () => {
    const globalsPath = path.resolve(__dirname, '../src/app/globals.css');
    const globals = fs.readFileSync(globalsPath, 'utf8');
    
    // Find the base h1 { ... } rule
    const h1RuleMatch = globals.match(/(?:^|\n)h1\s*\{([^}]+)\}/);
    expect(h1RuleMatch).toBeTruthy();
    if (h1RuleMatch) {
      expect(h1RuleMatch[1]).not.toContain('11ch');
    }
  });

  it('ensures globals-lite.css bare h1 rule does not constrain max-width to 11ch', () => {
    const globalsLitePath = path.resolve(__dirname, '../src/app/globals-lite.css');
    const globalsLite = fs.readFileSync(globalsLitePath, 'utf8');
    
    const h1RuleMatch = globalsLite.match(/(?:^|\n)h1\s*\{([^}]+)\}/);
    expect(h1RuleMatch).toBeTruthy();
    if (h1RuleMatch) {
      expect(h1RuleMatch[1]).not.toContain('11ch');
    }
  });
});
