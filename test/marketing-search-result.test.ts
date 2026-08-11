import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * WHAT THE SEARCH RESULT ACTUALLY SAYS.
 *
 * Six feature pages had titles and descriptions long enough to be cut, and a
 * cut result is worse than a short one: Google truncates mid-phrase, so
 * "Quick Stops for Contractors: Paid Priority Visits…" lost the words somebody
 * would have searched for.
 *
 * THE SUFFIX IS THE PART THAT WAS EASY TO FORGET. The root layout's title
 * template is "%s · Let's Get Quoted", so every page title is 19 characters
 * longer than it looks in the file. A 56-character title is a 75-character
 * result. Every check here measures the rendered length.
 */

const TITLE_SUFFIX = " · Let's Get Quoted";

/** Roughly where Google stops. Pixel width is the real rule; character counts
 *  are the usable approximation, and these are the conservative ones. */
const MAX_TITLE = 60;
const MAX_DESCRIPTION = 160;

const PAGES = [
  'website-builder',
  'ai-intake',
  'quotes',
  'scheduling',
  'client-portal',
  'quick-stops',
  'crew',
  'recurring',
  'payments',
  'cash-flow',
  'reviews',
  'back-office',
];

type Meta = { title: string; description: string };

function meta(slug: string): Meta {
  const source = readFileSync(join(process.cwd(), 'src', 'app', 'features', slug, 'page.tsx'), 'utf8');
  // The page's own metadata block only — openGraph and twitter carry their own
  // title/description and have different limits.
  const block = source.slice(source.indexOf('export const metadata'), source.indexOf('alternates:'));
  const title = /title:\s*'([^']+)'/.exec(block)?.[1] ?? /title:\s*"([^"]+)"/.exec(block)?.[1] ?? '';
  const description = /description:\s*\n?\s*'([^']+)'/.exec(block)?.[1] ?? '';
  return { title, description };
}

describe('every feature page fits in a search result', () => {
  it.each(PAGES)('/features/%s has a title that is not cut', (slug) => {
    const { title } = meta(slug);
    expect(title, `${slug} has no title`).toBeTruthy();
    const rendered = title.length + TITLE_SUFFIX.length;
    expect(rendered, `"${title}${TITLE_SUFFIX}" is ${rendered} chars`).toBeLessThanOrEqual(MAX_TITLE);
  });

  it.each(PAGES)('/features/%s has a description that is not cut', (slug) => {
    const { description } = meta(slug);
    expect(description, `${slug} has no description`).toBeTruthy();
    expect(description.length, `${slug}: ${description.length} chars`).toBeLessThanOrEqual(MAX_DESCRIPTION);
  });

  it('never repeats the brand inside the title, since the template adds it', () => {
    // "Quick Stops | Let's Get Quoted" once rendered as
    // "Quick Stops | Let's Get Quoted · Let's Get Quoted".
    for (const slug of PAGES) {
      expect(meta(slug).title, slug).not.toMatch(/Let['’]s Get Quoted/i);
    }
  });

  it('still says what each page is for, in the first few words', () => {
    // A short title that says nothing is not an improvement on a long one.
    for (const slug of PAGES) {
      const { title } = meta(slug);
      expect(title.split(/\s+/).length, `${slug}: "${title}"`).toBeGreaterThanOrEqual(3);
    }
  });

  it('leaves the social cards alone — they are a different medium', () => {
    // og/twitter titles are read on a card, not in a results list, and the
    // brand sits beside them rather than being appended. They are deliberately
    // longer and more conversational; this test exists so a future tidy-up
    // does not "fix" them to match the rules above.
    const source = readFileSync(join(process.cwd(), 'src', 'app', 'features', 'quick-stops', 'page.tsx'), 'utf8');
    expect(source).toContain("title: 'Get paid to fit nearby customers into today’s route.'");
  });
});
