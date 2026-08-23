import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE ANCHOR LIST AND THE RENDERED IDS ARE ONE FACT WRITTEN IN TWO PLACES.
 *
 * `SettingsTabs` resolves a URL hash to a tab by exact match against each tab's
 * `anchors` array (`nav-helpers.ts` resolveTabForHash). A hash no tab claims
 * does not fall back to anything -- `open()` returns without calling setActive,
 * so the reader lands on the FIRST tab, Account, while the section they linked
 * to sits in a panel that is `hidden`. The link appears to work and does not.
 *
 * That is exactly what `#overage` did. `OverageCard` carries `id="overage"` in
 * both of its branches, so the id is in the DOM on every render of the tab, and
 * the anchors array never listed it. Nothing failed, because nothing compared
 * the two lists.
 *
 * So: both directions. An anchor with no id is a link to nowhere; an id with no
 * anchor is a section that cannot be linked to at all.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
const SETTINGS = join('src', 'app', 'dashboard', 'settings');

const PAGE = read(SETTINGS, 'page.tsx');

/**
 * Every file that can render a section into the Plan & usage panel. A new panel
 * added here without its id reaching the anchors array fails below.
 */
const SECTION_FILES = [
  'PlanUsageSection.tsx',
  'BasePlanSubscriptionCheckout.tsx',
  'ChangePlanPanel.tsx',
  'CancelSubscriptionPanel.tsx',
  'TopUpPurchaseCheckout.tsx',
] as const;

/** Comments are stripped first: prose about an anchor is not an anchor. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** The `anchors: [ ... ]` array of the tab whose id is 'plan'. */
function planAnchors(): string[] {
  const source = withoutComments(PAGE);
  const tabStart = source.indexOf("id: 'plan'");
  expect(tabStart, "the settings page must still declare a tab with id 'plan'").toBeGreaterThan(-1);

  const open = source.indexOf('anchors: [', tabStart);
  expect(open, 'the plan tab must declare an anchors array').toBeGreaterThan(-1);
  const close = source.indexOf('\n            ],', open);
  expect(close, 'the anchors array must be closed').toBeGreaterThan(open);

  const block = source.slice(open, close);
  return [...block.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
}

/** Every `id="..."` rendered by the section files, deduplicated. */
function renderedIds(): string[] {
  const ids = new Set<string>();
  for (const file of SECTION_FILES) {
    for (const m of withoutComments(read(SETTINGS, file)).matchAll(/\sid="([a-z0-9-]+)"/g)) {
      ids.add(m[1]);
    }
  }
  return [...ids];
}

describe('the Plan & usage anchors and its section ids are the same set', () => {
  const anchors = planAnchors();
  const ids = renderedIds();

  it('found both lists, so the assertions below are not vacuous', () => {
    // Guards the guard. Two regexes that stopped matching would make every
    // comparison here trivially true, which is the failure mode that let
    // `overage` drift in the first place.
    expect(anchors.length).toBeGreaterThan(5);
    expect(ids.length).toBeGreaterThan(5);
    expect(anchors).toContain('current-plan');
    expect(ids).toContain('current-plan');
  });

  it.each(['overage', 'current-plan', 'usage-balances', 'workspace-storage', 'included-limits'])(
    'claims %s, which regressed or is load-bearing',
    (anchor) => {
      expect(anchors).toContain(anchor);
      expect(ids).toContain(anchor);
    },
  );

  it('claims every id a section renders', () => {
    const unclaimed = ids.filter((id) => !anchors.includes(id));
    expect(
      unclaimed,
      `these sections render an id no anchor claims, so /dashboard/settings#<id> `
        + `opens the Account tab instead: ${unclaimed.join(', ')}`,
    ).toEqual([]);
  });

  it('renders every anchor it claims', () => {
    const missing = anchors.filter((anchor) => !ids.includes(anchor));
    expect(
      missing,
      `the plan tab claims these anchors and no section renders them, so the tab `
        + `opens and scrolls to nothing: ${missing.join(', ')}`,
    ).toEqual([]);
  });
});
