import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { nextTabIndex } from '@/lib/tab-strip';

/**
 * SIX TAB STRIPS, TWO DIFFERENT FAULTS, ONE PATTERN HALF-APPLIED.
 *
 * The three Focus views declared `role="tablist"` and `role="tab"` and stopped
 * there: no ids, no aria-controls, and no panel wearing `role="tabpanel"`. A
 * screen reader was told "tab 3 of 6" and given nothing to move into — the tab
 * announced a relationship to a thing that did not exist.
 *
 * The three Smoothie views had all of that right, and had the roving tabindex
 * — `tabIndex={active ? 0 : -1}` — with NO key handler anywhere near it. That
 * is the worse of the two. A roving tabindex takes every inactive tab out of
 * the tab order on the promise that the arrows will reach them, and nothing
 * did, so five of six tabs were unreachable from a keyboard entirely.
 *
 * QuickStopTabs had the whole pattern working the whole time. nextTabIndex is
 * that logic pulled out so the wrap-around is tested once instead of written
 * six times.
 */

const strip = (source: string) =>
  source
    .replace(/\r\n/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const read = (path: string) => strip(readFileSync(path, 'utf8'));

describe('nextTabIndex', () => {
  it('walks forward and back', () => {
    expect(nextTabIndex('ArrowRight', 0, 4)).toBe(1);
    expect(nextTabIndex('ArrowLeft', 2, 4)).toBe(1);
  });

  it('treats a tablist as a loop, in both directions', () => {
    // Falling off the end and stopping is the behaviour people report as "the
    // last tab is broken".
    expect(nextTabIndex('ArrowRight', 3, 4)).toBe(0);
    expect(nextTabIndex('ArrowLeft', 0, 4)).toBe(3);
  });

  it('takes the vertical arrows too', () => {
    // A tablist can be drawn as a column, and the strip does not get to decide
    // which arrow the reader reaches for.
    expect(nextTabIndex('ArrowDown', 0, 3)).toBe(1);
    expect(nextTabIndex('ArrowUp', 0, 3)).toBe(2);
  });

  it('jumps to the ends', () => {
    expect(nextTabIndex('Home', 2, 4)).toBe(0);
    expect(nextTabIndex('End', 1, 4)).toBe(3);
  });

  it('ignores every other key, so typing still works', () => {
    // Returning a number here would preventDefault on Tab, Enter and Space —
    // the keys that leave the strip and the key that activates a tab.
    for (const key of ['Tab', 'Enter', ' ', 'a', 'Escape', 'PageDown']) {
      expect(nextTabIndex(key, 1, 4), key).toBeNull();
    }
  });

  it('refuses to guess when the selection is not in the list', () => {
    // 0 would look like a fix and would silently jump to the first tab on any
    // key press — findIndex returns -1 more often than anyone expects.
    expect(nextTabIndex('ArrowRight', -1, 4)).toBeNull();
    expect(nextTabIndex('ArrowRight', 9, 4)).toBeNull();
    expect(nextTabIndex('ArrowRight', 0, 0)).toBeNull();
  });

  it('holds still on a strip of one', () => {
    expect(nextTabIndex('ArrowRight', 0, 1)).toBe(0);
    expect(nextTabIndex('End', 0, 1)).toBe(0);
  });
});

const STRIPS = [
  ['src/app/dashboard/jobs/FocusView.tsx', 'focus-job'],
  ['src/app/dashboard/leads/LeadFocusView.tsx', 'focus-lead'],
  ['src/app/dashboard/clients/ClientFocusView.tsx', 'focus-client'],
  ['src/app/dashboard/jobs/JobSmoothieView.tsx', 'job-smoothie'],
  ['src/app/dashboard/leads/LeadSmoothieView.tsx', 'smoothie'],
  ['src/app/dashboard/clients/ClientSmoothieView.tsx', 'client-smoothie'],
] as const;

describe('every detail tab strip', () => {
  it.each(STRIPS)('%s points its tabs at a panel that exists', (path, prefix) => {
    const source = read(path);
    expect(source).toContain(`id={\`${prefix}-tab-\${`);
    expect(source).toContain(`aria-controls="${prefix}-tabpanel"`);
    // The other end of the relationship. A tab naming a panel id that nothing
    // carries is the same defect with extra steps.
    expect(source).toContain(`id="${prefix}-tabpanel"`);
    expect(source).toContain('role="tabpanel"');
    expect(source).toContain(`aria-labelledby={\`${prefix}-tab-\${tab}\`}`);
  });

  it.each(STRIPS)('%s can be moved through with the arrows', (path) => {
    const source = read(path);
    // The pairing that matters: taking tabs out of the tab order is only safe
    // if something puts them back within reach.
    expect(source).toContain('tabIndex={tab === ');
    expect(source).toContain('onKeyDown={onTabKeyDown}');
    expect(source).toContain('nextTabIndex(event.key');
    // And focus has to follow the selection, or the arrows move a highlight
    // while the keyboard stays where it was.
    expect(source).toContain('tabRefs.current[id]?.focus()');
  });

  it.each(STRIPS)('%s takes the movement rule from one place', (path) => {
    expect(read(path)).toContain("from '@/lib/tab-strip'");
  });
});

describe('a filter is not a tab strip', () => {
  const WORKSPACE = read('src/app/dashboard/jobs/JobsWorkspace.tsx');

  it('the jobs status filter is a group of toggles', () => {
    /**
     * A tab is a promise: press me and a panel appears in place of another.
     * These narrow the list already on screen. There was no aria-controls on
     * any of them because there is no panel to point at — and on the Focus
     * layout the page announced ten tabs, five of them these, sitting beside
     * five real ones that do have a panel.
     */
    expect(WORKSPACE).toContain('role="group" aria-label="Filter jobs by status"');
    expect(WORKSPACE).toContain('aria-pressed={status === f.value}');
  });

  it('no longer claims the filter switches panels', () => {
    const at = WORKSPACE.indexOf('aria-label="Filter jobs by status"');
    expect(at).toBeGreaterThan(0);
    const markup = WORKSPACE.slice(at, at + 400);
    expect(markup).not.toContain('role="tab"');
    expect(markup).not.toContain('aria-selected');
  });
});

describe('the strip this pattern came from', () => {
  it('still has it, so the copy and the original agree', () => {
    // QuickStopTabs is left with its own inline version deliberately — another
    // session is working in that route and a needless edit there would collide.
    // This asserts it has not silently lost the behaviour the others copied.
    const source = read('src/app/dashboard/quick-stops/QuickStopTabs.tsx');
    expect(source).toContain('role="tablist"');
    expect(source).toContain('onKeyDown={onKeyDown}');
    expect(source).toContain("aria-controls={`qs-panel-");
    expect(source).toContain('tabIndex={active === tab.id ? 0 : -1}');
    expect(source).toContain('.focus()');
  });
});
