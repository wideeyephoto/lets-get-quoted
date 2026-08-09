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

  it('sits in Grow, above Messages', () => {
    const grow = SHELL.slice(SHELL.indexOf("{ label: 'Grow'"));
    const line = grow.slice(0, grow.indexOf(']'));
    const automationsAt = line.indexOf("'/dashboard/automations'");
    const messagesAt = line.indexOf("'/dashboard/messages'");
    expect(automationsAt).toBeGreaterThan(-1);
    expect(messagesAt).toBeGreaterThan(-1);
    expect(automationsAt).toBeLessThan(messagesAt);
  });

  /**
   * NavIcon returns null for an unknown href — a row with a label and no mark,
   * in a column where every other row has one.
   */
  it('has an icon, and a STROKED one', () => {
    expect(ICONS).toContain("'/dashboard/automations':");
    const entry = ICONS.slice(ICONS.indexOf("'/dashboard/automations':"));
    const path = entry.slice(0, entry.indexOf('\n'));
    // AUTOMATIONS_BOLT_PATH is a filled silhouette and the rail's shell sets
    // fill:none;stroke:currentColor — reusing it here would draw a 1.7px
    // outline of a solid shape, which at 18px is a smudge.
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
    const grow = DEMO_RAIL.slice(DEMO_RAIL.indexOf("label: 'Grow'"));
    const items = grow.slice(0, grow.indexOf('],'));
    expect(items).toContain("label: 'Automations'");
    expect(items.indexOf("label: 'Automations'")).toBeLessThan(items.indexOf("label: 'Messages'"));
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

describe('the Account menu', () => {
  it('gathers Settings, Help, theme and sign out behind one trigger', () => {
    expect(SHELL).toContain('sidenav-account-menu');
    expect(SHELL).toContain('/dashboard/settings');
    expect(SHELL).toContain('/dashboard/help');
    expect(SHELL).toContain('<ThemeToggle />');
  });

  /**
   * Signing out is a state change, so it is a POST. A GET that logs you out is
   * something any prefetcher or link-scanner can fire. It was previously
   * reachable only from inside Settings.
   */
  it('signs out with a real POST', () => {
    expect(SHELL).toMatch(/<form action="\/auth\/signout" method="post"/);
  });

  it('opens upward, because the rail scrolls on a short window', () => {
    const rule = GLOBALS.slice(GLOBALS.indexOf('.sidenav-account-menu {'));
    const body = rule.slice(0, rule.indexOf('}'));
    expect(body).toContain('bottom: calc(100% + 0.35rem)');
    expect(body).not.toContain('top:');
  });

  /**
   * The New menu hardcodes #0e1c2e and #fff from when the app was dark-only.
   * This menu is the one that CONTAINS the light/dark switch, so a panel that
   * stayed navy while the product went light is the worst possible place to
   * repeat that.
   */
  it('is themed with tokens, not the dark-only literals beside it', () => {
    const rule = GLOBALS.slice(GLOBALS.indexOf('.sidenav-account-menu {'));
    const body = rule.slice(0, rule.indexOf('}'));
    expect(body).toContain('var(--bg-3)');
    expect(body).not.toContain('#0e1c2e');
  });

  it('dismisses the same way the other rail menu does', () => {
    expect(SHELL).toContain('setAccountMenuOpen(false)');
    expect(SHELL).toContain('onAccountMenuKeyDown');
    expect(SHELL).toContain("aria-haspopup=\"menu\"");
  });

  /**
   * Not a setting — a live warning about whether money can reach this
   * contractor. Behind a click it stops being one, seen only by somebody
   * already on their way to Settings.
   */
  it('leaves the Stripe pill on the rail, outside the menu', () => {
    const foot = SHELL.slice(SHELL.indexOf('<div className="sidenav-foot">'));
    const menuEnd = foot.indexOf('</div>\n            </div>');
    expect(foot.indexOf('stripe-status-pill sidenav-stripe')).toBeGreaterThan(menuEnd);
  });
});

describe('the ? on every dashboard page', () => {
  it('is drawn by the shell, because there is no shared page header', () => {
    expect(SHELL).toContain('page-help-fab');
    expect(SHELL).toContain('href="/dashboard/help"');
  });

  /**
   * showAppRail is true for a signed-in owner on the marketing site and the
   * homepage too, so gating on it would float a support button over the
   * pricing page.
   */
  it('is gated on isDashboard, not on showAppRail', () => {
    const fab = SHELL.slice(SHELL.indexOf('page-help-fab') - 400, SHELL.indexOf('page-help-fab'));
    expect(fab).toContain('{isDashboard ?');
  });

  it('keeps clear of the mobile top bar', () => {
    expect(GLOBALS).toContain('.page-help-fab {');
    const mobile = GLOBALS.slice(GLOBALS.indexOf('.page-help-fab {'));
    expect(mobile).toMatch(/@media \(max-width: 900px\) \{[\s\S]*?\.page-help-fab \{[\s\S]*?bottom: 0\.9rem/);
  });
});
