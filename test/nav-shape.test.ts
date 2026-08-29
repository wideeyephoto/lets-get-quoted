import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUTOMATION_ANCHORS, isAutomationsAnchor } from '@/lib/nav-helpers';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const SHELL = read('src', 'components', 'app-shell.tsx');
const DEMO_RAIL = read('src', 'components', 'demo-sidebar.tsx');
const ICONS = read('src', 'components', 'nav-icons.tsx');
const SETTINGS = read('src', 'app', 'dashboard', 'settings', 'page.tsx');
const TABS = read('src', 'app', 'dashboard', 'settings', 'SettingsTabs.tsx');
const AUTOMATIONS = read('src', 'app', 'dashboard', 'automations', 'page.tsx');
const GLOBALS = read('src', 'app', 'globals.css');
const LITE = read('src', 'app', 'globals-lite.css');

/**
 * The shape of the rail, which nothing pinned before this.
 *
 * Source-as-text, the house convention for UI (see test/app-shell-width.test.ts):
 * the test environment is node with no DOM, and app-shell is a client component
 * behind a Supabase session.
 *
 * Worth having because two of the rail's failure modes are SILENT. A nav entry
 * whose href is missing from baseNavItems renders nothing at all —
 * renderSideLink returns null on the map miss — and an href with no entry in
 * NAV_ICON_PATHS renders a bare word in a rail where every other row has a
 * glyph. Neither throws, neither shows up in a typecheck, and neither is
 * visible unless somebody happens to look at that group.
 */

