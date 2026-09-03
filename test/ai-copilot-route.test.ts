import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

describe('AI Copilot URL and Route Integrity', () => {
  it('verifies /features/ai-copilot route exists and renders AiCopilotWithAvatarsPage', () => {
    expect(existsSync('src/app/features/ai-copilot/page.tsx')).toBe(true);
    const source = readFileSync('src/app/features/ai-copilot/page.tsx', 'utf8');
    expect(source).toContain('AiCopilotWithAvatarsPage');
    expect(source).toContain("alternates: { canonical: 'https://letsgetquoted.com/features/ai-copilot' }");
    expect(source).toContain('path="/features/ai-copilot"');
  });

  it('verifies /features/sparky route continues to exist with /features/sparky canonical', () => {
    expect(existsSync('src/app/features/sparky/page.tsx')).toBe(true);
    const source = readFileSync('src/app/features/sparky/page.tsx', 'utf8');
    expect(source).toContain("alternates: { canonical: 'https://letsgetquoted.com/features/sparky' }");
  });

  it('verifies next.config.mjs provides redirects for both /sparky and /ai-copilot shortcuts', () => {
    const configSource = readFileSync('next.config.mjs', 'utf8');
    expect(configSource).toContain("{ source: '/sparky', destination: '/features/sparky', permanent: true }");
    expect(configSource).toContain("{ source: '/ai-copilot', destination: '/features/ai-copilot', permanent: true }");
    expect(configSource).toContain("{ source: '/copilot', destination: '/features/ai-copilot', permanent: true }");
    expect(configSource).toContain("{ source: '/aicopilot', destination: '/features/ai-copilot', permanent: true }");
  });

  it('verifies sitemap includes both ai-copilot and sparky feature slugs', () => {
    const sitemapSource = readFileSync('src/app/sitemap.ts', 'utf8');
    expect(sitemapSource).toContain("'ai-copilot'");
    expect(sitemapSource).toContain("'sparky'");
  });

  it('verifies FeaturesCatalogExplorer deep links include ai-copilot', () => {
    const explorerSource = readFileSync('src/app/features/FeaturesCatalogExplorer.tsx', 'utf8');
    expect(explorerSource).toContain("'ai-copilot': '/features/ai-copilot'");
    expect(explorerSource).toContain("'sparky-ai': '/features/sparky'");
  });
});
