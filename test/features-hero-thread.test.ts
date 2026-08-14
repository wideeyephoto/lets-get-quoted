import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HERO_DASHBOARD_EVENTS,
  HERO_SMS,
  HERO_STATUS,
  HERO_SUMMARY,
  HERO_THREAD_CLIENT,
  HERO_THREAD_JOB,
} from '@/app/features/hero-thread';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
/** WHY comments quote the copy they replaced, so they have to come out before
 *  anything asserts that the copy is gone. */
const strip = (source: string) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const PAGE = read('src', 'app', 'features', 'page.tsx');
const THREAD = read('src', 'app', 'features', 'hero-thread.ts');
const THREAD_CODE = strip(THREAD);
const SIM = read('src', 'app', 'features', 'CinematicMessageSimulation.tsx');
const SIM_CSS = read('src', 'app', 'features', 'cinematic-message-simulation.module.css');
const CSS = read('src', 'components', 'flagship', 'flagship.module.css');
const GENERATOR = read('scripts', 'generate-flagship-css.mjs');

/**
 * The hero on /features shows one job running past the reader instead of a
 * five-card strip of stage names. The strip is gone; these are the things that
 * would quietly undo the change.
 */
describe('the hero thread replaced the pipeline', () => {
  it('leaves no pipeline behind on the page', () => {
    for (const gone of ['system-stage', 'system-pipeline', 'floating-alert', 'floating-paid']) {
      expect(PAGE, `${gone} is still rendered`).not.toContain(gone);
    }
  });

  it('renders the simulation in the slot the thread used to sit in', () => {
    // .hero-thread is what PLACES the visual in the two-column hero, so the
    // wrapper keeps it; .hero-thread-sim takes the old panel's chrome off.
    expect(PAGE).toContain('<CinematicMessageSimulation />');
    expect(SIM).toContain('hero-thread hero-thread-sim');
  });

  /**
   * The whole reason lib/sms-templates exists. A marketing page that retypes a
   * message it claims to show is the exact failure that module was extracted to
   * prevent, and it had already happened twice inside the app.
   */
  it('builds every outgoing message with the real sender', () => {
    expect(THREAD).toMatch(/from '@\/lib\/sms-templates'/);

    // Every body is a call, not a string. A quoted body would mean somebody
    // typed a customer message into a marketing page.
    // The array, not the type declaration above it — `body: string` in the type
    // is a type, and reading it as data made this pass on a lie once already.
    const rows = THREAD.slice(THREAD.indexOf('export const HERO_SMS'), THREAD.indexOf('export type HeroDashboardEvent'));
    const bodies = [...rows.matchAll(/^\s{4}body:\s*(.+)$/gm)].map((m) => m[1].trim());
    expect(bodies.length, 'no messages found — has the shape changed?').toBe(HERO_SMS.length);
    for (const body of bodies) {
      expect(body, `an outgoing body is written inline: ${body}`).not.toMatch(/^['"`]/);
      expect(body).toMatch(/Text\(\{$/);
    }
  });

  it('and those messages arrive with the sample data filled in', () => {
    expect(HERO_SMS.length).toBeGreaterThan(1);
    for (const row of HERO_SMS) {
      expect(row.body.length).toBeGreaterThan(40);
      expect(row.body, `${row.id} has an unresolved placeholder`).not.toMatch(/\$\{|undefined|null/);
      // The line that keeps the number deliverable, visible in the hero.
      expect(row.body, `${row.id} shows a customer text with no opt-out`).toMatch(/Reply STOP to opt out/);
    }
  });

  it('names the same job and customer everywhere the panel says them', () => {
    expect(SIM).toContain('HERO_THREAD_JOB');
    expect(HERO_THREAD_JOB).toMatch(/^J-\d+$/);
    expect(HERO_THREAD_CLIENT.length).toBeGreaterThan(3);
    expect(HERO_SUMMARY).toContain(HERO_THREAD_CLIENT);
  });
});

/**
 * THE ONE THING THIS PANEL MUST NOT SAY.
 *
 * The thread it replaced had the customer replying "Approved — Tuesday morning
 * works for us." by text. Nothing in the product works that way: the homeowner
 * accepts the quote and picks a slot in their own dashboard, and the
 * contractor's software watches that happen. A blue bubble saying otherwise
 * taught the wrong model of the single mechanism this page exists to explain.
 */
describe('what is an SMS and what is not', () => {
  it('has no inbound message at all', () => {
    expect(THREAD_CODE).not.toContain('Approved — Tuesday morning works');
    expect(THREAD_CODE).not.toMatch(/kind: 'in'/);
    // And nothing draws one: one direction means one alignment.
    expect(SIM_CSS).not.toMatch(/align-items:\s*flex-start/);
  });

  it('never fakes the customer typing', () => {
    // A typing indicator over a thread whose only participant is the software
    // is an animation that says a person is about to reply. Nobody replies.
    expect(SIM).not.toMatch(/typing|isTyping|dots/i);
    expect(SIM_CSS).not.toMatch(/typing/i);
  });

  it('draws dashboard activity outside the message list, and removes it', () => {
    // Absolutely positioned over the thread area: a card that took a row in the
    // list would BE a message, whatever its color.
    expect(SIM_CSS).toMatch(/\.sim \.cardWrap \{[^}]*position: absolute/);
    // Rendered only while the frame says so — nothing is left behind.
    expect(SIM).toContain('{card ? (');
    // And it says where it happened, every time.
    expect(SIM).toContain('Customer dashboard');
  });

  /**
   * The caption under the panel said this in a sentence and has been removed
   * along with the rest of that footer. So the CARD's own label is now the only
   * thing on the panel that names the surface a dashboard event happened on —
   * which makes it the one piece of this that cannot quietly go next.
   */
  it('says which shape is which, on every card that is not a text', () => {
    const label = strip(SIM).slice(strip(SIM).indexOf('styles.cardLabel'));
    expect(label.slice(0, label.indexOf('</span>'))).toContain('Customer dashboard');
    // And it is inside the card, so it cannot be rendered without one.
    expect(strip(SIM).indexOf('{card ? (')).toBeLessThan(strip(SIM).indexOf('styles.cardLabel'));
  });

  it('leaves the header changed after each card, permanently', () => {
    // The card is the event; the pill is the record. A card that disappeared
    // without changing anything behind it would be decoration.
    expect(HERO_STATUS.map((s) => s.label)).toEqual(['Quote sent', 'Tue 9–11', 'Booked']);
    for (const [index, event] of HERO_DASHBOARD_EVENTS.entries()) {
      const next = HERO_STATUS[index + 1];
      expect(next, `no status follows ${event.id}`).toBeTruthy();
      expect(next.at, `${event.id} changes the header before it has left`).toBeGreaterThanOrEqual(event.until);
    }
  });

  it('shows a link without shipping a dead one', () => {
    // lgq.co/j/1048 is an illustration. An anchor pointing at it would be a
    // click that goes nowhere, in a hero.
    expect(SIM).toContain('<span className={styles.link}>{link}</span>');
    const panel = SIM.slice(SIM.indexOf('<div className={styles.phone}>'), SIM.indexOf('</div>\n      </div>'));
    expect(panel).not.toMatch(/<a\b|<Link\b/);
  });
});

/**
 * It plays once, when somebody is looking, and stops when they are not.
 */
describe('how the simulation behaves', () => {
  it('starts on viewport entry rather than on load', () => {
    expect(SIM).toContain('IntersectionObserver');
    expect(SIM).toContain('threshold: [0, 0.5]');
    expect(SIM).toMatch(/intersectionRatio >= 0\.5/);
  });

  /**
   * IT PLAYS ONCE AND THAT IS ALL IT DOES NOW.
   *
   * The footer under the panel — the caption, the "Open the live demo" link and
   * the Replay button — was removed on request. Replay was the only control
   * this panel ever had, so what has to hold instead is that the sequence still
   * cannot restart itself: the observer starts it once (`begun`), and nothing
   * re-arms it.
   */
  it('does not loop, and no longer offers a replay', () => {
    expect(strip(SIM)).not.toMatch(/setInterval|infinite/);
    expect(strip(SIM)).not.toContain('onClick=');
    expect(strip(SIM)).not.toContain('<button');
    // start() is still reachable — the observer calls it — and still guarded by
    // a latch, which is what keeps "plays once" true without a control.
    expect(SIM).toContain('if (seen && !begun)');
    expect(SIM).toContain('begun = true;');
  });

  it('stops the clock and the CSS when nobody is watching', () => {
    expect(SIM).toContain("addEventListener('visibilitychange'");
    expect(SIM).toContain('performance.now()');
    expect(SIM_CSS).toContain('animation-play-state: paused');
  });

  it('answers reduced motion with the finished panel and no cards', () => {
    expect(SIM).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(SIM).toContain('setFrame(FINAL)');
    expect(SIM_CSS).toContain('@media (prefers-reduced-motion: reduce)');
  });

  /**
   * The visual is a scripted demo of an invented job. Narrated row by row as it
   * animates it would announce the same half-finished conversation three times,
   * so it is hidden and described once instead.
   */
  it('is hidden from screen readers, with one summary that is not', () => {
    expect(SIM).toContain('aria-hidden="true"');
    expect(SIM).toContain('<p className="sr-only">{HERO_SUMMARY}</p>');
    expect(HERO_SUMMARY).toMatch(/dashboard/i);
    expect(HERO_SUMMARY.length).toBeGreaterThan(120);
  });

  it('reserves the height the messages will need', () => {
    // Measured: the empty phone was 548px and the full one 576px, so the
    // caption and the Replay control that used to sit under it stepped down the
    // page twice a run. Both are gone, but the reserve stays: without it the
    // panel still grows mid-sequence and shoves the hero's copy column.
    expect(SIM_CSS).toMatch(/\.sim \.thread \{[\s\S]*?min-height: \d{3}px/);
  });
});

/**
 * flagship.module.css is generated. Editing it directly is silently undone by
 * the next run of the generator, so the rules have to be in TWEAKS.
 */
describe('the two-column hero', () => {
  it('lives in the generator, not only in the built sheet', () => {
    expect(GENERATOR).toContain('.index-hero-beside');
    expect(CSS).toContain('.index-hero-beside');
  });

  it('is scoped to /features and leaves the ported hero alone', () => {
    // /features-flagship renders the unmodified .index-hero and is the
    // reference this page is measured against.
    expect(PAGE).toContain('index-hero index-hero-beside');
    expect(read('src', 'app', 'features-flagship', 'page.tsx')).not.toContain('index-hero-beside');
  });

  /**
   * MEASURED, not assumed. A tidy `.index-hero-beside > *` reset is (0,2,0) and
   * loses to `> .hero-thread` at (0,3,0) and `> h1` at (0,2,1) — with it, the
   * stacked layout kept the thread in column 2 and the headline in row 3, which
   * measured as a 394px copy column beside a 551px implicit one at 1040 and a
   * 90px-wide headline at 390.
   */
  it('undoes every explicit placement when it stacks', () => {
    const stacked = CSS.slice(CSS.indexOf('@media (max-width: 1040px)'));
    const block = stacked.slice(0, stacked.indexOf('\n}\n\n@media'));
    for (const child of ['.eyebrow', 'h1', 'p:not(.eyebrow)', '.hero-actions', '.hero-thread']) {
      expect(block, `${child} keeps its two-column placement when stacked`).toContain(
        `.index-hero-beside > ${child})`,
      );
    }
    expect(block).toContain('grid-row: auto');
  });

  /**
   * The band pads 24px where every section under it pads clamp(24px, 6vw,
   * 104px). Centred that was invisible; left-aligned it is a headline that does
   * not line up with the section beneath it.
   */
  it('uses the same gutter as the sections below it', () => {
    const gutter = /\.index-hero-beside\)\s*\{[^}]*padding:[^;]*clamp\(24px,\s*6vw,\s*104px\)/;
    expect(CSS).toMatch(gutter);
  });
});
