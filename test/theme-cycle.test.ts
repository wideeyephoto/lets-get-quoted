import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AVAILABLE_TEMPLATES } from '@/lib/templates/types';
import { COLOR_SCHEMES } from '@/lib/site-content';
import {
  CYCLE_MS,
  DWELL_MS,
  THEME_CYCLE_SCHEMES,
  THEME_CYCLE_STEPS,
  themeCycleAt,
} from '@/lib/theme-cycle';

/**
 * The /features/website-builder hero's theme picker.
 *
 * THE POINT OF TESTING IT AT ALL. This is a marketing hero, and the usual
 * reason not to test one is that it is decoration. This one is not: it is a
 * REPLICA of a real control, and the entire argument for building it instead of
 * screenshotting it is that it cannot drift from the product. That argument is
 * only true if something checks — so what is asserted below is mostly the
 * agreement between the hero and the modules the dashboard reads.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const COMPONENT = stripJs(read('src', 'app', 'features', 'website-builder', 'HeroThemeCycler.tsx'));
const PAGE = stripJs(read('src', 'app', 'features', 'website-builder', 'page.tsx'));
const CSS = read('src', 'app', 'features', 'website-builder', 'website-builder.module.css');
const MODULE = stripJs(read('src', 'lib', 'theme-cycle.ts'));

describe('the hero cannot drift from the product', () => {
  /**
   * THE WHOLE REASON THIS IS CODE AND NOT A SCREENSHOT.
   *
   * A ninth template has to appear in the hero without anybody remembering to
   * update a marketing page. A screenshot goes stale silently; this fails.
   */
  it('shows every template the app ships, in the app\'s own order', () => {
    expect(THEME_CYCLE_STEPS).toHaveLength(AVAILABLE_TEMPLATES.length);
    expect(THEME_CYCLE_STEPS.map((step) => step.templateId)).toEqual(AVAILABLE_TEMPLATES.map((t) => t.id));
    expect(THEME_CYCLE_STEPS.map((step) => step.templateName)).toEqual(AVAILABLE_TEMPLATES.map((t) => t.name));
  });

  /* A tile and the preview beside it must never disagree about what color a
     theme is, so both read the accent off the one real config. */
  it('takes each accent and font from the real template config', () => {
    for (const template of AVAILABLE_TEMPLATES) {
      const step = THEME_CYCLE_STEPS.find((one) => one.templateId === template.id)!;
      expect(step.accent).toBe(template.accent);
      expect(step.fontVar).toBe(template.fontVar);
      expect(step.abbr).toBe(template.abbr);
    }
  });

  it('offers every real color scheme, plus the picker\'s own default', () => {
    expect(THEME_CYCLE_SCHEMES).toHaveLength(COLOR_SCHEMES.length + 1);
    expect(THEME_CYCLE_SCHEMES[0]).toEqual({ key: '', label: 'Theme default' });
    for (const scheme of COLOR_SCHEMES) {
      expect(THEME_CYCLE_SCHEMES.map((one) => one.key)).toContain(scheme.key);
    }
  });

  /* The stored label is "Midnight — near-black + soft blue": a name and its own
     description. The control shows the name, so this shows the name. */
  it('shows the scheme name rather than the whole stored label', () => {
    const midnight = THEME_CYCLE_SCHEMES.find((one) => one.key === 'midnight');
    expect(midnight?.label).toBe('Midnight');
    for (const scheme of THEME_CYCLE_SCHEMES) expect(scheme.label).not.toContain('—');
  });

  /* Every swatch the component can draw needs a rule, or a scheme added to the
     product renders as an empty box in the hero. */
  it('draws a chip for every scheme it can show', () => {
    for (const scheme of THEME_CYCLE_SCHEMES) {
      expect(CSS, scheme.key || 'default').toContain(`[data-scheme='${scheme.key || 'default'}']`);
    }
  });

  it('reads the real modules rather than restating them', () => {
    expect(MODULE).toContain("from '@/lib/templates/types'");
    expect(MODULE).toContain("from '@/lib/site-content'");
    expect(COMPONENT).toContain("from '@/app/dashboard/sites/ThemeIcon'");
  });
});

