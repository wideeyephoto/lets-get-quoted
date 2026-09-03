import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import nextConfig from '../next.config.mjs';

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

  it('verifies next.config.mjs provides redirects for both /sparky and /ai-copilot shortcuts', async () => {
    const redirects = await nextConfig.redirects();
    const findRedirect = (source: string) => redirects.find((r: { source: string }) => r.source === source);

    const sparky = findRedirect('/sparky');
    expect(sparky).toBeDefined();
    expect(sparky?.destination).toBe('/features/sparky');

    const aiCopilot = findRedirect('/ai-copilot');
    expect(aiCopilot).toBeDefined();
    expect(aiCopilot?.destination).toBe('/features/ai-copilot');

    const copilot = findRedirect('/copilot');
    expect(copilot).toBeDefined();
    expect(copilot?.destination).toBe('/features/ai-copilot');

    const aicopilot = findRedirect('/aicopilot');
    expect(aicopilot).toBeDefined();
    expect(aicopilot?.destination).toBe('/features/ai-copilot');
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
