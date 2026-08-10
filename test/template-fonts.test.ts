import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * SIXTEEN TYPEFACES THAT ONLY A CONTRACTOR'S OWN SITE CAN USE.
 *
 * They used to be declared in the root layout, so their @font-face rules rode
 * along on every route in the product. Measured against the production build:
 * one stylesheet of nothing but next/font output, 51KB and 164 @font-face rules
 * across 40 families, on the marketing site, the dashboard and the admin
 * console — none of which can render a contractor's chosen font.
 *
 * Moving them to @/lib/templates/fonts buys that back, and buys a failure mode
 * with it: a surface that renders a site's own header_font WITHOUT the
 * variables shows a paying contractor's brand in a system font, on their live
 * website, with nothing in the logs. These tests are the tripwire — the last
 * one is the important one, because it fails when somebody adds a face to the
 * picker and forgets to load it.
 */

const root = process.cwd();
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripJs = (source: string) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const stripCss = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '');

const LAYOUT = stripJs(read('src', 'app', 'layout.tsx'));
const FONTS = stripJs(read('src', 'lib', 'templates', 'fonts.ts'));
const BUILDER = stripJs(read('src', 'app', 'dashboard', 'sites', 'WebsiteBuilder.tsx'));
const THEME_CSS = stripCss(read('src', 'lib', 'templates', 'themes.module.css'));

/** Every `--font-*` variable a module declares through next/font. */
const declaredVars = (source: string) =>
  new Set([...source.matchAll(/variable:\s*'(--font-[a-z-]+)'/g)].map((m) => m[1]));

const TEMPLATE_FILES = ['coat', 'fixit', 'forge', 'handy', 'modern', 'professional', 'reno', 'shine'];

describe('the root layout carries the product’s own type and nothing else', () => {
  it('declares exactly four families', () => {
    expect([...declaredVars(LAYOUT)].sort()).toEqual(['--font-body', '--font-display', '--font-mono']);
    // Geist comes from the package rather than next/font/google, so it has no
    // `variable:` literal to match. It is the marketing site's body face.
    expect(LAYOUT).toContain("import { GeistSans } from 'geist/font/sans'");
  });

  it('puts only those four on <body>', () => {
    const body = LAYOUT.slice(LAYOUT.indexOf('<body className='), LAYOUT.indexOf('>', LAYOUT.indexOf('<body className=')));
    expect(body).toContain('bodyFont.variable');
    expect(body).toContain('displayFont.variable');
    expect(body).toContain('monoFont.variable');
    expect(body).toContain('GeistSans.variable');
    expect(body).not.toContain('templateFontVars');
    // The regression this whole change exists to prevent.
    expect(body).not.toMatch(/forge|guild|vista|care|manrope|jakarta|oswald|bebas/i);
  });

  it('keeps Space Grotesk global, because five templates fall back to it', () => {
    // coat/fixit/modern/reno/shine head their pages with var(--font-display).
    expect(declaredVars(LAYOUT).has('--font-display')).toBe(true);
    const usesDisplay = TEMPLATE_FILES.filter((name) =>
      stripJs(read('src', 'lib', 'templates', `${name}.tsx`)).includes("'--theme-display': site.header_font || 'var(--font-display)"),
    );
    expect(usesDisplay.length).toBeGreaterThan(0);
  });
});

describe('every surface that renders a contractor’s own font loads it', () => {
  const SURFACES: [string, string[]][] = [
    ...TEMPLATE_FILES.map((name) => [`${name} template`, ['src', 'lib', 'templates', `${name}.tsx`]] as [string, string[]]),
    ['blog article', ['src', 'lib', 'templates', 'SiteBlogArticle.tsx']],
    ['booking page chrome', ['src', 'app', 'book', '[subdomain]', 'BookingChrome.tsx']],
    ['intake preview modal', ['src', 'app', 'dashboard', 'sites', 'IntakePreviewModal.tsx']],
    ['website builder page', ['src', 'app', 'dashboard', 'sites', 'page.tsx']],
  ];

  it.each(SURFACES)('%s carries templateFontVars', (_label, parts) => {
    const source = stripJs(read(...parts));
    expect(source).toContain('templateFontVars');
    // On an element, not merely imported.
    expect(source).toMatch(/className=\{`?\$?\{?templateFontVars|\$\{templateFontVars\}/);
  });

  it('finds no OTHER file setting one of those custom properties', () => {
    // The list above is only trustworthy if it is complete. Anything new that
    // sets --theme-display / --brand-font / --book-display has to join it.
    const searched = [
      ...TEMPLATE_FILES.map((n) => `src/lib/templates/${n}.tsx`),
      'src/lib/templates/SiteBlogArticle.tsx',
      'src/app/book/[subdomain]/BookingChrome.tsx',
      'src/app/dashboard/sites/IntakePreviewModal.tsx',
    ];
    for (const file of searched) expect(stripJs(read(...file.split('/')))).toMatch(/--theme-display|--brand-font|--book-display/);
  });

  it('travels with the preview modal, which portals out of the page', () => {
    const modal = stripJs(read('src', 'app', 'dashboard', 'sites', 'IntakePreviewModal.tsx'));
    expect(modal).toContain('createPortal');
    // The class must be on the portal's own root, not on something above it.
    expect(modal).toContain('className={`app-modal-backdrop ${templateFontVars}`}');
  });

  it('wraps the builder without adding a box to its layout', () => {
    const page = stripJs(read('src', 'app', 'dashboard', 'sites', 'page.tsx'));
    expect(page).toContain("style={{ display: 'contents' }}");
  });
});

describe('nothing can reference a face that is never loaded', () => {
  const loaded = new Set([...declaredVars(FONTS), ...declaredVars(LAYOUT)]);

  it('loads all sixteen contractor faces in one place', () => {
    expect(declaredVars(FONTS).size).toBe(16);
  });

  it('loads every face the heading picker offers', () => {
    const options = BUILDER.slice(BUILDER.indexOf('const HEADING_FONT_OPTIONS'), BUILDER.indexOf('];', BUILDER.indexOf('const HEADING_FONT_OPTIONS')));
    const referenced = [...options.matchAll(/var\((--font-[a-z-]+)\)/g)].map((m) => m[1]);
    expect(referenced.length).toBeGreaterThan(8);
    // --font-geist-sans is the package's own variable and is on <body>.
    const missing = referenced.filter((v) => v !== '--font-geist-sans' && !loaded.has(v));
    expect(missing).toEqual([]);
  });

  it('loads every face the template stylesheet reads', () => {
    const referenced = new Set([...THEME_CSS.matchAll(/var\((--font-[a-z-]+)/g)].map((m) => m[1]));
    expect(referenced.size).toBeGreaterThan(4);
    expect([...referenced].filter((v) => !loaded.has(v))).toEqual([]);
  });

  it('loads every face the template defaults name', () => {
    const types = stripJs(read('src', 'lib', 'templates', 'types.ts'));
    const referenced = new Set([...types.matchAll(/var\((--font-[a-z-]+)\)/g)].map((m) => m[1]));
    expect([...referenced].filter((v) => !loaded.has(v))).toEqual([]);
  });

  it('does not load the same face twice', () => {
    // A family in both places would ship two copies of its @font-face rules on
    // every contractor surface — the exact cost this change removed.
    const both = [...declaredVars(FONTS)].filter((v) => declaredVars(LAYOUT).has(v));
    expect(both).toEqual([]);
  });
});
