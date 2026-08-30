import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  quickStopNavState,
  quickStopState,
  quickStopStateDetail,
  quickStopStateHeadline,
  quickStopStateLabel,
  type QuickStopStateInput,
} from '@/lib/quick-stop-state';
import { isQuickStopSettingsAnchor, normalizeQuickStopTab, QUICK_STOP_SETTINGS_ANCHORS } from '@/lib/quick-stop-tabs';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
const STATUS = read('src', 'app', 'dashboard', 'quick-stops', 'QuickStopStatus.tsx');
/**
 * Status with its comments stripped.
 *
 * The file explains what it replaced, at length and by name — the comments
 * quote "Pause Quick Stops" and "Only customers near your route" precisely
 * because those are the things that went. A bare toContain against the raw
 * source matches the explanation of a removal and calls it present.
 */
const STATUS_CODE = STATUS.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const ROUTE = read('src', 'app', 'api', 'account', 'status', 'route.ts');
const MAP = read('src', 'app', 'dashboard', 'quick-stops', 'QuickStopCoverageMap.tsx');

/** A fully-configured, switched-on account. Each test breaks one thing. */
const ready: QuickStopStateInput = {
  enabled: true,
  locked: false,
  lockedUntil: null,
  lockReason: '',
  feeSet: true,
  daysSet: true,
  stripeConnected: true,
  hasBookingUrl: true,
  maxPerDay: 1,
};

/**
 * Nine deciders became one.
 *
 * Six of them could be on screen simultaneously and contradicted each other:
 * "Nothing can come in yet" on a fully-configured account, "Finish the setup"
 * when nothing was unfinished, and two different meanings of the word Paused.
 */
describe('the four states', () => {
  it('is ON when everything is set and the switch is on', () => {
    expect(quickStopState(ready)).toEqual({ kind: 'on', maxPerDay: 1 });
    expect(quickStopStateLabel(quickStopState(ready))).toBe('ON');
    expect(quickStopStateDetail(quickStopState(ready))).toBe('Taking requests, up to 1 a day.');
  });

  /**
   * THE STATE THE OLD CODE HAD NO NAME FOR. It fell through to the same branch
   * as an unconfigured account and said "finish the setup" — to somebody who
   * had finished it.
   */
  it('is READY-OFF when everything is set and the switch is off', () => {
    const state = quickStopState({ ...ready, enabled: false });
    expect(state).toEqual({ kind: 'ready_off' });
    expect(quickStopStateHeadline(state)).toBe('Ready — currently off');
    expect(quickStopStateDetail(state)).toContain('Everything is configured');
    // The sentence that used to appear here and sent people hunting.
    expect(quickStopStateDetail(state)).not.toContain('finish');
    expect(quickStopStateDetail(state)).not.toContain('Nothing can come in');
  });

  it('is SETUP-INCOMPLETE when something real is missing', () => {
    const state = quickStopState({ ...ready, feeSet: false });
    expect(state.kind).toBe('setup_incomplete');
    if (state.kind !== 'setup_incomplete') throw new Error('unreachable');
    expect(state.gaps.map((gap) => gap.key)).toEqual(['fee']);
  });

  /**
   * PAUSED MEANS ONE THING: support locked it. The status block used to return
   * "Paused" for a plain switched-off account while calling the real lock
   * "Paused by support", so the word meant two different things on one screen.
   */
  it('is PAUSED only for a support lock, never for a switched-off account', () => {
    expect(quickStopState({ ...ready, enabled: false }).kind).toBe('ready_off');
    const locked = quickStopState({ ...ready, locked: true, lockReason: 'Reported no-show', lockedUntil: '2026-09-01T00:00:00.000Z' });
    expect(locked.kind).toBe('paused');
    expect(quickStopStateDetail(locked)).toContain('Reported no-show');
    expect(quickStopStateDetail(locked)).toContain('lifts automatically');
  });

  it('lets the support lock outrank everything, including missing setup', () => {
    const state = quickStopState({ ...ready, locked: true, feeSet: false, daysSet: false, enabled: false });
    expect(state.kind).toBe('paused');
  });
});

