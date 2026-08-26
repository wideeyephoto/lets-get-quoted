import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const stripCss = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '');

const ROSTER = stripJs(read('src', 'app', 'dashboard', 'crew', 'CrewRoster.tsx'));
const PAGE = stripJs(read('src', 'app', 'dashboard', 'crew', 'page.tsx'));
const REQUESTS = stripJs(read('src', 'app', 'dashboard', 'crew', 'JobRequests.tsx'));
const LABOR = stripJs(read('src', 'app', 'dashboard', 'crew', 'LaborByJob.tsx'));
const HOURS = stripJs(read('src', 'app', 'dashboard', 'crew', 'HoursAndPay.tsx'));
const CSS = stripCss(read('src', 'app', 'dashboard', 'crew', 'crew.module.css'));

describe('the action-first roster', () => {
  it('puts availability and field-app setup before the directory', () => {
    expect(ROSTER).toContain('role="group" aria-label="Crew availability filters"');
    expect(ROSTER).toContain('people need\'} field-app setup');
    expect(ROSTER).toContain('Finish setup');
    expect(ROSTER).toContain('<span>Needs setup</span>');
    expect(ROSTER).toContain("showRosterSlice('active', 'all', 'needs-setup', 'employee')");
    expect(ROSTER).toContain("setQuery('')");
    expect(ROSTER).toContain("setRole('all')");
    expect(PAGE).not.toContain('stat-ticker panel');
  });

  it('makes the row action match the setup problem', () => {
    const actions = ROSTER.slice(ROSTER.indexOf('function CrewActions'));
    expect(actions.indexOf('Assign job')).toBeLessThan(actions.indexOf("row.workerType === 'employee' && row.fieldApp === 'no-email'"));
    expect(ROSTER).toContain("row.fieldApp === 'no-email'");
    expect(ROSTER).toContain('Add email');
    expect(ROSTER).toContain("needsInvite(row.fieldApp)");
    expect(ROSTER).toContain("row.fieldApp === 'expired' ? 'Resend invite' : 'Send invite'");
    expect(ROSTER).toContain("open={row.fieldApp === 'no-email'}");
  });

  it('keeps the view menu focused on operational layouts', () => {
    const options = ROSTER.slice(ROSTER.indexOf('const ROSTER_VIEW_OPTIONS'), ROSTER.indexOf('function isSimplifiedRosterView'));
    expect(options).toContain("id: 'rows'");
    expect(options).toContain("id: 'table'");
    expect(options).not.toContain("id: 'cards'");
    expect(options).not.toContain("id: 'focus'");
    expect(ROSTER).not.toContain('skins={CREW_SKIN_OPTIONS}');
    expect(ROSTER).not.toContain("void setRosterViewAction('rows')");
  });
});

describe('the roster responds to the space it actually has', () => {
  it('uses a container query for the sidebar-squeezed desktop state', () => {
    expect(CSS).toMatch(/\.crewPanel\s*\{[^}]*container-type:\s*inline-size/);
    const narrow = CSS.slice(CSS.indexOf('@container (max-width: 800px)'));
    expect(narrow).toMatch(/\.row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(narrow).toMatch(/\.rowActions\s*\{[^}]*flex-wrap:\s*wrap/);
  });

  it('collapses secondary filters and supports mobile tab scrolling', () => {
    expect(ROSTER).toContain('aria-controls={filtersId}');
    expect(ROSTER).toContain("Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}");
    const mobile = CSS.slice(CSS.indexOf('@media (max-width: 640px)'));
    expect(mobile).toContain('.filters { display: none; }');
    expect(mobile).toContain('.filtersOpen { display: grid;');
    expect(mobile).toContain('.tabs {');
    for (const id of ['team', 'timecards', 'jobs']) {
      expect(PAGE).toContain(`id: '${id}'`);
    }
  });
});

describe('crew workflow exits are actionable and correctly routed', () => {
  it('lets an empty Job requests tab add its first subcontractor directly', () => {
    expect(REQUESTS).toContain('href="/dashboard/crew?tab=people&add=sub"');
    expect(REQUESTS).toContain('+ Add subcontractor');
  });

  it('files the time clock beside Timecards without hiding it in the empty state', () => {
    expect(PAGE).toMatch(/\{tab === 'timecards' \? \(\s*<TimeClockCard/);
    expect(PAGE).toContain('payView?.timeClockMode');
    expect(PAGE).toContain('payView?.openShifts');
    expect(HOURS).toContain('href="/dashboard/crew?tab=hours#time-clock"');
  });
});
