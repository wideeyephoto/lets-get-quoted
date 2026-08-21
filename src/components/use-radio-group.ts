'use client';

import { useCallback, useRef } from 'react';

/**
 * Keyboard behavior for a `role="radiogroup"` built out of buttons.
 *
 * WHY THIS EXISTS. Eight places in this app carry `role="radiogroup"`. Four use
 * native `<input type="radio">` and get arrow keys, roving tabindex and grouping
 * from the browser for free. The other four are built out of buttons, and on
 * 2026-08-20 not one of those handled a key press.
 *
 * All four of the button ones are money screens -- how to pay, how to sign the
 * quote that commits you, which of two amounts a client agreed to, and paying to
 * be fitted into a route sooner. That is not a coincidence: they are the screens
 * that got bespoke card layouts, and the bespoke layout is what lost the
 * keyboard. The markup promises something the component does not do: a screen
 * reader announces "radio, not checked, 1 of 2", the user presses the arrow key
 * that announcement implies, and nothing happens. Two of the eight are how
 * somebody chooses to pay a contractor — pay in full or pay over time — so the
 * gap sits directly on top of a decision about thousands of dollars.
 *
 * Native `<input type="radio">` would give all of this for free and is the right
 * answer for a plain list of choices. These are not that: each option is a card
 * carrying a heading, an amount and a sentence of terms, and the chosen one
 * restyles its whole surface. That is a button, and taking the ARIA role means
 * taking the keyboard contract that comes with it.
 *
 * WHAT THE CONTRACT IS (WAI-ARIA Authoring Practices, radio group pattern):
 *
 *   - Tab moves into the group ONCE, landing on the checked option — or on the
 *     first, when nothing is checked yet. It does not walk through every option,
 *     which is what plain buttons do and why this needs roving tabindex.
 *   - Arrow keys move between options AND select as they go. In a radio group,
 *     moving the selection IS the interaction; there is no separate confirm.
 *   - Space selects the focused option, for anyone who arrived by Tab.
 *   - Home and End jump to the first and last.
 *   - Movement wraps.
 *
 * SELECTION FOLLOWS FOCUS, deliberately, because that is what the pattern
 * specifies — and it is safe here for the same reason it is safe in a native
 * radio group: choosing an option reveals its terms, it does not submit
 * anything. Every one of these groups is followed by a separate, explicit
 * action. If a group is ever added where selection alone has a consequence,
 * this hook is the wrong tool for it.
 */

/**
 * Which option a key press moves to, or null when the key is not ours.
 *
 * Pure and exported so the contract above can be tested. This suite runs in
 * `node` with no DOM, so a hook cannot be rendered — putting the decision here
 * and leaving the hook a thin wrapper means the part that can be wrong is the
 * part that is covered.
 */
export function nextRadioValue<T extends string>(
  options: readonly T[],
  from: T,
  key: string,
): T | null {
  const index = options.indexOf(from);
  if (index === -1 || options.length === 0) return null;
  switch (key) {
    case 'ArrowDown':
    case 'ArrowRight':
      // `+ options.length` because -1 % n is negative in JS, which would index
      // off the front of the array rather than wrapping onto its end.
      return options[(index + 1) % options.length] ?? null;
    case 'ArrowUp':
    case 'ArrowLeft':
      return options[(index - 1 + options.length) % options.length] ?? null;
    case 'Home':
      return options[0] ?? null;
    case 'End':
      return options[options.length - 1] ?? null;
    case ' ':
      // Selects without moving. Enter is deliberately absent: on a <button> it
      // already fires click, and handling it here would select twice.
      return from;
    default:
      return null;
  }
}

/**
 * Roving tabindex: exactly one option is in the tab order.
 *
 * With nothing checked that is the first option — a group nobody has touched
 * must still be reachable by Tab. Several of these groups pre-select nothing on
 * purpose, because a default on a payment choice is a thumb on the scale.
 */
export function radioTabIndex<T extends string>(
  options: readonly T[],
  value: T | null,
  option: T,
): 0 | -1 {
  const tabbable = value === null ? options[0] : value;
  return tabbable === option ? 0 : -1;
}

export type RadioGroupOptionProps<T extends string> = Readonly<{
  role: 'radio';
  'aria-checked': boolean;
  tabIndex: 0 | -1;
  ref: (node: HTMLElement | null) => void;
  onClick: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}>;

export function useRadioGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  /** In the order they are rendered. Arrow keys follow this, not the DOM. */
  options: readonly T[];
  /** Null when nothing has been chosen yet, which is a real state here: several
   *  of these groups deliberately pre-select nothing, because a default on a
   *  payment choice is a thumb on the scale. */
  value: T | null;
  onChange: (next: T) => void;
}): Readonly<{ getOptionProps: (option: T) => RadioGroupOptionProps<T> }> {
  const nodes = useRef(new Map<T, HTMLElement | null>());

  const getOptionProps = useCallback((option: T): RadioGroupOptionProps<T> => ({
    role: 'radio',
    'aria-checked': value === option,
    tabIndex: radioTabIndex(options, value, option),
    ref: (node: HTMLElement | null) => {
      if (node) nodes.current.set(option, node);
      else nodes.current.delete(option);
    },
    onClick: () => onChange(option),
    onKeyDown: (event: React.KeyboardEvent) => {
      const next = nextRadioValue(options, option, event.key);
      if (next === null) return;
      // Only after deciding the key is ours. Calling it unconditionally would
      // swallow Tab and trap keyboard focus inside the group.
      event.preventDefault();
      onChange(next);
      // Focus follows selection, or the next arrow press would move from
      // wherever focus was left rather than from what is now checked.
      nodes.current.get(next)?.focus();
    },
  }), [value, options, onChange]);

  return { getOptionProps };
}
