import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

describe('homepage theme contrast isolation', () => {
  const flagship = read('src', 'components', 'flagship', 'flagship.module.css');
  const generator = read('scripts', 'generate-flagship-css.mjs');
  const globals = read('src', 'app', 'globals.css');
  const globalsLite = read('src', 'app', 'globals-lite.css');
  const homepage = read('src', 'app', 'page.tsx');
  const highTechShowcase = read('src', 'components', 'marketing', 'high-tech-showcase.module.css');
  const quoteUpsellDemo = read(
    'src',
    'components',
    'marketing',
    'interactive-quote-upsell-demo.module.css',
  );

  it('keeps the flagship preflight lower-specificity than embedded component classes', () => {
    for (const css of [flagship, generator]) {
      expect(css).toContain('.root :where(h1, h2, h3, h4, h5, h6)');
      expect(css).toContain('.root :where(button) { background: none;');
      expect(css).toContain('.root :where(button, a) { font: inherit; }');
      expect(css).not.toMatch(/\.root button\s*\{\s*background:\s*none/);
    }
    expect(flagship).not.toContain('.root :global(button) { color: inherit; }');
    expect(generator).toContain("'.root :global(button) { color: inherit; }'");
    expect(generator).toContain("'.root :where(button) { color: inherit; }'");
  });

  it('keeps broad Sunlight typography and Workbench title fallbacks inside app chrome', () => {
    for (const css of [globals, globalsLite]) {
      expect(css).toContain(":root[data-theme='sunlight'] .chrome-shell h1");
      expect(css).toContain(":root[data-theme='sunlight'] .chrome-shell p");
      expect(css).not.toContain(":root[data-theme='sunlight'] h1,");
      expect(css).not.toContain(":root[data-theme='sunlight'] p,");
      expect(css).toContain(":root[data-theme='light'] .chrome-shell-sidenav [class*='title']");
      expect(css).not.toContain(":root[data-theme='light'] [class*='title'] {");
    }
  });

  it('provides readable Workbench pricing text colors', () => {
    for (const css of [flagship, generator]) {
      expect(css).toContain(".root :global(.pricing-copy > .eyebrow) {\n  color: #c9430a;");
      expect(css).toContain(".root :global(.pricing-fineprint) {\n  color: #475569;");
      expect(css).toContain(".root :global(.pricing-fineprint b) {\n  color: #334155;");
    }
  });

  it('keeps Dim trust-strip hover text on the readable side of its dark fill', () => {
    for (const css of [flagship, generator]) {
      expect(css).toContain(".root :global(.trust-strip span:hover b),");
      expect(css).toContain('color: #ff9564;');
    }
  });

  it('keeps the keyboard skip link readable when outer themes replace flagship tokens', () => {
    for (const css of [flagship, generator]) {
      expect(css).toMatch(
        /\.root :global\(\.skip-link\)\s*\{[\s\S]*?background:\s*#fffdf8;[\s\S]*?color:\s*#07131d;/,
      );
    }
  });

  it('uses readable foregrounds for solid homepage action buttons', () => {
    expect(highTechShowcase).toMatch(/\.chatSendBtn\s*\{[\s\S]*?background:\s*#0369a1;[\s\S]*?color:\s*#(?:fff|ffffff);/);
    expect(highTechShowcase).toMatch(/\.chatSendBtn:hover\s*\{[\s\S]*?background:\s*#075985;/);
    expect(quoteUpsellDemo).toMatch(/\.companyLogo\s*\{[\s\S]*?color:\s*#3d1200;/);
    expect(quoteUpsellDemo).toMatch(/\.signBtn\s*\{[\s\S]*?color:\s*#3d1200;[\s\S]*?font-weight:\s*800;/);
  });

  it('suppresses the request-specific nonce mismatch on homepage structured data', () => {
    expect(homepage).toContain('id="homepage-structured-data"');
    expect(homepage).toMatch(/nonce=\{await cspNonce\(\)\}\s+suppressHydrationWarning/);
  });
});