describe('the clock', () => {
  it('holds each theme for the same beat and wraps at the end', () => {
    expect(CYCLE_MS).toBe(DWELL_MS * THEME_CYCLE_STEPS.length);
    expect(themeCycleAt(0).index).toBe(0);
    expect(themeCycleAt(DWELL_MS - 1).index).toBe(0);
    expect(themeCycleAt(DWELL_MS).index).toBe(1);
    expect(themeCycleAt(CYCLE_MS - 1).index).toBe(THEME_CYCLE_STEPS.length - 1);
    expect(themeCycleAt(CYCLE_MS).index).toBe(0);
    expect(themeCycleAt(CYCLE_MS * 3 + DWELL_MS).index).toBe(1);
  });

  it('never returns an out-of-range step, including for nonsense input', () => {
    for (const at of [-1, -100000, 0, 1, CYCLE_MS * 7.5]) {
      const { index, step } = themeCycleAt(at);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(THEME_CYCLE_STEPS.length);
      expect(step).toBeDefined();
    }
  });

  /* Two rows changing in lockstep reads as one animation. Staggered, it reads
     as somebody trying combinations, which is what the control is for. */
  it('advances the scheme more slowly than the theme', () => {
    const schemes = THEME_CYCLE_STEPS.map((step) => step.schemeKey);
    const themes = THEME_CYCLE_STEPS.map((step) => step.templateId);
    expect(new Set(themes).size).toBe(themes.length);
    expect(new Set(schemes).size).toBeLessThan(themes.length);
    expect(schemes[0]).toBe(schemes[1]);
    expect(schemes[1]).not.toBe(schemes[2]);
  });
});

