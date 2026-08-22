import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Responsive rendering and accessibility of the dispatch screens, asserted
 * against the source rather than a browser.
 *
 * The suite is pure-unit (vitest.config.ts, `environment: 'node'`), so there is
 * no DOM to measure. These assertions are therefore about the RULES that decide
 * the measurements — a 44px min-height, an overflow-x container, a labelled
 * dialog — in the same shape schedule-a11y.test.ts and crew-horizontal-scroll
 * .test.ts already use. Every number here is the one the existing a11y suite
 * already holds the rest of the dashboard to.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripCss = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '');
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const DISPATCH_CSS = stripCss(read('src', 'app', 'dashboard', 'crew', 'dispatch.module.css'));
const SUB_CSS = stripCss(read('src', 'app', 'sub', '[token]', 'sub.module.css'));

const CREW_PAGE = stripJs(read('src', 'app', 'dashboard', 'crew', 'page.tsx'));
const ROSTER = stripJs(read('src', 'app', 'dashboard', 'crew', 'CrewRoster.tsx'));
const REQUESTS = stripJs(read('src', 'app', 'dashboard', 'crew', 'JobRequests.tsx'));
const PICKER = stripJs(read('src', 'app', 'dashboard', 'crew', 'requests', '[id]', 'RecipientPicker.tsx'));
const REQUEST_PAGE = stripJs(read('src', 'app', 'dashboard', 'crew', 'requests', '[id]', 'page.tsx'));
const PUBLIC_PAGE = stripJs(read('src', 'app', 'sub', '[token]', 'page.tsx'));
const ADD_MENU = stripJs(read('src', 'app', 'dashboard', 'crew', 'AddPersonMenu.tsx'));
const ADD_DRAWER = stripJs(read('src', 'app', 'dashboard', 'crew', 'AddSubcontractorDrawer.tsx'));
const FIELDS = stripJs(read('src', 'app', 'dashboard', 'crew', 'SubcontractorFields.tsx'));

/** The declaration block for a selector, so a rule is asserted in context. */
function rule(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
}

// ============================================================================
// The Crew page itself
// ============================================================================

describe('Crew & subcontractors — the page', () => {
  it('is titled for both kinds of person', () => {
    expect(CREW_PAGE).toContain('Crew &amp; subcontractors');
  });

  it('offers exactly the four sections, in order', () => {
    const tabs = CREW_PAGE.slice(CREW_PAGE.indexOf('const TABS'), CREW_PAGE.indexOf('type TabId'));
    expect(tabs).toContain("{ id: 'people', label: 'People' }");
    expect(tabs).toContain("{ id: 'requests', label: 'Job requests' }");
    expect(tabs).toContain("{ id: 'hours', label: 'Hours & pay' }");
    expect(tabs).toContain("{ id: 'jobs', label: 'Labor by job' }");
    expect(tabs.indexOf("'people'")).toBeLessThan(tabs.indexOf("'requests'"));
    expect(tabs.indexOf("'requests'")).toBeLessThan(tabs.indexOf("'hours'"));
  });

  it('keeps ?tab=crew working, because the sidebar and every bookmark still say it', () => {
    expect(CREW_PAGE).toContain("if (value === 'crew') return 'people'");
  });

  it('uses aria-current on the open tab rather than colour alone', () => {
    expect(CREW_PAGE).toContain("aria-current={tab === item.id ? 'page' : undefined}");
  });

  it('replaces the single add button with a menu of the two kinds of person', () => {
    expect(CREW_PAGE).toContain('<AddPersonMenu');
    expect(CREW_PAGE).not.toContain('+ Add crew member');
    expect(ADD_MENU).toContain('+ Add person');
    expect(ADD_MENU).toContain('Add employee');
    expect(ADD_MENU).toContain('Add subcontractor');
  });
});

describe('the Add person menu is a real menu', () => {
  it('declares itself as one and says whether it is open', () => {
    expect(ADD_MENU).toContain('aria-haspopup="menu"');
    expect(ADD_MENU).toContain('aria-expanded={open}');
    expect(ADD_MENU).toContain('role="menu"');
    expect(ADD_MENU).toContain('role="menuitem"');
  });

  it('closes on Escape and on a click outside', () => {
    expect(ADD_MENU).toContain("event.key === 'Escape'");
    expect(ADD_MENU).toContain("document.addEventListener('mousedown'");
  });

  it('moves focus into the menu when it opens', () => {
    expect(ADD_MENU).toContain('firstItemRef.current?.focus()');
  });

  it('sizes its items for a finger', () => {
    expect(rule(DISPATCH_CSS, '.addPersonItem')).toContain('min-height: 44px');
  });
});

