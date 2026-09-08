import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The paid-ad landing pages deliberately opt out of the eight themes: an ad's
 * creative and its landing page have to match, so they force their own dark
 * ground whatever the visitor picked. That decision stays.
 *
 * What was NOT deliberate: four different navies, three different oranges and
 * two different mints across pages that run in the SAME campaign. /compare used
 * #ff6a24, /for/[trade] used #ff7137, and neither matched the app's #ff7a21.
 * The four heaviest modules carried 161 raw hex literals and zero var(), so a
 * rebrand could never reach them.
 *
 * These tests pin the fix in the only way that bites: they assert the ABSENCE of
 * raw hex in the consuming modules and the ABSENCE of the superseded values
 * anywhere on the marketing surface. Asserting that the tokens merely exist
 * would pass while a new literal sat next to them.
 */

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** The modules that consume the shared palette and must hold no raw hex. */
const TOKENIZED_MODULES = [
  'src/app/compare/compare.module.css',
  'src/app/for/[trade]/trade-definitive.module.css',
  'src/app/for/[trade]/trade-roi.module.css',
  'src/app/for/[trade]/trade-cluster.module.css',
];

/**
 * A pure-black media well in trade-definitive. Black is not part of the navy
 * ramp and tokenizing it would say it were.
 */
const ALLOWED_LITERALS = new Set(['#000000']);

const REQUIRED_TOKENS = [
  '--mkt-ink',
  '--mkt-ground',
  '--mkt-surface',
  '--mkt-surface-2',
  '--mkt-surface-3',
  '--mkt-orange',
  '--mkt-orange-rgb',
  '--mkt-mint',
  '--mkt-mint-rgb',
  '--mkt-text',
  '--mkt-muted',
];

describe('marketing palette is defined once', () => {
  it('globals.css declares every token the landing modules consume', () => {
    const css = read('src/app/globals.css');
    for (const token of REQUIRED_TOKENS) {
      expect(css, `${token} missing from globals.css`).toContain(`${token}:`);
    }
  });

  it('survives into globals-lite.css, which is what marketing routes load', () => {
    // The root layout imports globals-lite.css; only dashboard/admin/demo add
    // the full sheet. A token that existed only in globals.css would resolve to
    // nothing on every page an ad points at.
    const lite = read('src/app/globals-lite.css');
    for (const token of REQUIRED_TOKENS) {
      expect(lite, `${token} was stripped from the lite subset`).toContain(`${token}:`);
    }
  });
});

describe('landing modules carry no raw colour literals', () => {
  for (const path of TOKENIZED_MODULES) {
    it(`${path.split('/').pop()} uses tokens, not hex`, () => {
      const css = read(path);
      const literals = (css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [])
        .map((h) => h.toLowerCase())
        .filter((h) => !ALLOWED_LITERALS.has(h));
      expect(literals, `raw hex found: ${[...new Set(literals)].join(', ')}`).toEqual([]);
    });

    it(`${path.split('/').pop()} actually references the palette`, () => {
      // Guards the inverse failure: a module emptied of hex because it was
      // emptied of colour.
      expect(read(path)).toContain('var(--mkt-');
    });
  }
});

describe('one accent across the campaign', () => {
  /** Values that were in use before the palette landed and must not return. */
  const SUPERSEDED = [
    '#ff7137', // /for/[trade] orange
    '#4ee0bc', // /for/[trade] mint
    'rgba(255, 113, 55', // the same orange as an overlay
    'rgba(78, 224, 188', // the same mint as an overlay
  ];

  const SURFACE = [
    'src/app/for/for.module.css',
    ...TOKENIZED_MODULES,
  ];

  for (const path of SURFACE) {
    it(`${path.split('/').pop()} holds no superseded accent`, () => {
      const css = read(path).toLowerCase();
      for (const value of SUPERSEDED) {
        expect(css, `${value} came back in ${path}`).not.toContain(value.toLowerCase());
      }
    });
  }

  it('the force-dark wrapper still forces dark', () => {
    // Tokenizing the wrapper's ground must not have cost it the !important that
    // out-specifies the theme rules; without it a Light-theme visitor gets a
    // half-themed page.
    const css = read('src/app/for/for.module.css');
    expect(css).toContain('color-scheme:dark!important');
    expect(css).toContain('background-color:var(--mkt-ground)!important');
  });
});

describe('the navy ramp keeps its steps', () => {
  it('defines five distinct grounds', () => {
    const css = read('src/app/globals.css');
    const values = ['--mkt-ink', '--mkt-ground', '--mkt-surface', '--mkt-surface-2', '--mkt-surface-3']
      .map((token) => {
        const match = css.match(new RegExp(`${token}:\\s*([^;]+);`));
        return match?.[1]?.trim();
      });
    expect(values.every(Boolean)).toBe(true);
    expect(new Set(values).size, 'ramp steps collapsed to the same colour').toBe(5);
  });

  it('the card gradients still have two different stops', () => {
    // Three cards paint a lighter navy over a darker one. Collapsing the ramp
    // would leave a valid gradient that renders flat, which no colour-count
    // assertion above would catch.
    const cases: Array<[string, number]> = [
      ['src/app/compare/compare.module.css', 895],
      ['src/app/for/[trade]/trade-definitive.module.css', 53],
      ['src/app/for/[trade]/trade-roi.module.css', 54],
    ];
    for (const [path, line] of cases) {
      const text = read(path).split(/\r?\n/)[line - 1] ?? '';
      const stops = text.match(/var\(--mkt-[a-z0-9-]+\)/g) ?? [];
      expect(stops.length, `${path}:${line} is no longer a two-stop gradient`).toBe(2);
      expect(new Set(stops).size, `${path}:${line} gradient went flat`).toBe(2);
    }
  });
});
