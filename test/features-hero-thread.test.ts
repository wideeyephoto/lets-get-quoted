import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HERO_THREAD, HERO_THREAD_CLIENT, HERO_THREAD_JOB } from '@/app/features/hero-thread';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
const PAGE = read('src', 'app', 'features', 'page.tsx');
const THREAD = read('src', 'app', 'features', 'hero-thread.ts');
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

  it('renders the thread instead', () => {
    expect(PAGE).toContain('hero-thread');
    expect(PAGE).toContain('HERO_THREAD.map');
  });

  /**
   * The whole reason lib/sms-templates exists. A marketing page that retypes a
   * message it claims to show is the exact failure that module was extracted to
   * prevent, and it had already happened twice inside the app.
   */
  it('builds every outgoing message with the real sender', () => {
    expect(THREAD).toMatch(/from '@\/lib\/sms-templates'/);

    // Every `out` row's body is a call, not a string. A quoted body would mean
    // somebody typed a customer message into a marketing page.
    // The array, not the type union above it — `body: string` in the
    // declaration is a type, and reading it as data made this pass on a lie.
    const rows = THREAD.slice(THREAD.indexOf('export const HERO_THREAD'));
    const outBodies = [...rows.matchAll(/kind: 'out',[\s\S]{0,200}?body:\s*([^\n]+)/g)].map((m) => m[1].trim());
    expect(outBodies.length, 'no `out` rows found — has the shape changed?').toBeGreaterThan(1);
    for (const body of outBodies) {
      expect(body, `an outgoing body is written inline: ${body}`).not.toMatch(/^['"`]/);
      expect(body).toMatch(/Text\(\{$|Text\($/);
    }
  });

  it('and those messages arrive with the sample data filled in', () => {
    const outgoing = HERO_THREAD.filter((row) => row.kind === 'out');
    expect(outgoing.length).toBeGreaterThan(1);
    for (const row of outgoing) {
      if (row.kind !== 'out') continue;
      expect(row.body.length).toBeGreaterThan(40);
      expect(row.body, `${row.id} has an unresolved placeholder`).not.toMatch(/\$\{|undefined|null/);
      // The line that keeps the number deliverable, visible in the hero.
      expect(row.body, `${row.id} shows a customer text with no opt-out`).toMatch(/Reply STOP to opt out/);
    }
  });

  it('names the same job and customer in the panel head as in the thread', () => {
    expect(PAGE).toContain('HERO_THREAD_JOB');
    expect(PAGE).toContain('HERO_THREAD_CLIENT');
    expect(HERO_THREAD_JOB).toMatch(/^J-\d+$/);
    expect(HERO_THREAD_CLIENT.length).toBeGreaterThan(3);
  });

  /**
   * Which way a message travels is carried by which side of the thread it sits
   * on, and a side cannot be read aloud.
   */
  it('says out loud who each message is from', () => {
    expect(PAGE).toContain('sr-only');
    expect(PAGE).toMatch(/Sent to \$\{HERO_THREAD_FIRST\}/);
    expect(PAGE).toMatch(/From \$\{HERO_THREAD_FIRST\}/);
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