// ============================================================================
// Worker type
// ============================================================================

describe('the worker-type field and filter', () => {
  it('filters the roster by employee or subcontractor', () => {
    expect(ROSTER).toContain('<span>Worker type</span>');
    expect(ROSTER).toContain('<option value="employee">');
    expect(ROSTER).toContain('<option value="subcontractor">');
    expect(ROSTER).toContain("if (workerType !== 'all' && row.workerType !== workerType) return false;");
  });

  it('re-runs the filter when the worker type changes', () => {
    // A missing dependency here is a filter that looks like it works until the
    // list is memoised against a stale value.
    expect(ROSTER).toContain('[rows, query, status, workerType, role, jobFilter, appFilter, sort]');
  });

  it('searches company names and trades, not just people', () => {
    expect(ROSTER).toContain("(row.companyName ?? '').toLowerCase().includes(needle)");
    expect(ROSTER).toContain('row.trades.some((trade) => trade.toLowerCase().includes(needle))');
  });

  it('collects every subcontractor field in one shared component', () => {
    for (const field of [
      'name="companyName"',
      'name="trades"',
      'name="skills"',
      'name="serviceArea"',
      'name="travelRadiusMiles"',
      'name="availabilityNote"',
      'name="emergencyAvailable"',
      'name="ratePreference"',
      'name="minimumCharge"',
      'name="licenseNumber"',
      'name="licenseExpiresOn"',
      'name="insuranceCarrier"',
      'name="insuranceExpiresOn"',
      'name="w9Status"',
      'name="agreementStatus"',
      'name="paymentTerms"',
      'name="internalNotes"',
      'name="tags"',
      'name="subStatus"',
    ]) {
      expect(FIELDS, field).toContain(field);
    }
  });

  it('labels every one of them', () => {
    // A count rather than a spot check: the two must move together, and a field
    // added without a label is exactly what this catches.
    const labels = FIELDS.match(/htmlFor=/g)?.length ?? 0;
    const inputs = FIELDS.match(/<(input|select|textarea)\b/g)?.length ?? 0;
    expect(labels).toBeGreaterThanOrEqual(inputs - FIELDS.match(/type="checkbox"/g)!.length);
  });
});

// ============================================================================
// The drawer
// ============================================================================

describe('the Add subcontractor drawer', () => {
  it('has dialog semantics and a name', () => {
    expect(ADD_DRAWER).toContain('role="dialog"');
    expect(ADD_DRAWER).toContain('aria-modal="true"');
    expect(ADD_DRAWER).toContain('aria-labelledby={`${formId}-title`}');
  });

  it('traps Tab inside itself', () => {
    expect(ADD_DRAWER).toContain("if (event.key !== 'Tab'");
    expect(ADD_DRAWER).toContain('last.focus()');
    expect(ADD_DRAWER).toContain('first.focus()');
  });

  it('closes on Escape and puts focus back where it came from', () => {
    expect(ADD_DRAWER).toContain("if (event.key === 'Escape') requestCloseRef.current()");
    expect(ADD_DRAWER).toContain('opener?.focus?.()');
  });

  it('announces a refused save to a screen reader', () => {
    expect(ADD_DRAWER).toContain('role="alert"');
  });

  it('never scrolls the page behind it', () => {
    expect(ADD_DRAWER).toContain("document.body.style.overflow = 'hidden'");
  });

  it('derives its open state from the URL rather than a prop', () => {
    // The bug AddCrewDrawer's long comment exists to document. A second drawer
    // written the old way would bring it straight back.
    expect(ADD_DRAWER).toContain("searchParams.get('add') === 'sub'");
    expect(ADD_DRAWER).not.toMatch(/useState\(\s*open\s*\)/);
  });
});

// ============================================================================
// Job requests
// ============================================================================

describe('the Job requests tab', () => {
  it('shows the four summary cards', () => {
    expect(REQUESTS).toContain('Open requests');
    expect(REQUESTS).toContain('Jobs filled');
    expect(REQUESTS).toContain('Average response');
    expect(REQUESTS).toContain('Response rate');
  });

  it('says out loud when this environment cannot text anybody', () => {
    expect(REQUESTS).toContain('Texts are simulated here');
    expect(REQUESTS).toContain('role="status"');
  });

  it('lays the cards out as a grid that reflows rather than a fixed row', () => {
    expect(rule(DISPATCH_CSS, '.summaryGrid')).toContain('repeat(auto-fit, minmax(11rem, 1fr))');
  });

  it('shrinks them on a phone instead of overflowing', () => {
    const mobile = DISPATCH_CSS.slice(DISPATCH_CSS.indexOf('@media (max-width: 640px)'));
    expect(mobile).toContain('minmax(8.5rem, 1fr)');
    expect(mobile).toContain('font-size: 1.5rem');
  });
});