describe('Automations is a primary nav item', () => {
  it('has a route of its own, not a tab inside Settings', () => {
    expect(AUTOMATIONS).toContain('export default async function AutomationsPage()');
    // And Settings no longer carries it.
    expect(SETTINGS).not.toContain("id: 'automations'");
    expect(SETTINGS).not.toContain('automation-list');
  });

  /**
   * renderSideLink looks every href up in baseNavItems and returns null on a
   * miss, so a NAV_GROUPS entry alone renders an invisible row.
   */
  it('is registered in baseNavItems, or it renders nothing at all', () => {
    expect(SHELL).toMatch(/\{ href: '\/dashboard\/automations', label: 'Automations'/);
  });

  it('sits in Marketing & AI', () => {
    const marketing = SHELL.slice(SHELL.indexOf("label: 'Marketing & AI'"));
    const line = marketing.slice(0, marketing.indexOf(']'));
    expect(line).toContain("'/dashboard/automations'");
  });

  /**
   * NavIcon returns null for an unknown href — a row with a label and no mark,
   * in a column where every other row has one.
   */
  it('has an icon, and a STROKED one', () => {
    expect(ICONS).toContain("'/dashboard/automations':");
    const entry = ICONS.slice(ICONS.indexOf("'/dashboard/automations':"));
    const path = entry.slice(0, entry.indexOf('\n'));
    expect(path).not.toContain('M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z');
  });

  it('is gone from the rail footer', () => {
    expect(SHELL).not.toContain("'/dashboard/settings#automations'");
    expect(SHELL).not.toContain('sidenav-automations');
    expect(SHELL).not.toContain('settingsTabEvent');
  });

  // The demo rail is hand-duplicated and its own comment promises it mirrors
  // NAV_GROUPS. A row that moved in one and not the other shows a prospect a
  // product that does not exist.
  it('moved in the demo rail too', () => {
    const marketing = DEMO_RAIL.slice(DEMO_RAIL.indexOf("label: 'Marketing & AI'"));
    const items = marketing.slice(0, marketing.indexOf('],'));
    expect(items).toContain("label: 'Automations'");
  });
});

/**
 * Eleven anchors used to resolve to a Settings tab. A next.config redirect
 * cannot rescue any of them — a URL fragment is never sent to the server — so
 * the forward happens in the browser or not at all.
 */
describe('the old deep links still land', () => {
  it('recognises every anchor that moved, plus the tab id itself', () => {
    for (const anchor of AUTOMATION_ANCHORS) {
      expect(isAutomationsAnchor(anchor), anchor).toBe(true);
      expect(isAutomationsAnchor(`#${anchor}`), `#${anchor}`).toBe(true);
    }
    // What a bookmark of the tab, or the old rail sublink, carried.
    expect(isAutomationsAnchor('automations')).toBe(true);
  });

  it('leaves anchors that stayed on Settings alone', () => {
    for (const anchor of ['payouts', 'platform-fee', 'job-costing', 'finances', '']) {
      expect(isAutomationsAnchor(anchor), anchor).toBe(false);
    }
    expect(isAutomationsAnchor(null)).toBe(false);
    expect(isAutomationsAnchor(undefined)).toBe(false);
  });

  it('is wired into the one component that reads the hash', () => {
    expect(TABS).toContain('isAutomationsAnchor(hash)');
    expect(TABS).toContain('router.replace(`/dashboard/automations#${hash}`)');
    // Only when no remaining tab claims it — a live anchor must not be hijacked.
    const open = TABS.slice(TABS.indexOf('const open = (hash: string)'), TABS.indexOf('const applyHash'));
    expect(open.indexOf('if (!ownerId)')).toBeLessThan(open.indexOf('isAutomationsAnchor'));
  });

  it('and the destination opens the card it was pointed at', () => {
    expect(AUTOMATIONS).toContain('<OpenAnchoredCard />');
    const opener = read('src', 'app', 'dashboard', 'automations', 'OpenAnchoredCard.tsx');
    expect(opener).toContain('HTMLDetailsElement');
    expect(opener).toContain("addEventListener('hashchange'");
  });

  it('every anchor it claims is a section that really moved', () => {
    for (const anchor of AUTOMATION_ANCHORS) {
      expect(AUTOMATIONS, anchor).toContain(`id="${anchor}"`);
    }
  });
});

describe('the Account row', () => {
  const SETTINGS = read('src', 'app', 'dashboard', 'settings', 'page.tsx');
  // The rail's footer ONLY. Slicing to the end of the file swept in the top
  // bar's own Stripe link and made "says it once" pass for the wrong reason.
  const footer = () => {
    const start = SHELL.indexOf('<div className="sidenav-foot">');
    return SHELL.slice(start, SHELL.indexOf('</aside>', start));
  };

  /**
   * It was a dropdown holding Settings, Help, the theme switch, a Stripe row
   * and Sign out. Every one of those was a duplicate of something already on
   * screen or a section of the Account page — so the menu is gone and the
   * trigger is the link it was standing in front of.
   */
  it('is one link to the Account page, not a menu', () => {
    const foot = footer();
    expect(foot).toContain('className={`sidenav-account');
    expect(foot).toContain('/dashboard/settings');
    expect(SHELL).not.toContain('sidenav-account-menu');
    expect(SHELL).not.toContain('accountMenuOpen');
  });

  /** The trigger said the business name. Nobody clicks their own company to
      change their password — the row is labelled with where it goes. */
  it('is labelled Account, not the business name', () => {
    const foot = footer();
    expect(foot).toContain('>Account<');
    expect(foot).not.toContain('businessName');
  });

  /**
   * Not a setting — a live warning about whether money can reach this
   * contractor. It was listed inside the menu AND drawn as the pill below it,
   * which is the rail saying the same sentence twice.
   */
  it('says Stripe once, as the pill under it', () => {
    const foot = footer();
    expect(foot.match(/STRIPE_SETUP_HREF/g) ?? []).toHaveLength(1);
    expect(foot).toContain('stripe-status-pill sidenav-stripe');
  });

  /**
   * Signing out is a state change, so it is a POST — a GET that logs you out is
   * something any prefetcher or link-scanner can fire. That form is now only on
   * the Account page, beside the sign-in methods it belongs with.
   */
  it('signs out with a real POST, from the Account page', () => {
    expect(SHELL).not.toContain('/auth/signout');
    expect(SETTINGS).toMatch(/<form action="\/auth\/signout" method="post"/);
  });

  /** Help and the theme control left the menu; they have to have landed. */
  it('hands Help and Appearance to the page it opens', () => {
    expect(SHELL).not.toContain('<ThemeToggle />');
    expect(SETTINGS).toContain('<ThemeToggle />');
    expect(SETTINGS).toContain('/dashboard/help');
    expect(SETTINGS).toContain('id="appearance"');
    expect(SETTINGS).toContain('id="support"');
  });

  /** Every rule the menu owned should have gone with the markup. */
  it('leaves no dead menu CSS behind', () => {
    for (const dead of ['.sidenav-account-menu', '.sidenav-account-item', '.sidenav-account-caret', '.sidenav-account-theme', '.sidenav-account-signout']) {
      expect(GLOBALS, dead).not.toContain(dead);
    }
  });
});

/**
 * THE ? IS GONE, AND SUPPORT IS UNDER ACCOUNT.
 *
 * A permanent overlay has to earn its square inch on every screen it covers,
 * not only the one where somebody is stuck — and this one covered all ~35
 * dashboard pages, bottom-right on a phone, where the thumb rests.
 */
describe('support does not float over the product', () => {
  it('draws no help button on any page', () => {
    expect(SHELL).not.toContain('page-help-fab');
    expect(GLOBALS).not.toContain('page-help-fab');
    expect(LITE).not.toContain('page-help-fab');
  });

  /** Removing the shortcut is only safe because the destination is reachable. */
  it('leaves support reachable from Account in one step', () => {
    expect(SETTINGS).toContain('id="support"');
    expect(SETTINGS).toContain('/dashboard/help');
    expect(SHELL).toContain('className={`sidenav-account');
  });

  /**
   * The theme switch stays floating, and the difference is the point: "I cannot
   * read this screen" is about THIS page at THIS moment. Wanting help is not.
   */
  it('does not take the theme switch with it', () => {
    expect(SHELL).toContain('<ThemeFab />');
  });
});

/**
 * ONE COLOUR PER SECTION, AND IT REACHES THE RAIL.
 *
 * The rail's four cards each own a hue, worn by the eyebrow and the row icons
 * and by nothing else.
 */
describe('the rail is colour-coded by section', () => {
  const ACCENTS = [
    ['work', '#ff791f'],
    ['intake', '#38bdf8'],
    ['money', '#44e0a4'],
    ['grow', '#b89afb'],
  ] as const;

  it('gives every group an accent and renders it as a class', () => {
    for (const [name] of ACCENTS) {
      expect(SHELL, name).toContain(`accent: '${name}'`);
    }
    // Both rails the shell draws: the signed-in one and the marketing drawer.
    expect(SHELL.match(/sidenav-group sidenav-group--\$\{group\.accent\}/g) ?? []).toHaveLength(2);
    // And the demo rail, which promises to mirror NAV_GROUPS.
    for (const [name] of ACCENTS) {
      expect(DEMO_RAIL, name).toContain(`accent: '${name}'`);
    }
    expect(DEMO_RAIL).toContain('sidenav-group sidenav-group--${group.accent}');
  });

  it('states the four hues as tokens, once, in both sheets', () => {
    for (const [name, hex] of ACCENTS) {
      for (const [sheet, css] of [['globals', GLOBALS], ['lite', LITE]] as const) {
        expect(css, `${sheet}: --nav-${name}`).toContain(`--nav-${name}: ${hex};`);
        expect(css, `${sheet}: .sidenav-group--${name}`).toContain(
          `.sidenav-group--${name} { --section-accent: var(--nav-${name}); }`,
        );
      }
    }
  });

  /** The two rules the accent actually rides on. Both themes, both sheets. */
  it('reaches the eyebrow and the icons through the variable, not a new rule', () => {
    for (const [sheet, css] of [['globals', GLOBALS], ['lite', LITE]] as const) {
      expect(css, `${sheet}: icon`).toContain('color: var(--section-accent, var(--mute-g458));');
      expect(css, `${sheet}: eyebrow`).toContain('color: var(--section-accent, rgba(var(--grey-3), 0.72));');
      // The light rule hands over to the same variable, or the accent is a
      // dark-theme-only feature.
      expect(css, `${sheet}: eyebrow (light)`).toContain(
        ":root[data-theme='light'] .sidenav-glabel { color: var(--section-accent, rgba(var(--grey-3), 0.85)); }",
      );
    }
  });

  /**
   * Hover brightens every other icon to a grey. Inside a section that reads as
   * the colour falling off, so the accent survives it — except on the rows
   * already saying something in colour.
   */
  it('keeps the accent under the cursor, and off the two rows that own a colour', () => {
    expect(GLOBALS).toContain(
      ".sidenav-group .sidenav-link:not(.active):not([data-state='on']):hover .sidenav-ic {",
    );
  });

  /**
   * WHAT STILL OUTRANKS IT. Each of these is (0,3,0) against the (0,1,0) that
   * carries the accent, so they win on specificity rather than on source order
   * — moving the accent block would not change any of them.
   */
  it('leaves the active row, the ON rows and the locked rows alone', () => {
    expect(GLOBALS).toContain('.sidenav-link.active .sidenav-ic { color: var(--accent); }');
    expect(GLOBALS).toContain(".sidenav-link[data-state='on'] .sidenav-ic { color: var(--ink-green-11); }");
    expect(GLOBALS).toContain('.sidenav-link.preview .sidenav-ic { color: var(--mute-g432); }');
    // Schedule's active treatment is untouched: wash, left rail, ring.
    expect(GLOBALS).toContain('box-shadow: inset 3px 0 0 var(--accent), inset 0 0 0 1px rgba(255, 122, 33, 0.22);');
  });

  /**
   * The Money group had two rows wearing hues of their own — cyan on Insights,
   * green on Cash flow — which made a four-row section read as three things.
   * They were removed rather than left to fight the section they sit in.
   */
  it('lets no single row set its own icon colour inside a section', () => {
    for (const [sheet, css] of [['globals', GLOBALS], ['lite', LITE]] as const) {
      expect(css, `${sheet}: insights`).not.toContain("[href$='/insights'] .sidenav-ic");
      expect(css, `${sheet}: cash-flow`).not.toContain("[href$='/cash-flow'] .sidenav-ic");
    }
  });

  /** The labels stay neutral. Eighteen coloured words is not a rail. */
  it('colours the icons and the eyebrow, not the link text', () => {
    const rule = GLOBALS.slice(GLOBALS.indexOf('.sidenav-link {'), GLOBALS.indexOf('.sidenav-link:hover'));
    expect(rule).toContain('color: rgba(var(--ink-rgb), 0.90);');
    expect(rule).not.toContain('--section-accent');
    // And the card itself is still the same neutral for all four.
    expect(GLOBALS).not.toMatch(/\.sidenav-group--\w+\s*\{[^}]*background/);
  });
});
