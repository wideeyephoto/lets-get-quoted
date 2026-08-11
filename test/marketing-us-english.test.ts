import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ONE DIALECT, AND IT IS THE ONE THE CUSTOMERS SPEAK.
 *
 * The product is sold to US contractors, prices in dollars, quotes ZIP codes
 * and says "labor" everywhere — and then said "enquiries", "colours" and
 * "instalments". Individually invisible; together they read as a page written
 * somewhere else, which is exactly the wrong note on a page asking somebody to
 * trust you with their customers' card payments.
 *
 * This guards the whole app rather than the marketing pages alone, because the
 * spellings arrived in a payment-plan panel and a scheduling legend, not in a
 * headline. Code comments count too: they are where the next writer looks to
 * see what the house style is.
 */

const BRITISH: { pattern: RegExp; instead: string }[] = [
  { pattern: /\benquir(y|ies|ing|e|ed)\b/i, instead: 'inquiry / inquiries' },
  { pattern: /\binstalments?\b/i, instead: 'installment(s)' },
  { pattern: /\bcolours?\b/i, instead: 'color(s)' },
  { pattern: /\bbehaviours?\b/i, instead: 'behavior(s)' },
  /* Deliberately NOT checked: cancel/cancelled.
     "cancellation" is standard US English with the double L, so half of any
     rule here would be wrong. And "cancelled" is a stored value — the
     `payment_cancelled` job-feed kind is written into rows that already exist —
     so it is an identifier, not prose, and renaming it would orphan history for
     a spelling nobody reads. */
  { pattern: /\bcent(re|res)\b/i, instead: 'center(s)' },
  { pattern: /\bfavourites?\b/i, instead: 'favorite(s)' },
  { pattern: /\bprioritis(e|ed|ing|ation)\b/i, instead: 'prioritize' },
  { pattern: /\bpersonalis(e|ed|ing|ation)\b/i, instead: 'personalize' },
  { pattern: /\bcustomis(e|ed|ing|ation)\b/i, instead: 'customize' },
  { pattern: /\borganis(e|ed|ing|ation)\b/i, instead: 'organize' },
  { pattern: /\brecognis(e|ed|ing)\b/i, instead: 'recognize' },
];

/** Every .ts/.tsx under a root, minus the places a British spelling is data. */
function sources(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        if (entry === 'node_modules' || entry === '.next') continue;
        walk(path);
        continue;
      }
      if (/\.tsx?$/.test(entry)) out.push(path);
    }
  };
  walk(root);
  return out;
}

const FILES = [...sources(join(process.cwd(), 'src', 'app')), ...sources(join(process.cwd(), 'src', 'components'))];

describe('the app is written in one dialect', () => {
  it('found files to check, so the sweep is not vacuous', () => {
    expect(FILES.length).toBeGreaterThan(200);
  });

  it.each(BRITISH)('never writes $instead the British way', ({ pattern, instead }) => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const text = readFileSync(file, 'utf8');
      text.split('\n').forEach((line, index) => {
        if (pattern.test(line)) offenders.push(`${file.replace(process.cwd(), '.')}:${index + 1}  ${line.trim().slice(0, 90)}`);
      });
    }
    expect(offenders, `use ${instead}:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('still says the American words it should', () => {
    // A sanity check on the sweep: if these vanished, something over-corrected.
    const payments = readFileSync(join(process.cwd(), 'src', 'app', 'features', 'payments', 'page.tsx'), 'utf8');
    expect(payments).toContain('installments');
    expect(payments).toMatch(/\blabor\b|\bStripe\b/);
  });
});
