import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DETAILS,
  HOLD_MS,
  INTAKE_BEATS,
  INTAKE_ESTIMATE,
  INTAKE_NAME,
  INTAKE_PHONE,
  INTAKE_PROJECT,
  INTAKE_QUESTIONS,
  INTAKE_SUMMARY,
  INTAKE_TURNS,
  LOOP_AT,
  PROJECT_FROM,
  PROJECT_TO,
  RESULT_AT,
  frameAt,
} from '@/lib/intake-simulator';

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

const stripJs = (source: string) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const MODULE = stripJs(read('src', 'lib', 'intake-simulator.ts'));

/* ===========================================================================
   1. The transcript
   ======================================================================== */
describe('the script', () => {
  it('opens on the project the homeowner typed', () => {
    expect(INTAKE_PROJECT).toBe('Lawn care');
  });

  it('runs the three questions and the three answers, then asks who to call back', () => {
    expect(INTAKE_TURNS.map((turn) => turn.text)).toEqual([
      'Absolutely. What would you like done — mowing, edging, cleanup, or something else?',
      'Mowing and edging.',
      'About how large is the lawn?',
      'About an acre.',
      'How often would you like the service?',
      'Every two weeks.',
      'Last thing — who should the contractor get back to?',
    ]);
    expect(INTAKE_TURNS.map((turn) => turn.role)).toEqual([
      'ai',
      'homeowner',
      'ai',
      'homeowner',
      'ai',
      'homeowner',
      'ai',
    ]);
  });

  it('lands on the range, with an en dash rather than a hyphen', () => {
    expect(INTAKE_ESTIMATE).toBe('$100–$180');
    expect(INTAKE_ESTIMATE).not.toContain('-');
  });

  it('counts the bars off the questions', () => {
    expect(INTAKE_QUESTIONS).toBe(4);
    expect(MODULE).toContain("INTAKE_TURNS.filter((turn) => turn.role === 'ai').length");
  });
});

/* ===========================================================================
   2. The clock
   ======================================================================== */
describe('the timing', () => {
  it('derives every mark from the text rather than carrying typed offsets', () => {
    const typed = INTAKE_BEATS.filter((beat) => beat.role === 'homeowner');
    const byLength = [...typed].sort((a, b) => a.text.length - b.text.length);
    const byDuration = [...typed].sort((a, b) => a.to - a.from - (b.to - b.from));
    expect(byDuration.map((beat) => beat.text)).toEqual(byLength.map((beat) => beat.text));
  });

  it('never lets one beat start before the last one finished', () => {
    let previous = PROJECT_TO;
    for (const beat of INTAKE_BEATS) {
      expect(beat.from, beat.text).toBeGreaterThan(previous);
      expect(beat.to).toBeGreaterThanOrEqual(beat.from);
      previous = beat.to;
    }
    expect(RESULT_AT).toBeGreaterThan(previous);
  });

  it('holds the estimate before looping, and loops after it', () => {
    expect(LOOP_AT - RESULT_AT).toBe(HOLD_MS);
    expect(HOLD_MS).toBeGreaterThanOrEqual(4000);
    expect(LOOP_AT).toBeGreaterThan(12_000);
    expect(LOOP_AT).toBeLessThan(30_000);
  });

  it('gives the AI dots and the homeowner a keyboard', () => {
    for (const beat of INTAKE_BEATS) {
      if (beat.role === 'ai') {
        expect(beat.to, beat.text).toBe(beat.from);
        expect(beat.thinkingFrom, beat.text).toBeLessThan(beat.from);
      } else {
        expect(beat.to, beat.text).toBeGreaterThan(beat.from);
        expect(beat.thinkingFrom, beat.text).toBeNull();
      }
    }
  });
});

/* ===========================================================================
   3. Any single frame of it
   ======================================================================== */