// ============================================================================
// The recipient picker
// ============================================================================

describe('choosing recipients never sends anything', () => {
  it('keeps selection in local state and sends only on submit', () => {
    expect(PICKER).toContain('const [selected, setSelected] = useState');
    expect(PICKER).toContain('onChange={() => toggle(entry.crewId)}');
    // The give-away would be an action fired from the change handler.
    expect(PICKER).not.toMatch(/onChange=\{[^}]*action\(/);
    expect(PICKER).toContain('<form action={action}>');
  });

  it('spells out that nothing has gone yet', () => {
    expect(PICKER).toContain('Nothing has been sent yet');
  });

  it('disables the send until somebody is picked and the message is valid', () => {
    expect(PICKER).toContain('disabled={count === 0 || problem !== null}');
    expect(PICKER).toContain("aria-label={count === 0 ? 'Send job offers — pick at least one subcontractor first' : undefined}");
  });

  it('shows the seven facts a decision needs on every row', () => {
    expect(PICKER).toContain('{entry.trades.join');
    expect(PICKER).toContain('{entry.distanceLabel}');
    expect(PICKER).toContain('{entry.availability}');
    expect(PICKER).toContain('{entry.ratingLabel}');
    expect(PICKER).toContain('{entry.completed} completed');
    expect(PICKER).toContain('{entry.complianceLabel}');
    expect(PICKER).toContain('{entry.displayName}');
  });

  it('ties each checkbox to the facts beside it', () => {
    expect(PICKER).toContain('aria-describedby={`${inputId}-facts`}');
  });

  it('previews the exact message, and announces changes to it', () => {
    expect(PICKER).toContain('personalizeOfferMessage(message, sampleLink)');
    expect(PICKER).toContain('aria-live="polite"');
  });

  it('scrolls a long directory inside its own box, never the page', () => {
    const list = rule(DISPATCH_CSS, '.matchList');
    expect(list).toContain('overflow-y: auto');
    expect(list).toContain('overflow-x: hidden');
    expect(list).toContain('max-height');
  });

  it('drops to two columns on a phone rather than squeezing three into 320px', () => {
    const mobile = DISPATCH_CSS.slice(DISPATCH_CSS.indexOf('@media (max-width: 640px)'));
    expect(mobile).toContain('.matchLabel');
    expect(mobile).toContain('grid-template-columns: auto 1fr');
    expect(mobile).toContain('.matchSide');
  });

  it('sizes the rows and their checkboxes for a finger', () => {
    expect(rule(DISPATCH_CSS, '.matchLabel')).toContain('min-height: 44px');
    expect(rule(DISPATCH_CSS, '.matchCheck')).toContain('width: 20px');
  });

  it('shows a focus ring on the row a keyboard is on', () => {
    expect(rule(DISPATCH_CSS, '.matchRow:focus-within')).toContain('outline: 2px solid var(--accent)');
  });
});

describe('the request page', () => {
  it('gives the offer table a caption and row headers', () => {
    expect(REQUEST_PAGE).toContain('<caption className="sr-only">');
    expect(REQUEST_PAGE).toContain('<th scope="col">');
    expect(REQUEST_PAGE).toContain('<th scope="row">');
  });

  it('lets the table scroll sideways inside its own container', () => {
    expect(rule(DISPATCH_CSS, '.offerTableWrap')).toContain('overflow-x: auto');
  });

  it('shows queued, carrier-accepted, viewed, declined and time-left facts', () => {
    expect(REQUEST_PAGE).toContain('Texts queued');
    expect(REQUEST_PAGE).toContain('Carrier accepted');
    expect(REQUEST_PAGE).toContain('Viewed');
    expect(REQUEST_PAGE).toContain('Declined');
    expect(REQUEST_PAGE).toContain('Time remaining');
  });

  it('offers cancel and reopen', () => {
    expect(REQUEST_PAGE).toContain('Cancel request');
    expect(REQUEST_PAGE).toContain('Reopen request');
    expect(REQUEST_PAGE).toContain('New expiration');
  });
});

// ============================================================================
// The public page
// ============================================================================

describe('the public proposal page', () => {
  it('shows everything a subcontractor needs to decide', () => {
    expect(PUBLIC_PAGE).toContain('{view.businessName}');
    expect(PUBLIC_PAGE).toContain('{view.jobTitle}');
    expect(PUBLIC_PAGE).toContain('{view.generalLocation}');
    expect(PUBLIC_PAGE).toContain('miles from you');
    expect(PUBLIC_PAGE).toContain('{view.scheduleLabel');
    expect(PUBLIC_PAGE).toContain('{view.payLabel}');
    expect(PUBLIC_PAGE).toContain('Requirements');
    expect(PUBLIC_PAGE).toContain('Offer expires');
  });

  it('carries the first-qualified-acceptance notice and the three actions', () => {
    expect(PUBLIC_PAGE).toContain('First qualified acceptance wins.');
    expect(PUBLIC_PAGE).toContain('Accept this job');
    expect(PUBLIC_PAGE).toContain('Not available');
    expect(PUBLIC_PAGE).toContain('Ask a question');
  });

  it('promises the address only after acceptance, and reads it off `authorized`', () => {
    expect(PUBLIC_PAGE).toContain('The full address and the customer&rsquo;s contact details are shown once you accept.');
    // Every private field on this page is reached through view.authorized, which
    // loadPublicOffer only builds for the winner.
    expect(PUBLIC_PAGE).toContain('view.authorized.address');
    expect(PUBLIC_PAGE).toContain('view.authorized.clientName');
    expect(PUBLIC_PAGE).not.toMatch(/view\.(address|clientName|clientPhone)\b/);
  });

  it('says the one sentence a late arrival must be shown', () => {
    expect(PUBLIC_PAGE).toContain('{ALREADY_CLAIMED_MESSAGE}');
    expect(PUBLIC_PAGE).toContain('Keep me as backup');
  });

  it('is never indexed and never previewed — a link here is a credential', () => {
    expect(PUBLIC_PAGE).toContain('robots: { index: false, follow: false, nocache: true }');
  });

  it('keeps exactly one H1 in every state', () => {
    // Five settled states plus the live offer. Each renders its own <h1>, and
    // they are mutually exclusive early returns.
    const h1s = PUBLIC_PAGE.match(/<h1\b/g)?.length ?? 0;
    expect(h1s).toBeGreaterThan(0);
    expect(PUBLIC_PAGE.match(/<h1 className=\{styles\.title\}/g)?.length ?? 0).toBe(1);
  });
});

describe('the public page on a phone', () => {
  it('is a single column with a hard maximum, not a desktop layout scaled down', () => {
    const shell = rule(SUB_CSS, '.shell');
    expect(shell).toContain('max-width: 34rem');
    expect(shell).toContain('margin: 0 auto');
  });

  it('keeps Accept reachable with a thumb, and leaves room for it', () => {
    const bar = rule(SUB_CSS, '.actionBar');
    expect(bar).toContain('position: fixed');
    expect(bar).toContain('bottom: 0');
    expect(bar).toContain('env(safe-area-inset-bottom)');
    expect(rule(SUB_CSS, '.shell')).toContain('padding: 1rem 1rem 8rem');
  });

  it('returns the bar to the flow on a wider screen', () => {
    const wide = SUB_CSS.slice(SUB_CSS.indexOf('@media (min-width: 48rem)'));
    expect(wide).toContain('position: static');
  });

  it('sizes the accept button and the two secondary controls for a finger', () => {
    expect(rule(SUB_CSS, '.accept')).toContain('min-height: 52px');
    expect(rule(SUB_CSS, '.disclosureSummary')).toContain('min-height: 48px');
  });

  it('uses 16px inputs so iOS does not zoom the page on focus', () => {
    expect(SUB_CSS).toContain('font-size: 16px');
  });

  it('gives the disclosure summaries a visible focus ring', () => {
    expect(rule(SUB_CSS, '.disclosureSummary:focus-visible')).toContain('outline: 2px solid var(--accent)');
  });
});

// ============================================================================
// The design system
// ============================================================================

describe('it wears the existing design system rather than a second one', () => {
  it('builds every surface out of the dashboard’s own tokens', () => {
    for (const token of ['var(--bg-3)', 'var(--line)', 'var(--text)', 'var(--muted)', 'var(--accent)', 'var(--gold-ink)', 'var(--good)']) {
      expect(DISPATCH_CSS, token).toContain(token);
    }
  });

  it('uses the amber section label the rest of the dashboard uses', () => {
    expect(rule(DISPATCH_CSS, '.formSection > legend')).toContain('color: var(--gold-ink)');
    expect(REQUESTS).toContain('className="eyebrow"');
  });

  it('reuses the shared panel and button classes rather than inventing them', () => {
    expect(REQUESTS).toContain('btn primary');
    expect(REQUEST_PAGE).toContain('panel workspace-section-card');
    expect(PICKER).toContain('btn primary');
  });

  it('hard-codes no colours outside the token set', () => {
    // rgba() built on --tint and the four status hues is fine; a raw hex is a
    // second palette starting.
    const hexes = DISPATCH_CSS.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hexes).toEqual([]);
  });
});
