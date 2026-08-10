import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * /features — the four operational stages of one job record.
 *
 * Node environment, no DOM, so these read the source as text. The comments in
 * both the component and the CSS quote the strings being asserted, so they are
 * stripped before anything is matched.
 */

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const stripJs = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const SRC = stripJs(read('src/app/features/job-record-stages.tsx'));
const PAGE = stripJs(read('src/app/features/page.tsx'));
const CSS = read('src/components/flagship/flagship.module.css').replace(/\/\*[\s\S]*?\*\//g, '');

const STAGE_IDS = ['planning-and-scheduling', 'automations', 'payments', 'website-and-growth'];

describe('one job record, four stages', () => {
  it('names the same job in every stage, and only once', () => {
    // The whole argument of the section is that this is not four records.
    expect(SRC.match(/JOB J-1048/g)?.length).toBe(1);
    expect(SRC).toContain('Alex Morgan · Royal Oak');
    expect(SRC).toContain('Same job record');
  });

  it('carries all four stages, in order, with the titles the homepage badges use', () => {
    const ids = [...SRC.matchAll(/\n    id: '([a-z-]+)'/g)].map((m) => m[1]);
    expect(ids).toEqual(STAGE_IDS);
    for (const title of ['Plan & Schedule', 'Automate & Follow Up', 'Get Paid Faster', 'Grow Your Business']) {
      expect(SRC).toContain(`title: '${title}'`);
    }
  });

  it('opens on stage 01', () => {
    expect(SRC).toContain('useState(0)');
  });

  it('moves the same four slots forward rather than swapping the panel out', () => {
    // Every stage draws the arrival tracker at a different point, which is what
    // makes the record read as one job at four moments.
    const at = [...SRC.matchAll(/steps: ARRIVAL, at: (\d)/g)].map((m) => Number(m[1]));
    expect(at).toEqual([0, 1, 2, 3]);
    // And each stage's badge says where the money has got to.
    const badges = [...SRC.matchAll(/badge: '([^']+)',\n    rows/g)].map((m) => m[1]);
    expect(badges).toEqual(['Quote approved', 'On the way', 'Deposit paid', 'Paid in full']);
  });

  it('keeps every tool description the four bands used to carry', () => {
    for (const tool of [
      'Arrival windows, capacity and the details needed to keep the promise.',
      'Assignments, time clock, hours and estimated pay.',
      'Two-way texts and a job-specific client portal.',
      'Automatic visits, saved cards and predictable revenue.',
      'Itemized proposals, optional upgrades and clear approvals.',
      'Deposits, balances and payment plans through Stripe.',
      'See customer money, payroll and bills before they move.',
      'Follow-ups, review requests and AI-assisted marketing.',
    ]) {
      expect(SRC).toContain(tool);
    }
  });

  it('renders all four panels so none of that copy depends on a click', () => {
    // `hidden`, not conditional rendering: out of the tab order and out of the
    // accessibility tree, still in the HTML.
    expect(SRC).toContain('hidden={i !== active}');
    expect(SRC).not.toMatch(/\{\s*i === active\s*&&/);
  });
});

describe('the tabs pattern', () => {
  it('is a real vertical tablist', () => {
    expect(SRC).toContain('role="tablist"');
    expect(SRC).toContain('aria-orientation="vertical"');
    // Once as the button's attribute, once as the selector that finds them.
    expect(SRC.match(/role="tab"/g)?.length).toBe(2);
    expect(SRC).toContain('role="tabpanel"');
    expect(SRC).toContain('aria-selected={i === active}');
  });

  it('uses a roving tabindex, so Tab leaves the rail rather than walking it', () => {
    expect(SRC).toContain('tabIndex={i === active ? 0 : -1}');
  });

  it('handles both axes, Home and End, and wraps', () => {
    for (const key of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      expect(SRC).toContain(key);
    }
    // ((next % n) + n) % n — a negative index from ArrowUp on the first tab
    // has to land on the last, not on undefined.
    expect(SRC).toContain('((next % STAGES.length) + STAGES.length) % STAGES.length');
  });

  it('moves focus with the selection only when a key moved it', () => {
    // Automatic activation is what the pattern prescribes when panels are
    // cheap, but doing it on every change steals focus from somebody who
    // clicked and then tabbed away.
    expect(SRC).toContain('movingRef');
    expect(SRC).toContain('if (!movingRef.current) return;');
  });

  it('does not draw a control that would do nothing if pressed', () => {
    // "Send payment link" is a drawing of the app, so it is a span.
    expect(SRC).toContain('<span className="jrs-action" aria-hidden="true">');
    expect(SRC).not.toMatch(/<button[^>]*jrs-action/);
  });

  it('never autoplays', () => {
    expect(SRC).not.toContain('setInterval');
    expect(SRC).not.toContain('setTimeout');
  });
});

describe('following a link into a stage', () => {
  it('selects it rather than scrolling near it', () => {
    expect(SRC).toContain('window.location.hash');
    expect(SRC).toContain("window.addEventListener('hashchange', sync)");
    expect(SRC).toContain("window.removeEventListener('hashchange', sync)");
  });

  it('lands clear of the fixed header at both header heights', () => {
    expect(CSS).toMatch(/\.jrs-rail \[role="tab"\]\)\s*\{ scroll-margin-top: 104px/);
    expect(CSS).toContain('scroll-margin-top: 88px');
  });

  it('sends the section CTA to the back office', () => {
    expect(SRC).toContain('href="/features/back-office"');
    expect(SRC).toContain('Explore the connected back office');
  });
});

describe('the section around it', () => {
  it('replaced only the capability bands', () => {
    expect(PAGE).toContain('<JobRecordStages />');
    expect(PAGE).toContain('EVERYTHING BEHIND THE WEBSITE');
    expect(PAGE).toContain('One job record.');
    expect(PAGE).toContain('Included from day one · No monthly subscription');
    expect(PAGE).not.toContain('capability-band');
  });

  it('leaves the rest of the page alone', () => {
    for (const kept of [
      'THE FULL CONTRACTOR SUITE',
      'flagship-index',
      'index-hero-beside',
      '<PageCTA',
      '<SiteFooter />',
    ]) {
      expect(PAGE).toContain(kept);
    }
  });
});

describe('the layout', () => {
  it('is a rail beside the record on a desktop', () => {
    expect(CSS).toMatch(/\.jrs\)\s*\{[^}]*grid-template-columns: minmax\(240px, \.42fr\)/);
  });

  it('turns the rail into a row of scrolling cards on a narrow screen', () => {
    const at = CSS.indexOf('.jrs) { grid-template-columns: minmax(0, 1fr)');
    expect(at).toBeGreaterThan(-1);
    expect(CSS.slice(CSS.lastIndexOf('@media', at), at)).toContain('max-width: 1000px');
    expect(CSS).toContain('grid-auto-flow: column');
  });

  it('stacks each record row on a phone rather than squeezing three columns', () => {
    const at = CSS.indexOf('.jrs-row) { grid-template-columns: 48px minmax(0, 1fr)');
    expect(at).toBeGreaterThan(-1);
    expect(CSS.slice(CSS.lastIndexOf('@media', at), at)).toContain('max-width: 760px');
  });

  it('honours prefers-reduced-motion, and has a transition worth honouring', () => {
    expect(CSS).toMatch(/transition:[^;]*\.2s ease/);
    // Scan back from the LAST .jrs rule, not forward from the first: there are
    // several reduced-motion blocks in a 6,000-line sheet and indexOf from the
    // top of the section finds somebody else's.
    const last = CSS.lastIndexOf('.jrs-more a span) { transition: none; }');
    expect(last).toBeGreaterThan(-1);
    const block = CSS.slice(CSS.lastIndexOf('@media', last), last);
    expect(block).toContain('prefers-reduced-motion: reduce');
  });
});
