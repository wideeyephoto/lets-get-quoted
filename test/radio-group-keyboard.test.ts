import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { nextRadioValue, radioTabIndex } from '@/components/use-radio-group';

/**
 * Eight places render `role="radiogroup"` around `role="radio"` buttons, and on
 * 2026-08-20 not one handled a key press. The markup promised something the
 * component did not do: a screen reader announces "radio, not checked, 1 of 2",
 * the user presses the arrow key that implies, and nothing happens.
 *
 * Two of the eight are how somebody chooses to pay a contractor.
 */

const PAY_MODES = ['full', 'plan'] as const;
const THREE = ['a', 'b', 'c'] as const;

describe('arrow keys move the selection, because in a radio group that is the interaction', () => {
  it('goes forward on Down and Right', () => {
    expect(nextRadioValue(PAY_MODES, 'full', 'ArrowDown')).toBe('plan');
    expect(nextRadioValue(PAY_MODES, 'full', 'ArrowRight')).toBe('plan');
  });

  it('goes back on Up and Left', () => {
    expect(nextRadioValue(PAY_MODES, 'plan', 'ArrowUp')).toBe('full');
    expect(nextRadioValue(PAY_MODES, 'plan', 'ArrowLeft')).toBe('full');
  });

  it('wraps in both directions', () => {
    // Backwards off the front is the one that breaks: -1 % 2 is -1 in JS, so a
    // naive modulo indexes off the front of the array instead of onto its end.
    expect(nextRadioValue(PAY_MODES, 'full', 'ArrowUp')).toBe('plan');
    expect(nextRadioValue(PAY_MODES, 'plan', 'ArrowDown')).toBe('full');
    expect(nextRadioValue(THREE, 'a', 'ArrowLeft')).toBe('c');
    expect(nextRadioValue(THREE, 'c', 'ArrowRight')).toBe('a');
  });

  it('jumps to the ends on Home and End', () => {
    expect(nextRadioValue(THREE, 'b', 'Home')).toBe('a');
    expect(nextRadioValue(THREE, 'b', 'End')).toBe('c');
  });

  it('selects without moving on Space', () => {
    expect(nextRadioValue(PAY_MODES, 'plan', ' ')).toBe('plan');
  });

  it('ignores Enter, so a button does not select twice', () => {
    // <button> already fires click on Enter, which selects. Handling it here
    // too would call onChange twice for one key press.
    expect(nextRadioValue(PAY_MODES, 'full', 'Enter')).toBeNull();
  });

  it('ignores every key it does not own', () => {
    // The hook calls preventDefault only when this returns non-null. Returning
    // a value for Tab would trap keyboard focus inside the group.
    for (const key of ['Tab', 'Escape', 'a', 'PageDown', 'Shift']) {
      expect(nextRadioValue(PAY_MODES, 'full', key), key).toBeNull();
    }
  });

  it('returns null for an option that is not in the group', () => {
    // Guards the guard: indexOf would be -1, and an unguarded modulo on that
    // silently returns the wrong option rather than nothing.
    expect(nextRadioValue(PAY_MODES, 'nonsense' as 'full', 'ArrowDown')).toBeNull();
  });
});

describe('exactly one option is in the tab order', () => {
  it('puts the checked one there', () => {
    expect(radioTabIndex(PAY_MODES, 'plan', 'plan')).toBe(0);
    expect(radioTabIndex(PAY_MODES, 'plan', 'full')).toBe(-1);
  });

  it('falls back to the first when nothing is checked', () => {
    // Several of these groups pre-select nothing on purpose -- a default on a
    // payment choice is a thumb on the scale -- and a group nobody has touched
    // must still be reachable by Tab.
    expect(radioTabIndex(PAY_MODES, null, 'full')).toBe(0);
    expect(radioTabIndex(PAY_MODES, null, 'plan')).toBe(-1);
  });

  it('never puts two options in the tab order at once', () => {
    // The whole point of roving tabindex. Plain buttons are all tabbable, which
    // is the behavior this replaces: Tab walked through every option instead of
    // moving into the group once.
    for (const value of [null, 'full', 'plan'] as const) {
      const tabbable = PAY_MODES.filter((option) => radioTabIndex(PAY_MODES, value, option) === 0);
      expect(tabbable, String(value)).toHaveLength(1);
    }
  });
});

describe('the pay choice actually uses it', () => {
  const PAY_CHOICE = readFileSync(
    join(process.cwd(), 'src/app/client/jobs/[token]/PayChoice.tsx'), 'utf8');

  it('spreads the option props rather than hand-rolling the attributes', () => {
    expect(PAY_CHOICE).toContain('useRadioGroup');
    expect(PAY_CHOICE).toContain("getOptionProps('full')");
    expect(PAY_CHOICE).toContain("getOptionProps('plan')");
  });

  it('no longer sets role or aria-checked by hand', () => {
    // Both now come from the hook. A leftover hand-written `role="radio"` would
    // sit alongside the spread and win or lose depending on order.
    expect(PAY_CHOICE).not.toContain('role="radio"');
    expect(PAY_CHOICE).not.toContain('aria-checked={payMode');
  });

  it('still names the group for a screen reader', () => {
    expect(PAY_CHOICE).toContain('role="radiogroup"');
    expect(PAY_CHOICE).toContain('aria-label="How you would like to pay"');
  });
});

describe('every payment radio group uses the hook, not hand-rolled attributes', () => {
  /**
   * The three groups where the choice is about money: how a homeowner pays,
   * how they sign the quote that commits them to it, and which of two amounts
   * a contractor records the client as having agreed to.
   *
   * Asserted as a set rather than one by one, so a fourth payment radiogroup
   * added later without keyboard support fails here rather than shipping.
   */
  const FILES = [
    'src/app/client/jobs/[token]/PayChoice.tsx',
    'src/app/client/jobs/[token]/QuoteAcceptance.tsx',
    'src/app/dashboard/jobs/[id]/AcceptPlanCard.tsx',
  ] as const;

  for (const file of FILES) {
    const source = readFileSync(join(process.cwd(), file), 'utf8');

    it(`${file.split('/').pop()} imports the hook`, () => {
      expect(source).toContain('use-radio-group');
    });

    it(`${file.split('/').pop()} sets no role or aria-checked by hand`, () => {
      // A leftover hand-written role="radio" would sit alongside the spread and
      // win or lose depending on attribute order -- which is exactly the kind of
      // thing that looks fine in a diff.
      expect(source).not.toContain('role="radio"');
      expect(source).not.toMatch(/aria-checked=\{/);
    });

    it(`${file.split('/').pop()} still declares the group itself`, () => {
      // The hook supplies the options' roles, never the container's. Losing this
      // would leave correctly-behaving buttons that announce as nothing.
      expect(source).toContain('role="radiogroup"');
    });
  }
});
