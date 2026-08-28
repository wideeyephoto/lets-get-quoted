import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HERO_EVENTS,
  HERO_SMS,
  HERO_STATUS,
  HERO_SUMMARY,
  HERO_THREAD_CLIENT,
  HERO_THREAD_JOB,
  WORKFLOW_STAGES,
} from '@/app/features/hero-thread';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const PAGE = read('src', 'app', 'features', 'page.tsx');
const THREAD = read('src', 'app', 'features', 'hero-thread.ts');
const SIM = read('src', 'app', 'features', 'CinematicMessageSimulation.tsx');
const SIM_CSS = read('src', 'app', 'features', 'cinematic-message-simulation.module.css');
const CSS = read('src', 'components', 'flagship', 'flagship.module.css');

/**
 * The hero on /features shows one Job Record moving through its complete 5-stage lifecycle.
 */
describe('the hero Job Record workflow simulation', () => {
  it('defines the 5 connected workflow stages in order', () => {
    expect(WORKFLOW_STAGES.length).toBe(5);
    expect(WORKFLOW_STAGES.map((s) => s.label)).toEqual([
      'Request received',
      'Qualified',
      'Quote approved',
      'Tue 9–11 booked',
      '$2,125 deposit paid',
    ]);
  });

  it('renders the simulation component inside the two-column hero', () => {
    expect(PAGE).toContain('<CinematicMessageSimulation />');
    expect(SIM).toContain('hero-thread hero-thread-sim');
    expect(SIM).toContain('styles.jobCard');
  });

  it('builds every outgoing message with the real sms sender', () => {
    expect(THREAD).toMatch(/from '@\/lib\/sms-templates'/);
    expect(HERO_SMS.length).toBeGreaterThanOrEqual(1);
    for (const row of HERO_SMS) {
      expect(row.body.length).toBeGreaterThan(30);
      expect(row.body, `${row.id} has an unresolved placeholder`).not.toMatch(/\$\{|undefined|null/);
    }
  });

  it('names the same job and customer consistently', () => {
    expect(SIM).toContain('HERO_THREAD_JOB');
    expect(HERO_THREAD_JOB).toMatch(/^J-\d+$/);
    expect(HERO_THREAD_CLIENT.length).toBeGreaterThan(3);
    expect(HERO_SUMMARY).toContain(HERO_THREAD_CLIENT);
  });

  it('progresses status cleanly to Booked & Paid', () => {
    expect(HERO_STATUS.map((s) => s.label)).toEqual([
      'Quote sent',
      'Quote approved',
      'Tue 9–11 booked',
      'Booked & Paid',
    ]);
    expect(HERO_EVENTS.length).toBe(3);
  });
});

/**
 * Animation and accessibility controls
 */
describe('how the simulation behaves', () => {
  it('starts on viewport entry rather than on load', () => {
    expect(SIM).toContain('IntersectionObserver');
    expect(SIM).toContain('threshold: [0, 0.5]');
    expect(SIM).toMatch(/intersectionRatio >= 0\.5/);
  });

  it('does not loop infinitely and plays once per view', () => {
    expect(SIM).toContain('if (seen && !begun)');
    expect(SIM).toContain('begun = true;');
  });

  it('handles visibility change and timers cleanly', () => {
    expect(SIM).toContain("addEventListener('visibilitychange'");
    expect(SIM).toContain('performance.now()');
  });

  it('answers reduced motion and mobile viewports with the finished panel', () => {
    expect(SIM).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(SIM).toContain('setFrame(FINAL)');
  });

  it('is hidden from screen readers, with one comprehensive summary', () => {
    expect(SIM).toContain('aria-hidden="true"');
    expect(SIM).toContain('<p className="sr-only">{HERO_SUMMARY}</p>');
    expect(HERO_SUMMARY.length).toBeGreaterThan(80);
  });
});

/**
 * Two-column layout and mobile stacking rules in CSS
 */
describe('the two-column hero layout', () => {
  it('renders index-hero-beside on the features page', () => {
    expect(PAGE).toContain('index-hero index-hero-beside');
    expect(CSS).toContain('.index-hero-beside');
  });

  it('undoes every explicit placement when it stacks on mobile', () => {
    const stacked = CSS.slice(CSS.indexOf('@media (max-width: 1040px)'));
    const block = stacked.slice(0, stacked.indexOf('\n}\n\n@media'));
    for (const child of ['.eyebrow', 'h1', 'p:not(.eyebrow)', 'p.index-hero-fee', '.hero-actions', '.hero-thread']) {
      expect(block, `${child} keeps its two-column placement when stacked`).toContain(
        `.index-hero-beside > ${child})`,
      );
    }
    expect(block).toContain('grid-row: auto');
  });
});
