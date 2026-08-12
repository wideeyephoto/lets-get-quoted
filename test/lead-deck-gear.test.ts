import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const DECK = read('src', 'app', 'dashboard', 'leads', '[leadId]', 'LeadActionDeck.tsx');
const LEADS_CSS = read('src', 'app', 'dashboard', 'leads', 'leads.module.css');
const LEAD_PAGE = read('src', 'app', 'dashboard', 'leads', '[leadId]', 'page.tsx');
const JOB_PAGE = read('src', 'app', 'dashboard', 'jobs', '[id]', 'page.tsx');
const CLIENT_PAGE = read('src', 'app', 'dashboard', 'clients', '[id]', 'page.tsx');

/**
 * WHY THE GEAR MOVED.
 *
 * It was an unlabelled 34px square pinned to the action card's top-right. On a
 * phone that put it directly beneath the lead's name and its "(edit)" link —
 * two small controls stacked, one of which edits the customer's record. It
 * changes how YOUR action buttons are arranged, on every lead, and nothing on
 * screen said so.
 */
describe('the layout switch is at the foot of the deck, not over the lead', () => {
  it('renders after the actions it arranges, not before them', () => {
    const gearAt = DECK.indexOf('className={styles.deckGear}');
    const guidedAt = DECK.indexOf('className={styles.deckGuided}');
    const primaryAt = DECK.indexOf('className={styles.deckPrimary}');
    expect(gearAt).toBeGreaterThan(guidedAt);
    expect(gearAt).toBeGreaterThan(primaryAt);
  });

  it('is in flow at the bottom rather than floating at the top-right', () => {
    const gear = LEADS_CSS.slice(LEADS_CSS.indexOf('.deckGear {'), LEADS_CSS.indexOf('.deckGearBtn {'));
    expect(gear).not.toContain('position: absolute');
    // A bare `top:` — not padding-top or border-top — is the pin it used to have.
    expect(gear).not.toMatch(/[;{]\s*top:/);
    expect(gear).toContain('border-top');
  });

  /** A menu anchored below a button at the bottom of a card opens off-screen. */
  it('opens the menu upward now that it sits at the bottom', () => {
    const pop = LEADS_CSS.slice(LEADS_CSS.indexOf('.deckGearPop {'), LEADS_CSS.indexOf('.deckGearPop > p'));
    expect(pop).toContain('bottom: calc(100% - .4rem)');
    expect(pop).not.toMatch(/\btop:\s*42px/);
  });

  /** The gutter existed only to keep the content clear of the floating gear.
   *  On a phone it held open a tenth of the card for nothing. */
  it('gives back the space that was reserved for it', () => {
    const row = LEADS_CSS.slice(LEADS_CSS.indexOf('.deckGuided, .deckPrimary {'));
    expect(row.slice(0, row.indexOf('}'))).not.toContain('padding-right');
  });

  /**
   * A title attribute is not a label — it never appears on a touch device, which
   * is the case where this button was being mistaken for something else.
   */
  it('says in words what it does and which layout is on', () => {
    expect(DECK).toContain('Action layout<span className={styles.deckGearNow}>');
    expect(DECK).toContain("{layout === 'guided' ? 'Guided next step' : 'One primary + actions'}");
    expect(DECK).not.toContain('title="Switch layout"');
    expect(LEADS_CSS).toContain('.deckGearNow');
  });
});

/**
 * "(edit)" appeared beside a person's name on three pages and meant something
 * different on each. On the job page it opens the job's own details; one link
 * to its right, "Client profile" opens a different record entirely.
 */
describe('an edit link names what it edits', () => {
  it('says which noun on every page that has one', () => {
    expect(LEAD_PAGE).toContain('Edit lead');
    expect(JOB_PAGE).toContain('Edit job');
    expect(CLIENT_PAGE).toContain('Edit client');
  });

  it('leaves no bare "(edit)" beside a name', () => {
    for (const [name, source] of [['lead', LEAD_PAGE], ['job', JOB_PAGE], ['client', CLIENT_PAGE]] as const) {
      const links = source.match(/className="job-title-edit-link"[\s\S]{0,80}?</g) ?? [];
      expect(links.length, name).toBeGreaterThan(0);
      for (const link of links) expect(link, name).not.toContain('(edit)');
    }
  });

  /** The client page had no edit link at all — the page holding the most about
   *  a person was the one where changing it meant hunting for the form. */
  it('points the client link at a panel that exists', () => {
    expect(CLIENT_PAGE).toContain('href="#client-profile"');
    expect(CLIENT_PAGE).toContain('id="client-profile"');
  });
});
