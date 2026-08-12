'use client';

import { THEME_CHOICES } from '@/lib/theme';
import { ThemeGlyph } from './theme-glyphs';
import { useTheme } from './use-theme';

// Appearance, in the account menu: Auto / Light / Dark.
//
// It used to be a two-position switch, and a switch was the honest shape while
// there were two answers. There are three now — "match my device" is a real
// third state, not light-with-an-asterisk — and a switch cannot show three. A
// radio group can, and it also says which one is CURRENT rather than only which
// one is next, which the floating switch on a phone deliberately does not.
//
// Three radios, not a <select>: the whole point of a settings row you meet by
// accident is that it shows you the options exist.
//
// role="radiogroup" rather than a fieldset of inputs because this lives inside
// a menu (role="menuitem" wrapper) where a form control's own label and focus
// behavior would fight the menu's keyboard handling.

export default function ThemeToggle() {
  const { choice, setChoice } = useTheme();

  return (
    <div className="theme-choice" role="radiogroup" aria-label="Appearance">
      {THEME_CHOICES.map((option) => {
        const on = choice === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            className={`theme-choice-opt${on ? ' is-on' : ''}`}
            data-choice={option.value}
            // Named explicitly rather than by the word beside the glyph: the
            // demo rail draws this control glyph-only to share its footer line
            // with the Stripe pill, and a radio whose only name is a `title`
            // is a radio some screen readers announce as nothing.
            aria-label={option.label}
            title={option.label}
            onClick={() => setChoice(option.value)}
          >
            <span className="theme-choice-glyph" aria-hidden="true">
              <ThemeGlyph name={option.value} />
            </span>
            <span className="theme-choice-word">{option.word}</span>
          </button>
        );
      })}
    </div>
  );
}
