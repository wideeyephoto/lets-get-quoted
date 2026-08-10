import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PHONE_EXAMPLE, ISSUE_EXAMPLE, addressExample, firstTown, jobExample } from '@/lib/booking-examples';

/**
 * A booking page's whole job is convincing somebody they reached the right
 * business. Placeholders belonging to a DIFFERENT business are the fastest way
 * to lose that — a customer cannot tell a stale example from a wrong company.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

describe('the town read out of a service area', () => {
  it('takes the first place named', () => {
    expect(firstTown("Lee's Summit, MO")).toBe("Lee's Summit");
    expect(firstTown("Lee's Summit, Blue Springs, Independence")).toBe("Lee's Summit");
    expect(firstTown('Royal Oak and Ferndale')).toBe('Royal Oak');
  });

  /**
   * Refused rather than guessed at. "123 Main St, within 30 miles of downtown"
   * is worse than no town at all, and every one of these is a real shape an
   * owner types into a free-text field.
   */
  it('refuses anything that is a description of an area rather than its name', () => {
    expect(firstTown('Greater Kansas City')).toBeNull();
    expect(firstTown('within 30 miles of downtown')).toBeNull();
    expect(firstTown('Serving the whole metro')).toBeNull();
    expect(firstTown('30 mile radius')).toBeNull();
  });

  it('and copes with nothing at all', () => {
    expect(firstTown('')).toBeNull();
    expect(firstTown(null)).toBeNull();
    expect(firstTown(undefined)).toBeNull();
    expect(firstTown('   ')).toBeNull();
  });

  it('refuses a paragraph', () => {
    expect(firstTown('the entire tri-county region including every suburb north of the river')).toBeNull();
  });
});

describe('the address example', () => {
  it('is in the contractor’s own town when we know it', () => {
    expect(addressExample("Lee's Summit, MO")).toBe("123 Main St, Lee's Summit");
  });

  it('and carries no town at all rather than somebody else’s', () => {
    expect(addressExample('Greater Kansas City')).toBe('123 Main St');
    expect(addressExample(null)).toBe('123 Main St');
  });

  it('never names a state the contractor did not', () => {
    expect(addressExample("Lee's Summit, MO")).not.toContain('MI');
  });
});

describe('the job example', () => {
  it('comes from the contractor’s own price book', () => {
    expect(jobExample(['Lawn mowing', 'Hedge trimming'])).toBe('Looking for a quote on lawn mowing.');
  });

  it('describes the shape of an answer when there is no price book to read', () => {
    // Rather than inventing a trade. A placeholder models an ANSWER — a
    // restatement of the label tells somebody nothing about how much to write.
    expect(jobExample([])).toContain('what needs doing');
    expect(jobExample([])).not.toMatch(/roof|faucet|lawn/i);
  });

  it('ignores blank entries rather than producing "a quote on ."', () => {
    expect(jobExample(['', '   ', 'Gutter clearing'])).toBe('Looking for a quote on gutter clearing.');
  });
});

describe('the phone example', () => {
  /**
   * An area code is a claim about where the business is, and the page already
   * got that wrong once with a Michigan 248 on a Missouri contractor. 555-01xx
   * is the block reserved for fiction.
   */
  it('names no region', () => {
    expect(PHONE_EXAMPLE).toContain('555');
    expect(PHONE_EXAMPLE).not.toContain('248');
  });
});

/* ===========================================================================
   The literals themselves, gone from the pages that shipped them
   ======================================================================== */
describe('no page carries an example borrowed from another contractor', () => {
  const PAGES = [
    ['src', 'app', 'book', '[subdomain]', 'page.tsx'],
    ['src', 'app', 'book', '[subdomain]', 'QuickStopFlow.tsx'],
    ['src', 'app', 'book', '[subdomain]', 'InstantBookFlow.tsx'],
  ] as const;

  for (const parts of PAGES) {
    it(`${parts[parts.length - 1]} names no borrowed place, number or trade`, () => {
      const source = read(...parts);
      expect(source).not.toContain('248) 555-0199');
      expect(source).not.toContain('Royal Oak');
      expect(source).not.toContain('Maplewood');
      // The two trade-specific examples on a page served to every trade.
      expect(source).not.toMatch(/Roof looks worn/i);
      expect(source).not.toMatch(/Kitchen faucet is dripping/i);
    });
  }

  it('and the shared examples are imported rather than retyped', () => {
    const page = read('src', 'app', 'book', '[subdomain]', 'page.tsx');
    expect(page).toContain("from '@/lib/booking-examples'");
  });

  it('the issue example stays trade-neutral, because Quick Stop has no price book', () => {
    expect(ISSUE_EXAMPLE).not.toMatch(/roof|faucet|lawn|drain|furnace/i);
  });
});
