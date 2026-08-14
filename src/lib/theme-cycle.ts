import { AVAILABLE_TEMPLATES } from '@/lib/templates/types';
import { COLOR_SCHEMES } from '@/lib/site-content';

/**
 * The /features/website-builder hero, showing the theme selector working.
 *
 * WHY IT IS A MODULE. Same reason as lib/intake-simulator: what plays in the
 * hero is a sequence on a clock, and a clock is the one thing you cannot check
 * by looking at a rendered frame. Here it is a pure function of a step index,
 * so the whole loop can be asserted — that every real template appears, that
 * the colors a step claims are the colors that template actually has, that it
 * returns to the beginning.
 *
 * NOTHING HERE IS INVENTED. AVAILABLE_TEMPLATES and COLOR_SCHEMES are the same
 * modules the dashboard builder and the /themes routes read. Add a template to
 * the app and it joins this loop on its own — which is the whole reason the
 * hero is built rather than screenshotted. A screenshot of the theme picker is
 * wrong the first time somebody adds a ninth theme, and nothing tells you.
 */

export type ThemeCycleStep = {
  readonly templateId: string;
  readonly templateName: string;
  /** The monogram on the tile. ThemeIcon falls back to the first two letters. */
  readonly abbr: string | undefined;
  readonly accent: string;
  readonly fontVar: string;
  /** '' is the picker's own "Theme default" swatch, which is a real choice. */
  readonly schemeKey: string;
  readonly schemeLabel: string;
  /** Preview surface colors for this step. */
  readonly bg: string;
  readonly surface: string;
  readonly ink: string;
  readonly muted: string;
  readonly line: string;
};

/**
 * The picker's own default, which is not one of COLOR_SCHEMES.
 *
 * Selecting nothing is a state the real control has — the first swatch, labelled
 * "Theme default" — so the loop has to be able to show it. These values are the
 * dark surface a template renders on before any scheme is applied.
 */
const THEME_DEFAULT = {
  key: '',
  label: 'Theme default',
  bg: '#0f1319',
  surface: '#171c24',
  ink: '#eef2f7',
  muted: '#94a1b2',
  line: '#252c37',
} as const;

const SCHEME_ROTATION = [THEME_DEFAULT, ...COLOR_SCHEMES.map((scheme) => ({
  key: scheme.key,
  // The stored label is "Midnight — near-black + soft blue": a name plus its
  // own description. The control shows only the name, and so does this.
  label: scheme.label.split('—')[0].trim(),
  bg: scheme.bg,
  surface: scheme.surface,
  ink: scheme.ink,
  muted: scheme.muted,
  line: scheme.line,
}))];

/** Every scheme swatch the control draws, in the order it draws them. */
export const THEME_CYCLE_SCHEMES = SCHEME_ROTATION.map(({ key, label }) => ({ key, label }));

/**
 * One step per template, with a scheme attached.
 *
 * The scheme advances every SECOND template rather than on every step. Two rows
 * changing in lockstep reads as one animation with a wide selection; staggered,
 * it reads as somebody trying combinations, which is what the control is for.
 */
const SCHEME_EVERY = 2;

export const THEME_CYCLE_STEPS: readonly ThemeCycleStep[] = AVAILABLE_TEMPLATES.map((template, index) => {
  const scheme = SCHEME_ROTATION[Math.floor(index / SCHEME_EVERY) % SCHEME_ROTATION.length];
  return {
    templateId: template.id,
    templateName: template.name,
    abbr: template.abbr,
    // The template's OWN accent, off the real config, so a tile and the preview
    // beside it can never disagree about what color this theme is.
    accent: template.accent,
    fontVar: template.fontVar,
    schemeKey: scheme.key,
    schemeLabel: scheme.label,
    bg: scheme.bg,
    surface: scheme.surface,
    ink: scheme.ink,
    muted: scheme.muted,
    line: scheme.line,
  };
});

/**
 * How long each theme holds.
 *
 * Long enough to read the name on the tile and see the preview settle, short
 * enough that all eight are seen by somebody who scrolls past at a normal pace.
 */
export const DWELL_MS = 2400;

export const CYCLE_MS = DWELL_MS * THEME_CYCLE_STEPS.length;

/** Which step is showing at `elapsed`, wrapping forever. */
export function themeCycleAt(elapsed: number): { index: number; step: ThemeCycleStep } {
  const at = Math.max(0, elapsed) % CYCLE_MS;
  const index = Math.floor(at / DWELL_MS) % THEME_CYCLE_STEPS.length;
  return { index, step: THEME_CYCLE_STEPS[index] };
}
