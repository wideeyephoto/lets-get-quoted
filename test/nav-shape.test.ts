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
const SCHEDULE_NAV = read('src', 'app', 'dashboard', 'schedule', 'ScheduleNav.tsx');
const SUB_NAV = read('src', 'components', 'SubNav.tsx');
const MONEY_NAV = read('src', 'components', 'MoneyNav.tsx');
const REPORTS_PAGE = read('src', 'app', 'dashboard', 'reports', 'page.tsx');
const PAYROLL_PAGE = read('src', 'app', 'dashboard', 'payroll', 'page.tsx');

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

  // Phase 0: The demo rail imports NAV_GROUPS directly instead of maintaining a
  // hand-duplicated copy. A row that moved in one and not the other shows a prospect a
  // product that does not exist.
  it('mirrors NAV_GROUPS in the demo rail by importing it directly', () => {
    expect(DEMO_RAIL).toContain("import { NAV_GROUPS, baseNavItems } from './app-shell'");
    expect(DEMO_RAIL).toContain('NAV_GROUPS.map((group) =>');
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
    ['work', '#ff7a21'],
    ['intake', '#53b1fd'],
    ['money', '#3dd68c'],
    ['grow', '#b692f6'],
  ] as const;

  it('gives every group an accent and renders it as a class', () => {
    // In Phase 1a, Intake Channels is folded into Schedule, leaving 3 active groups
    const ACTIVE_ACCENTS = ['work', 'money', 'grow'] as const;
    for (const name of ACTIVE_ACCENTS) {
      expect(SHELL, name).toContain(`accent: '${name}'`);
    }
    // Both rails the shell draws: the signed-in one and the marketing drawer.
    expect(SHELL.match(/sidenav-group sidenav-group--\$\{group\.accent\}/g) ?? []).toHaveLength(2);
    // And the demo rail, which derives its section colors directly from NAV_GROUPS.
    expect(DEMO_RAIL).toContain('accent: group.accent');
    expect(DEMO_RAIL).toContain('sidenav-group sidenav-group--${group.accent}');
  });

  it('states the four hues as tokens, once, in both sheets', () => {
    for (const [name, hex] of ACCENTS) {
      for (const [sheet, css] of [['globals', GLOBALS], ['lite', LITE]] as const) {
        expect(css, `${sheet}: --nav-${name}`).toContain(`--nav-${name}: ${hex};`);
        expect(css, `${sheet}: .sidenav-group--${name}`).toMatch(
          new RegExp(`\\.sidenav-group--${name}\\s*\\{\\s*--section-accent:\\s*var\\(--nav-${name}\\);\\s*\\}`),
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
      expect(css, `${sheet}: eyebrow (light)`).toMatch(
        /:root\[data-theme='light'\] \.sidenav-glabel\s*\{\s*color:\s*var\(--section-accent, rgba\(var\(--grey-3\), 0\.85\)\);\s*\}/,
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
    expect(GLOBALS).toMatch(/\.sidenav-link\.active \.sidenav-ic\s*\{\s*color:\s*var\(--accent\);\s*\}/);
    expect(GLOBALS).toMatch(/\.sidenav-link\[data-state='on'\] \.sidenav-ic\s*\{\s*color:\s*var\(--ink-green-11\);\s*\}/);
    expect(GLOBALS).toMatch(/\.sidenav-link\.preview \.sidenav-ic\s*\{\s*color:\s*var\(--mute-g432\);\s*\}/);
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

describe('nav-phase-2-3 rail shape and safety invariants', () => {
  it('every rendered href in NAV_GROUPS resolves in baseNavItems', () => {
    const groupsBlock = SHELL.slice(SHELL.indexOf('const NAV_GROUPS'), SHELL.indexOf('type AccountStatus'));
    const hrefMatches = Array.from(groupsBlock.matchAll(/'(\/dashboard\/[^']+)'/g)).map((m) => m[1]);
    expect(hrefMatches.length).toBe(13);

    const baseNavBlock = SHELL.slice(SHELL.indexOf('const baseNavItems'), SHELL.indexOf('function isActiveNav'));

    for (const href of hrefMatches) {
      expect(baseNavBlock, `href ${href} must be registered in baseNavItems`).toContain(`href: '${href}'`);
    }
  });

  it('every rendered href has a NAV_ICON_PATHS entry', () => {
    const groupsBlock = SHELL.slice(SHELL.indexOf('const NAV_GROUPS'), SHELL.indexOf('type AccountStatus'));
    const hrefMatches = Array.from(groupsBlock.matchAll(/'(\/dashboard\/[^']+)'/g)).map((m) => m[1]);

    for (const href of hrefMatches) {
      expect(ICONS, `href ${href} must have an icon in nav-icons.tsx`).toContain(`'${href}':`);
    }
  });

  it('the logged-out sales rail still renders the complete NAV_GROUPS without filtering', () => {
    // §3 regression test: the logged-out "Preview everything included" rail
    // must render NAV_GROUPS directly without capability/usage filtering
    const salesSection = SHELL.slice(SHELL.indexOf('Preview everything included'));
    expect(salesSection).toContain('NAV_GROUPS.map((group) =>');
    expect(salesSection).toContain('group.hrefs.map((href) => renderAppLink(href))');
    expect(salesSection).not.toContain('group.hrefs.filter');
  });

  it('baseNavItems is not filtered anywhere so active longest-match is preserved', () => {
    expect(SHELL).not.toMatch(/baseNavItems\.filter\(/);
  });

  it('supports the Less used demoted group and hidden note styling in CSS', () => {
    expect(GLOBALS).toContain('.sidenav-group--less-used');
    expect(GLOBALS).toContain('.sidenav-link--demoted');
    expect(GLOBALS).toContain('.sidenav-hidden-note');
  });

  it('Phase 0: demo rail covers every single href in NAV_GROUPS without drift', () => {
    expect(DEMO_RAIL).toContain("import { NAV_GROUPS, baseNavItems } from './app-shell'");
    expect(DEMO_RAIL).toContain('group.hrefs.map(resolveDemoItem)');

    const groupsBlock = SHELL.slice(SHELL.indexOf('const NAV_GROUPS'), SHELL.indexOf('type AccountStatus'));
    const hrefMatches = Array.from(groupsBlock.matchAll(/'(\/dashboard\/[^']+)'/g)).map((m) => m[1]);
    expect(hrefMatches.length).toBe(13);

    // Every single href from NAV_GROUPS must be mapped either dynamically or explicitly
    for (const href of hrefMatches) {
      const isOverridden = DEMO_RAIL.includes(`'${href}':`);
      const isDynamic = href.startsWith('/dashboard/');
      expect(isOverridden || isDynamic, `href ${href} must be handled by demo rail`).toBe(true);
    }
  });

  it('Phase 1a: Intake Channels is folded into Schedule, eliminating the separate group', () => {
    // The Intake Channels group is removed from NAV_GROUPS
    const groupsBlock = SHELL.slice(SHELL.indexOf('export const NAV_GROUPS'), SHELL.indexOf('type AccountStatus'));
    expect(groupsBlock).not.toContain("label: 'Intake Channels'");
    expect(groupsBlock).not.toContain("accent: 'intake'");

    // NAV_GROUPS now has 3 active groups
    expect(groupsBlock).toContain("label: 'Work'");
    expect(groupsBlock).toContain("label: 'Billing & Cash'");
    expect(groupsBlock).toContain("label: 'Marketing & AI'");
  });

  it('Phase 1a: Schedule rail entry carries the rolled-up ON/OFF/PAUSED state pill', () => {
    expect(SHELL).toContain("'/dashboard/schedule': {");
    expect(SHELL).toContain('scheduleRollupState');
    expect(SHELL).toContain("href === '/dashboard/schedule'");
    expect(DEMO_RAIL).toContain("'/demo/schedule': {");
  });

  it('Phase 1a: Shared SubNav and ScheduleNav provide secondary navigation across schedule views', () => {
    expect(SUB_NAV).toContain('export default function SubNav');
    expect(SCHEDULE_NAV).toContain("import SubNav, { type SubNavItem } from '@/components/SubNav'");
    expect(SCHEDULE_NAV).toContain("href: '/dashboard/schedule/intake', label: 'Intake Channels'");
    expect(SCHEDULE_NAV).toContain("href: '/dashboard/schedule/booking', label: 'Online Booking'");
    expect(SCHEDULE_NAV).toContain("href: '/dashboard/schedule/plan', label: 'Plan Day'");
  });

  it('Phase 1b: Merge the money group into Payments with secondary MoneyNav tabs', () => {
    // In app-shell.tsx, Billing & Cash is streamlined to 3 entries
    const groupsBlock = SHELL.slice(SHELL.indexOf('export const NAV_GROUPS'), SHELL.indexOf('type AccountStatus'));
    const billingSection = groupsBlock.slice(groupsBlock.indexOf("label: 'Billing & Cash'"));
    const billingGroup = billingSection.slice(0, billingSection.indexOf('],'));
    expect(billingGroup).toContain("'/dashboard/payments'");
    expect(billingGroup).toContain("'/dashboard/recurring'");
    expect(billingGroup).not.toContain("'/dashboard/services'");
    expect(billingGroup).not.toContain("'/dashboard/insights'");
    expect(billingGroup).not.toContain("'/dashboard/cash-flow'");
    expect(billingGroup).not.toContain("'/dashboard/expenses'");

    // Active state maps insights, cash-flow, expenses, and reports to Payments in shell and demo
    expect(SHELL).toContain("MONEY_SUBROUTES = ['/dashboard/insights', '/dashboard/cash-flow', '/dashboard/expenses', '/dashboard/reports']");
    expect(DEMO_RAIL).toContain("DEMO_MONEY_SUBROUTES = ['/demo/insights', '/demo/cash-flow', '/demo/expenses']");

    // MoneyNav provides secondary tabs
    expect(MONEY_NAV).toContain('export default function MoneyNav');
    expect(MONEY_NAV).toContain("href: '/dashboard/payments', label: 'Payments'");
    expect(MONEY_NAV).toContain("href: '/dashboard/insights', label: 'Insights'");
    expect(MONEY_NAV).toContain("href: '/dashboard/cash-flow', label: 'Cash Flow'");
    expect(MONEY_NAV).toContain("href: '/dashboard/expenses', label: 'Expenses'");
    expect(MONEY_NAV).toContain("href: '/dashboard/reports', label: 'Reports'");
  });

  it('Phase 1c: Demote reference data (Price Book and Cards & Stationery) to Settings', () => {
    // Both are removed from primary rail NAV_GROUPS
    const groupsBlock = SHELL.slice(SHELL.indexOf('export const NAV_GROUPS'), SHELL.indexOf('type AccountStatus'));
    expect(groupsBlock).not.toContain("'/dashboard/services'");
    expect(groupsBlock).not.toContain("'/dashboard/merchandise'");

    // Both are removed from baseNavItems
    const baseNavBlock = SHELL.slice(SHELL.indexOf('const baseNavItems'), SHELL.indexOf('function isActiveNav'));
    expect(baseNavBlock).not.toContain("'/dashboard/services'");
    expect(baseNavBlock).not.toContain("'/dashboard/merchandise'");

    // Settings provides dedicated reference cards with deep link anchors
    expect(SETTINGS).toContain("import PriceBookSettingsSection from './PriceBookSettingsSection'");
    expect(SETTINGS).toContain("import StationerySettingsSection from './StationerySettingsSection'");
    expect(SETTINGS).toContain("'price-book'");
    expect(SETTINGS).toContain("'stationery'");
    expect(SETTINGS).toContain('<PriceBookSettingsSection />');
    expect(SETTINGS).toContain('<StationerySettingsSection />');

    // Total grouped rail entries is now 13 (8 Work, 2 Billing & Cash, 3 Marketing & AI)
    const hrefMatches = Array.from(groupsBlock.matchAll(/'(\/dashboard\/[^']+)'/g)).map((m) => m[1]);
    expect(hrefMatches).toHaveLength(13);
  });

  it('Phase 1d: Fix accidental splits (Reports in MoneyNav, Payroll canonical resolution)', () => {
    // Reports is integrated into MoneyNav and mounts MoneyNav
    expect(MONEY_NAV).toContain("href: '/dashboard/reports', label: 'Reports'");
    expect(REPORTS_PAGE).toContain("import MoneyNav from '@/components/MoneyNav'");
    expect(REPORTS_PAGE).toContain('<MoneyNav />');

    // baseNavItems registers both Financial Reports and Payroll
    const baseNavBlock = SHELL.slice(SHELL.indexOf('const baseNavItems'), SHELL.indexOf('function isActiveNav'));
    expect(baseNavBlock).toContain("href: '/dashboard/reports', label: 'Financial Reports'");
    expect(baseNavBlock).toContain("href: '/dashboard/payroll', label: 'Payroll'");

    // Both have icons in nav-icons.tsx
    expect(ICONS).toContain("'/dashboard/reports':");
    expect(ICONS).toContain("'/dashboard/payroll':");

    // Payroll redirects canonically to tab=timecards
    expect(PAYROLL_PAGE).toContain("redirect(`/dashboard/crew?tab=timecards${suffix}`)");

    // Crew & Labor hint explicitly surfaces timecards & payroll export
    expect(baseNavBlock).toContain("Team roster, timecards & payroll export");
  });
});
