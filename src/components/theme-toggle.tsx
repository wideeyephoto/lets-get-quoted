'use client';

import { THEME_CHOICES } from '@/lib/theme';
import { ThemeGlyph } from './theme-glyphs';
import { useRadioGroup } from './use-radio-group';
import { useTheme } from './use-theme';

// Appearance, in Settings: Auto plus the complete eight-theme palette.
//
// It used to be a two-position switch, and a switch was the honest shape while
// there were two answers. There are nine now — "match my device" is a real
// state, not light-with-an-asterisk — and a switch cannot show them. A
// radio group can, and it also says which one is CURRENT rather than only which
// one is next, which the floating switch on a phone deliberately does not.
//
// Visible radios, not a <select>: the whole point of a settings row you meet by
// accident is that it shows you the options exist.
//
// These are button radios because the selected option restyles its entire
// compact segment. useRadioGroup supplies the native-radio keyboard contract:
// one tab stop, arrow movement, Home/End, and selection following focus.

const THEME_OPTION_VALUES = THEME_CHOICES.map((option) => option.value);

export default function ThemeToggle() {
  const { choice, setChoice } = useTheme();
  const { getOptionProps } = useRadioGroup({
    options: THEME_OPTION_VALUES,
    value: choice,
    onChange: setChoice,
  });

  return (
    <div className="theme-choice" role="radiogroup" aria-label="Appearance">
      {THEME_CHOICES.map((option) => {
        const on = choice === option.value;
        return (
          <button
            key={option.value}
            type="button"
            {...getOptionProps(option.value)}
            className={`theme-choice-opt${on ? ' is-on' : ''}`}
            data-choice={option.value}
            // Named explicitly rather than by the word beside the glyph: the
            // demo rail draws this control glyph-only to share its footer line
            // with the Stripe pill, and a radio whose only name is a `title`
            // is a radio some screen readers announce as nothing.
            aria-label={option.label}
            title={option.label}
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
