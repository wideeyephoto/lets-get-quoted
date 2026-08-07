import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every caller of draftBlogPost has to tell it the trade.
 *
 * This is a source-shape test rather than a behavioural one, because the bug it
 * guards against is an OMISSION and omissions type-check: `trade` is optional
 * on draftBlogPost's input, deliberately, so that sites saved before the trade
 * field existed still draft something.
 *
 * The cost of that optionality is real and has already been paid once. When the
 * trade is missing the drafter falls back to inferring it from the business
 * NAME, and a plumbing company got a published article about window
 * maintenance under its own byline. The fix was applied to two of the four call
 * sites; the two a contractor actually presses — "generate a post" in the blog
 * workspace, and drafting from a seasonal topic — kept guessing for months
 * afterwards, with `trade` sitting in scope one line away in one of them.
 *
 * Nothing else notices. There is no type error, no runtime error, and the
 * output is a plausible, well-written article about the wrong trade.
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe('draftBlogPost callers', () => {
  it('all pass a trade', () => {
    const offenders: string[] = [];

    for (const file of walk('src')) {
      // The definition itself, not a call of it.
      if (file.replace(/\\/g, '/').endsWith('src/lib/blog-generate.ts')) continue;
      const source = readFileSync(file, 'utf8');
      let from = 0;
      for (;;) {
        const at = source.indexOf('draftBlogPost({', from);
        if (at === -1) break;
        from = at + 1;
        // The argument object runs to its closing brace; the calls are small
        // and flat, so the first '})' after the call is its end.
        const end = source.indexOf('})', at);
        const args = source.slice(at, end === -1 ? source.length : end);
        // `trade,` (shorthand) or `trade:` (explicit) both count.
        if (!/\btrade\s*[,:]/.test(args)) {
          offenders.push(`${file.replace(/\\/g, '/')} — draftBlogPost called without a trade`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('finds the calls at all, so a rename cannot quietly make this test vacuous', () => {
    const callers = walk('src').filter(
      (file) =>
        !file.replace(/\\/g, '/').endsWith('src/lib/blog-generate.ts') &&
        readFileSync(file, 'utf8').includes('draftBlogPost({'),
    );
    expect(callers.length).toBeGreaterThanOrEqual(4);
  });
});
