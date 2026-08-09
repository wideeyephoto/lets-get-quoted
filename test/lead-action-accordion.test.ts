import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const LEAD_DIR = ['src', 'app', 'dashboard', 'leads', '[leadId]'];
const PAGE = read(...LEAD_DIR, 'page.tsx');
const SCHEDULER = read(...LEAD_DIR, 'LeadAvailabilityScheduler.tsx');
const DECK = read(...LEAD_DIR, 'LeadActionDeck.tsx');
const ON_HASH = read(...LEAD_DIR, 'OpenActionOnHash.tsx');

/**
 * Scheduling the estimate and building the quote are the two halves of the lead
 * page, and only one of them is open at a time. The mechanism is `name` on
 * <details>: two elements sharing a name are an exclusive group the browser
 * itself keeps honest, so there is no state to get out of step.
 */
describe('the lead page action panels are an exclusive accordion', () => {
  const GROUP = 'name="lead-action"';

  it('puts both panels in the same exclusive group', () => {
    expect(PAGE).toContain(GROUP);
    expect(SCHEDULER).toContain(GROUP);
  });

  // Two elements with the same name but different tags are not a group.
  it('and both are actually <details>', () => {
    expect(PAGE).toMatch(/<details\s+id="lead-estimate"/);
    expect(SCHEDULER).toMatch(/<details\s+id="availability-snapshot"/);
  });

  /**
   * Which one starts open follows the stage of the lead. The calendar only
   * renders while no estimate is booked, and in that case it leads; once one is
   * booked the calendar is gone from the page entirely and the quote is the
   * only thing left, so it opens instead.
   */
  it('opens the calendar for a new lead and the quote once the visit is booked', () => {
    expect(PAGE).toMatch(/<LeadAvailabilityScheduler\s+defaultOpen/);
    expect(PAGE).toMatch(/<details\s+id="lead-estimate"[\s\S]{0,120}open=\{hasScheduledEstimate\}/);
  });

  /**
   * The pairing that would fail silently.
   *
   * The action deck's buttons are fragment links at the top of the page, and
   * the panels they point at are now collapsible. Rename an id on one side and
   * nothing errors — the button just scrolls somewhere and opens nothing, which
   * reads to the owner as a dead control.
   */
  it('every deck fragment link points at a panel that exists', () => {
    const targets = [...DECK.matchAll(/href="#([a-z-]+)"/g)].map((m) => m[1]);
    expect(targets.length).toBeGreaterThan(2);
    const ids = new Set([...`${PAGE}${SCHEDULER}`.matchAll(/<details\s+id="([a-z-]+)"/g)].map((m) => m[1]));
    for (const target of new Set(targets)) {
      expect(ids.has(target), `the deck links to #${target}, which is not a panel`).toBe(true);
    }
  });

  /**
   * A fragment link to a CLOSED <details> does nothing on its own — browsers
   * only auto-expand when the target is inside one, and here the id is on the
   * element itself. This is what closes that gap, and it needs both listeners:
   * a link to the fragment you are already on fires no hashchange.
   */
  it('mounts the helper that opens the panel a deck link points at', () => {
    expect(PAGE).toContain('<OpenActionOnHash />');
    expect(ON_HASH).toContain("addEventListener('hashchange'");
    expect(ON_HASH).toContain("addEventListener('click'");
  });
});