describe('the setup gaps', () => {
  /**
   * The old chain stopped at whichever requirement failed earliest, so an owner
   * missing both their weekdays and Stripe was told about the weekdays, fixed
   * them, and only then learned there was a second thing.
   */
  it('names every unmet requirement, not just the first', () => {
    const state = quickStopState({ ...ready, hasBookingUrl: false, daysSet: false, feeSet: false, stripeConnected: false });
    if (state.kind !== 'setup_incomplete') throw new Error('unreachable');
    expect(state.gaps.map((gap) => gap.key)).toEqual(['website', 'weekdays', 'fee', 'stripe']);
    const detail = quickStopStateDetail(state);
    expect(detail).toContain('Publish your website');
    expect(detail).toContain('choose the days');
    expect(detail).toContain('fee band');
    expect(detail).toContain('connect Stripe');
  });

  it('reads as a sentence, capitalised, with an Oxford-free "and"', () => {
    const state = quickStopState({ ...ready, daysSet: false, feeSet: false });
    expect(quickStopStateDetail(state)).toBe(
      'Choose the days you take them and set your fee band before this can take a request.',
    );
  });

  it('explains why Stripe matters, only when Stripe is the gap', () => {
    const withStripe = quickStopStateDetail(quickStopState({ ...ready, stripeConnected: false }));
    expect(withStripe).toContain('only confirmed once the customer has paid');
    const withoutStripe = quickStopStateDetail(quickStopState({ ...ready, feeSet: false }));
    expect(withoutStripe).not.toContain('only confirmed once');
  });

  /**
   * An owner who has flipped the switch and is waiting on setup is in the same
   * state as one who has not — neither can take a request — but they should not
   * be addressed the same way.
   */
  it('carries the switch position without letting it change the state', () => {
    const on = quickStopState({ ...ready, enabled: true, feeSet: false });
    const off = quickStopState({ ...ready, enabled: false, feeSet: false });
    expect(on.kind).toBe(off.kind);
    expect(quickStopStateHeadline(on)).toBe('Switched on — not live yet');
    expect(quickStopStateHeadline(off)).toBe('Not set up yet');
  });

  it('gives every gap somewhere to go', () => {
    const state = quickStopState({ ...ready, hasBookingUrl: false, daysSet: false, feeSet: false, stripeConnected: false });
    if (state.kind !== 'setup_incomplete') throw new Error('unreachable');
    for (const gap of state.gaps) {
      expect(gap.href, gap.key).toMatch(/^\/dashboard\//);
      expect(gap.label.length, gap.key).toBeGreaterThan(0);
    }
  });
});

/**
 * The rail read `locked ? paused : enabled ? on : off` and knew nothing about
 * setup gaps, so it could show a green ON from every page in the app beside a
 * Quick Stops page reading "Not live yet".
 */
describe('the nav rail pill', () => {
  it('is only ON when a request could really arrive', () => {
    expect(quickStopNavState(quickStopState(ready))).toBe('on');
    expect(quickStopNavState(quickStopState({ ...ready, stripeConnected: false }))).toBe('off');
    expect(quickStopNavState(quickStopState({ ...ready, hasBookingUrl: false }))).toBe('off');
    expect(quickStopNavState(quickStopState({ ...ready, enabled: false }))).toBe('off');
    expect(quickStopNavState(quickStopState({ ...ready, locked: true }))).toBe('paused');
  });

  it('is computed from the shared function, not a second rule', () => {
    expect(ROUTE).toContain('quickStopNavState(');
    expect(ROUTE).not.toMatch(/quickStop\.locked \? 'paused' : quickStop\.enabled \? 'on' : 'off'/);
  });
});

describe('the page reads from the one state', () => {
  it('deleted its own live / missing / blockedReason arithmetic', () => {
    expect(STATUS).toContain('quickStopState({');
    expect(STATUS_CODE).not.toContain('const blockedReason');
    expect(STATUS).not.toMatch(/const missing = \[/);
    expect(STATUS).not.toMatch(/const live = enabled && !locked &&/);
  });

  /**
   * A switch, a button doing the identical thing in every state, and a hint
   * suggesting you clear every weekday — which does not pause anything, it
   * creates setup_incomplete, the state the page then scolds you for.
   *
   * The state-aware "Turn on Quick Stops" below is not that button back: it
   * exists only in ready_off, and it calls the same setter the switch does.
   */
  it('offers no second control that duplicates the switch in every state', () => {
    expect(STATUS_CODE).not.toContain('Pause Quick Stops');
    expect(STATUS_CODE).toContain('type="checkbox"');
    expect(STATUS_CODE).toContain("state.kind === 'ready_off' && !readOnly");
  });

  /**
   * THE PRIMARY ACTION USED TO BE "Review settings" IN ALL FOUR STATES.
   *
   * An account that was fully configured and simply switched off had the page
   * tell it, in its largest button, to review settings that needed no
   * reviewing — while the only thing left to do was an unlabelled toggle.
   */
  it('makes the primary action the one this state actually calls for', () => {
    // ready_off — turning it on IS the remaining step.
    expect(STATUS_CODE).toContain('Turn on Quick Stops');
    // setup_incomplete — points at the first thing that is missing, by name.
    expect(STATUS_CODE).toContain('asButtonLabel(firstGap.label)');
    expect(STATUS_CODE).toContain('href={firstGap.href}');
    // ...and "Review settings" is no longer competing with either of them.
    expect(STATUS_CODE).not.toContain('btn primary bset-setup">\n            <Icon name="cash" />\n            Review settings');
  });

  /**
   * "Preview customer experience" opened the LIVE booking page, where Quick
   * Stops is hidden whenever the feature is not live — so the button promised
   * a preview of the thing it could not show. There is no unpublished preview
   * mode to send them to, so the label stops claiming one.
   */
  it('names the customer preview for what it is, and says it is hidden', () => {
    expect(STATUS_CODE).toContain('View booking page — Quick Stops hidden');
    expect(STATUS_CODE).toContain("live ? 'Preview what customers see'");
  });

  /**
   * The head's "View booking page" and the master card's preview opened the
   * same URL, and in the unpublished case the head said "Publish your website"
   * — which is word for word what the master card's primary action now says in
   * that state.
   */
  it('does not put a second button on the same URL up in the header', () => {
    const head = STATUS_CODE.slice(STATUS_CODE.indexOf('export function QuickStopHead'));
    expect(head).not.toContain('bset-head-cta');
    expect(head).not.toContain('bookingUrl');
  });

  /**
   * The <label> wraps the copy as well as the box, so the accessible name was
   * the whole block — status line and all — read out on focus and again on
   * every toggle.
   */
  it('names the switch "Quick Stops" and describes it separately', () => {
    expect(STATUS_CODE).toContain('aria-label="Quick Stops"');
    expect(STATUS_CODE).toContain('aria-describedby={describedId}');
    expect(STATUS_CODE).toContain('<small id={describedId}>');
  });

  /**
   * Priority areas exist precisely to let a customer further out qualify, so
   * "only customers near your route" contradicted a feature on the same page.
   */
  it('stops promising only customers near the route', () => {
    expect(STATUS_CODE).toContain('priority area');
    expect(STATUS_CODE).not.toContain('Only customers near your route');
  });
});

/**
 * Unset, Google picks between cooperative and greedy by sniffing the container.
 * On this page the sniff came out desktop-flavoured on touch, so a phone got
 * "Use Ctrl + scroll to zoom the map" over a map that had captured the page
 * scroll — an instruction naming two things a phone does not have.
 */
describe('the coverage map on a touch device', () => {
  it('sets gestureHandling explicitly', () => {
    expect(MAP).toContain("gestureHandling: 'cooperative'");
  });
});

/**
 * Three tabs, and five places in the app that link into sections of them.
 *
 * Today is the default, so a deep link to a Settings section would land on
 * Today and scroll to nothing — the whole page reading as a broken link. A dead
 * anchor is invisible in a browser and invisible in a test unless the list is
 * asserted against the markup that owns it.
 */
describe('the three tabs', () => {
  const TABS = read('src', 'app', 'dashboard', 'quick-stops', 'QuickStopTabs.tsx');
  const PAGE = read('src', 'app', 'dashboard', 'quick-stops', 'page.tsx');
  const CONFIGURATOR = read('src', 'app', 'dashboard', 'quick-stops', 'QuickStopConfigurator.tsx');

  it('routes every settings anchor to the Settings tab', () => {
    for (const anchor of QUICK_STOP_SETTINGS_ANCHORS) {
      expect(isQuickStopSettingsAnchor(anchor), anchor).toBe(true);
      expect(isQuickStopSettingsAnchor(`#${anchor}`), anchor).toBe(true);
    }
    expect(isQuickStopSettingsAnchor('quick-stop-requests')).toBe(false);
    expect(isQuickStopSettingsAnchor('')).toBe(false);
  });

  it('the anchor the rest of the app links to really exists in the settings panel', () => {
    // Six call sites use this one, including Automations and the status block.
    expect(CONFIGURATOR).toContain('id="quick-stop-setup"');
  });

  it('opens on Today, and falls back to it for anything unrecognised', () => {
    expect(normalizeQuickStopTab(null)).toBe('today');
    expect(normalizeQuickStopTab('nonsense')).toBe('today');
    expect(normalizeQuickStopTab('insights')).toBe('insights');
  });

  /**
   * THE HAZARD THIS PROTECTS. The configurator is one <form> over five drawers
   * of plain DOM inputs, kept mounted-but-hidden because an unrendered input
   * contributes nothing to the FormData and the action writes the resulting
   * blanks over the settings — saving with one drawer open once zeroed the fee
   * band. A tab shell that unmounted inactive panels reintroduces that as
   * silent data loss on save.
   */
  it('hides inactive panels rather than unmounting them', () => {
    expect(TABS).toContain('hidden={active !== tab.id}');
    expect(TABS).not.toMatch(/active === tab\.id \? .*panels/);
  });

  it('keeps the whole configurator form inside one tab', () => {
    const settingsPanel = PAGE.slice(PAGE.indexOf('const settingsPanel'), PAGE.indexOf('const insightsPanel'));
    expect(settingsPanel).toContain('<QuickStopConfigurator');
  });

  it('puts activation before the map', () => {
    const todayPanel = PAGE.slice(PAGE.indexOf('const todayPanel'), PAGE.indexOf('const settingsPanel'));
    expect(todayPanel.indexOf('<QuickStopStatus')).toBeLessThan(todayPanel.indexOf('<QuickStopCoverage'));
  });

  /* Without one the tab inherits the marketing site's default title, so two
     dashboard tabs open side by side are indistinguishable and a bookmark of
     this page is named after the homepage. */
  it('names the browser tab after the page', () => {
    expect(PAGE).toContain("export const metadata = { title: 'Quick Stops' }");
  });

  /**
   * THREE EQUAL THIRDS ON A PHONE, NOT A ROW THAT SCROLLS.
   *
   * `min-width: 7.5rem` on three tabs, plus the gaps and the rail's own
   * padding, came to 381px inside a 309px content box at 390px — so the page's
   * primary navigation scrolled sideways and only two of the three labels were
   * ever on screen at once.
   */
  it('fits all three tabs on a phone, at a full-size target', () => {
    const css = read('src', 'app', 'globals.css').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
    const base = css.slice(css.indexOf('\n.qs-tab {'), css.indexOf('}', css.indexOf('\n.qs-tab {')));
    expect(base).toContain('min-height: 44px');
    expect(base).toContain('flex: 1 1 0');

    const phone = css.slice(css.indexOf('@media (max-width: 640px)', css.indexOf('.qs-tabpanel')));
    // min-width: 0 is what lets `flex: 1 1 0` actually divide the row.
    expect(phone).toContain('min-width: 0');
    expect(phone).toMatch(/\.qs-tab small\s*\{\s*display:\s*none;/);

    /* The app header is fixed, so a deep link put the section's own heading
       underneath it and landed on the first field. */
    expect(css).toMatch(/\.qs-tabpanel \[id\]\s*\{\s*scroll-margin-top:/);
  });

  it('moved the pitch and the past-work panel off Today', () => {
    const insights = PAGE.slice(PAGE.indexOf('const insightsPanel'));
    expect(insights).toContain('<QuickStopCandidates');
  });

  it('is keyboard operable as a tablist', () => {
    expect(TABS).toContain('role="tablist"');
    expect(TABS).toContain('role="tab"');
    expect(TABS).toContain('role="tabpanel"');
    expect(TABS).toContain("event.key === 'ArrowRight'");
    expect(TABS).toContain('tabIndex={active === tab.id ? 0 : -1}');
  });

  /**
   * Google Maps measures its container at construction, so a map built while
   * display:none renders grey and stays grey — and nothing in the map's deps
   * changes when you switch back, so it stays grey for the life of the page.
   *
   * The initial state must therefore be Today no matter what the link asked
   * for. This used to hold only because nothing could ask: `?tab=` was inert.
   * Once the page began forwarding it, `useState(initialTab)` let the setup
   * checklist's own `?tab=settings` link emit `hidden` on the Today panel in
   * the SSR stream. Both deep-link routes now switch in a mount effect instead,
   * which is how the hash route always worked.
   */
  it('leaves the map on the tab that is visible first', () => {
    expect(TABS).toContain('initialTab = \'today\'');
    const todayPanel = PAGE.slice(PAGE.indexOf('const todayPanel'), PAGE.indexOf('const settingsPanel'));
    expect(todayPanel).toContain('<QuickStopCoverage');
    // First paint is Today, whatever was asked for...
    expect(TABS).toContain("useState<QuickStopTabId>('today')");
    expect(TABS).not.toContain('useState<QuickStopTabId>(initialTab)');
    // ...and the requested tab arrives after mount, like the hash does.
    expect(TABS).toContain('setActive(initialTab);');
  });
});