describe('frameAt', () => {
  it('starts on an empty field with nothing said', () => {
    const frame = frameAt(0);
    expect(frame.project).toBe('');
    expect(frame.projectPct).toBe(0);
    expect(frame.bubbles).toEqual([]);
    expect(frame.done).toBe(false);
    expect(frame.question).toBe(1);
  });

  it('types the project in, and only counts what is on screen', () => {
    const half = frameAt((PROJECT_FROM + PROJECT_TO) / 2);
    expect(half.project.length).toBeGreaterThan(0);
    expect(half.project.length).toBeLessThan(INTAKE_PROJECT.length);
    expect(INTAKE_PROJECT.startsWith(half.project)).toBe(true);
    expect(half.projectPct).toBeGreaterThan(0);
    expect(half.projectPct).toBeLessThan(100);
    expect(half.projectTyping).toBe(true);

    const settled = frameAt(PROJECT_TO + 1);
    expect(settled.project).toBe(INTAKE_PROJECT);
    expect(settled.projectPct).toBe(100);
    expect(settled.projectTyping).toBe(false);
  });

  it('never shows a partial question', () => {
    for (let at = 0; at < RESULT_AT; at += 40) {
      for (const bubble of frameAt(at).bubbles) {
        if (bubble.role !== 'ai') continue;
        expect(bubble.text, `at ${at}ms`).toBe(INTAKE_TURNS[bubble.turn].text);
        expect(bubble.typing, `at ${at}ms`).toBe(false);
      }
    }
  });

  it('types the answers forward and never backward', () => {
    for (const beat of INTAKE_BEATS) {
      if (beat.role !== 'homeowner') continue;
      let last = 0;
      for (let at = beat.from; at <= beat.to + 40; at += 25) {
        const bubble = frameAt(at).bubbles.find((one) => one.turn === beat.turn);
        expect(bubble, `${beat.text} missing at ${at}ms`).toBeDefined();
        expect(beat.text.startsWith(bubble!.text)).toBe(true);
        expect(bubble!.text.length).toBeGreaterThanOrEqual(last);
        last = bubble!.text.length;
      }
    }
  });
});

/* ===========================================================================
   4. The lead details
   ======================================================================== */
describe('the name and number', () => {
  it('asks for both, before any price exists', () => {
    expect(DETAILS.nameFrom).toBeLessThan(RESULT_AT);
    expect(DETAILS.phoneTo).toBeLessThan(RESULT_AT);
    const lastSpoken = INTAKE_BEATS.filter((beat) => beat.role === 'homeowner').at(-1)!;
    expect(DETAILS.nameFrom).toBeGreaterThanOrEqual(lastSpoken.to);
  });

  it('is reserved-for-fiction, so it can never be a real number', () => {
    expect(INTAKE_PHONE).toContain('555');
    expect(INTAKE_PHONE).toBe('(248) 555-0142');
  });

  it('does not exist before the last question lands', () => {
    expect(frameAt(0).details).toBeNull();
    expect(frameAt(DETAILS.nameFrom - 1).details).toBeNull();
    expect(frameAt(DETAILS.nameFrom + 1).details).not.toBeNull();
  });

  it('types the name, then the number, in that order', () => {
    const midName = frameAt((DETAILS.nameFrom + DETAILS.nameTo) / 2).details!;
    expect(midName.nameTyping).toBe(true);
    expect(INTAKE_NAME.startsWith(midName.name)).toBe(true);
    expect(midName.name).not.toBe(INTAKE_NAME);
    expect(midName.phone).toBe('');
    expect(midName.phoneTyping).toBe(false);

    const midPhone = frameAt((DETAILS.phoneFrom + DETAILS.phoneTo) / 2).details!;
    expect(midPhone.name).toBe(INTAKE_NAME);
    expect(midPhone.nameTyping).toBe(false);
    expect(midPhone.phoneTyping).toBe(true);
    expect(INTAKE_PHONE.startsWith(midPhone.phone)).toBe(true);
  });

  it('finishes both before the estimate is worked out', () => {
    const settled = frameAt(RESULT_AT - 1).details!;
    expect(settled.name).toBe(INTAKE_NAME);
    expect(settled.phone).toBe(INTAKE_PHONE);
    expect(settled.nameTyping).toBe(false);
    expect(settled.phoneTyping).toBe(false);
  });

  it('derives its timing from the text rather than hard-coding it', () => {
    expect(MODULE).toContain('INTAKE_NAME.length * MS_PER_CHAR');
    expect(MODULE).toContain('INTAKE_PHONE.length * MS_PER_CHAR');
  });

  it('changes the signature as it types, so the frame actually redraws', () => {
    const a = frameAt(DETAILS.nameFrom + 60).signature;
    const b = frameAt(DETAILS.nameTo - 10).signature;
    expect(a).not.toBe(b);
  });
});