describe('the hero panel', () => {
  it('replaced the finished-site mock rather than sitting beside it', () => {
    expect(PAGE).toContain('<HeroThemeCycler />');
    expect(PAGE).not.toContain('styles.browser');
    expect(PAGE).not.toContain('styles.estimateRange');
  });

  /**
   * NO ExampleFrame AROUND IT, unlike the two panels lower down.
   *
   * That wrapper exists to label a DRAWING of a screen as a drawing — an
   * honesty device for Cedar Creek Roofing, who does not exist. There is
   * nothing to disclaim here: the panel is the real picker rendering the real
   * /themes routes, so a caption calling it an example would have been the one
   * inaccurate thing on it. The other two uses on this page stay.
   */
  it('carries no example caption, because there is nothing to disclaim', () => {
    expect(PAGE).toContain('demo={<HeroThemeCycler />}');
    expect(PAGE).not.toContain('The theme picker from the builder, cycling every template');
    expect(PAGE).not.toContain('Invented company, invented range. The templates');
    // Still used by the two drawn mocks further down.
    expect(PAGE).toContain('<ExampleFrame');
  });

  /* The mock's CSS went with it — except the window dots, which the picker's
     own preview bar reuses. A second identical pair is how the two drift. */
  it('left no dead rules behind, and kept the shared chrome', () => {
    for (const dead of ['.browser {', '.siteHeadline {', '.estimateRange {']) {
      expect(CSS, dead).not.toContain(dead);
    }
    expect(CSS).toContain('.dots {');
    expect(CSS).toContain('.dot {');
    expect(COMPONENT).toContain('styles.dot');
  });

  /**
   * THE PREVIEW IS THE REAL PAGE, NOT A RECOLOURED DRAWING.
   *
   * The first version of this was a hand-drawn mock tinted per theme, and it
   * was quietly dishonest: eight template names above one layout in eight color
   * schemes, when the templates differ in typography, structure and
   * photography. Recoloring is not what changing a template does. So the panel
   * loads /themes/[id] — the same route the builder's own preview uses — and
   * the thing it claims to show is the thing it shows.
   */
  it('loads the real themes route, carrying the theme, scheme and accent', () => {
    expect(COMPONENT).toContain('`/themes/${step.templateId}?scheme=');
    expect(COMPONENT).toContain('accent=');
    expect(COMPONENT).toContain('<iframe');
    // Keyed on the full query, so a step change reloads rather than leaving the
    // previous template on screen under a new name.
    expect(COMPONENT).toContain('key={previewSrc}');
    // And no trace of the drawn mock it replaced.
    expect(COMPONENT).not.toContain('previewHeadline');
    expect(COMPONENT).not.toContain('Cedar Creek Roofing');
  });

  /**
   * AN IFRAME IN A HERO, WITHOUT PAYING FOR IT AT FIRST PAINT.
   *
   * It is not in the server HTML and is not requested during load — it appears
   * the first time the panel intersects the viewport. That was the whole
   * objection to using the real route here, and this is the answer to it.
   */
  it('does not exist until the panel has been seen', () => {
    expect(COMPONENT).toContain('useState(false)');
    expect(COMPONENT).toContain('setShowFrame(true)');
    expect(COMPONENT).toContain('showFrame && box');
    expect(COMPONENT).toContain('loading="lazy"');
  });

  /* Rendered at 1280 and scaled, or every theme would show its PHONE layout in
     a 400px column — real, and useless for judging a design. */
  it('renders the desktop layout and scales it to the column', () => {
    expect(COMPONENT).toContain('FRAME_WIDTH = 1280');
    expect(COMPONENT).toContain('viewport.clientWidth / FRAME_WIDTH');
    expect(COMPONENT).toContain('viewport.clientHeight / scale');
    expect(COMPONENT).toContain('ResizeObserver');
    expect(CSS).toContain('transform-origin: top left');
  });

  /**
   * IT IS A PICTURE THAT HAPPENS TO BE RENDERED BY A BROWSER.
   *
   * Without this a keyboard user tabs off the hero into a different site's
   * navigation, and a screen reader reads out a second page.
   */
  it('is not somewhere a visitor can land', () => {
    expect(COMPONENT).toContain('tabIndex={-1}');
    expect(COMPONENT).toContain('aria-hidden="true"');
    expect(CSS).toContain('pointer-events: none');
  });

  /**
   * EIGHT THEMES CYCLING FOREVER MUST NOT BE ANNOUNCED.
   *
   * A polite live region here would read a theme name every 2.4 seconds for as
   * long as the tab is open. The sequence is hidden and one static sentence
   * describes it; the operable picker is a link away.
   */
  it('says what it is once, and hides the loop from assistive tech', () => {
    expect(COMPONENT).toContain('aria-hidden="true"');
    expect(COMPONENT).toContain('styles.srOnly');
    expect(COMPONENT).not.toContain('aria-live');
  });

  it('renders a complete first step on the server, for no-JS and reduced motion', () => {
    expect(COMPONENT).toContain('useState(0)');
    expect(COMPONENT).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    // Playing starts FALSE and is only switched on after that check passes.
    expect(COMPONENT).toContain('useState(false)');
  });

  /* A marketing page left open in a background tab has no business waking the
     compositor every 2.4 seconds forever. */
  it('stops when it cannot be seen', () => {
    expect(COMPONENT).toContain('visibilitychange');
    expect(COMPONENT).toContain('IntersectionObserver');
    expect(COMPONENT).toContain('observer.disconnect()');
    expect(COMPONENT).toContain('window.clearInterval');
  });

  /* setInterval and not requestAnimationFrame: nothing moves between steps, so
     a frame loop would be 143 wasted ticks out of every 144. */
  it('ticks on an interval rather than a frame loop', () => {
    expect(COMPONENT).toContain('setInterval');
    expect(COMPONENT).not.toContain('requestAnimationFrame');
  });
});
