'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import ThemeIcon from '@/app/dashboard/sites/ThemeIcon';
import themeStyles from '@/app/dashboard/sites/SiteEditor.module.css';
import { AVAILABLE_TEMPLATES } from '@/lib/templates/types';
import { DWELL_MS, THEME_CYCLE_SCHEMES, THEME_CYCLE_STEPS, themeCycleAt } from '@/lib/theme-cycle';
import styles from './website-builder.module.css';

/**
 * THE HERO SHOWS THE PICKER WORKING, RATHER THAN A FINISHED SITE.
 *
 * What was here was one generated site with an instant estimate on it — a good
 * picture of the OUTPUT, and the page's claim is not about the output. It is
 * that the site is yours to change, and that changing it is instant.
 *
 * IT IS A REPLICA MADE OF THE REAL PARTS. ThemeIcon is the dashboard's own
 * component, the tiles come from AVAILABLE_TEMPLATES, the swatches from
 * COLOR_SCHEMES, and the panel on the right is /themes/[id] — the same route
 * the builder's own preview loads. Add a ninth template to the app and it joins
 * this hero on its own.
 *
 * THE PREVIEW IS A REAL PAGE, and it has to be. A hand-drawn mock recolored
 * per theme was the first version of this, and it was quietly dishonest: eight
 * template names above one layout in eight color schemes, when the templates
 * differ in typography, structure and photography. Recoloring is not what
 * changing a template does. Each /themes/[id] is a genuinely different site,
 * with its own company and its own trade, so the thing the panel claims to show
 * is the thing it shows.
 */

/**
 * The width the iframe is rendered at before being scaled down.
 *
 * A 1280px viewport, so the DESKTOP layout of each template is what appears. An
 * iframe in a ~400px column would otherwise render each theme's phone layout —
 * technically real and useless for judging a design.
 */
const FRAME_WIDTH = 1280;

export default function HeroThemeCycler() {
  // Step 0 is what the server renders, so no-JS and reduced-motion visitors get
  // a complete, honest picture of the control rather than an empty box.
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  /**
   * The iframe does not exist until the hero has been seen.
   *
   * This is the whole answer to "an iframe in a hero costs you first paint". It
   * is not in the initial HTML and is not requested during the load; it appears
   * the first time the panel intersects the viewport, which on this page is
   * immediately for a human and never for a bot measuring LCP.
   */
  const [showFrame, setShowFrame] = useState(false);
  /**
   * Both derived from the panel, not fixed.
   *
   * The width sets the scale; the HEIGHT is then whatever 1280px-wide viewport
   * fills the box once scaled, which is the part a constant got wrong — a fixed
   * 940 left 121px of empty panel below the page at 1440, and would have
   * overflowed at some other width. Measured: the frame now covers its box
   * exactly at every size.
   */
  const [box, setBox] = useState<{ scale: number; frameHeight: number } | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Still show the real page — just never change it. The objection to
      // motion is the motion, not the content.
      setShowFrame(true);
      return;
    }
    setPlaying(true);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => {
      const scale = viewport.clientWidth / FRAME_WIDTH;
      if (scale <= 0) return;
      setBox({ scale, frameHeight: Math.round(viewport.clientHeight / scale) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  /**
   * Advances, and stops when it cannot be seen — off screen or on a hidden tab.
   *
   * Mattering more here than it did with a drawn mock: every step is a real
   * page load, so a hero left running in a background tab would fetch a
   * template every few seconds forever.
   */
  useEffect(() => {
    let visible = !document.hidden;
    let onScreen = false;

    const tick = () => {
      if (playing && visible && onScreen) setIndex((value) => (value + 1) % THEME_CYCLE_STEPS.length);
    };
    const timer = window.setInterval(tick, DWELL_MS);

    const onVisibility = () => {
      visible = !document.hidden;
    };
    document.addEventListener('visibilitychange', onVisibility);

    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        // Load once, then never unload: tearing the iframe down on scroll-out
        // would re-fetch the whole template on the way back.
        if (entry.isIntersecting) setShowFrame(true);
      },
      { threshold: 0.15 },
    );
    if (rootRef.current) observer.observe(rootRef.current);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
    };
  }, [playing]);

  const { step } = themeCycleAt(index * DWELL_MS);
  const previewSrc = `/themes/${step.templateId}?scheme=${encodeURIComponent(step.schemeKey)}&accent=${encodeURIComponent(step.accent)}`;

  return (
    <div
      className={styles.picker}
      ref={rootRef}
      style={{ '--pick-accent': step.accent, '--pick-line': step.line } as CSSProperties}
    >
      {/**
       * ONE SENTENCE FOR THE WHOLE THING, AND THE LOOP IS SILENT.
       *
       * Eight themes cycling forever through a live region would announce a
       * theme name every few seconds for as long as the page is open. This is
       * decorative; the operable picker is a link away and is announced there.
       */}
      <p className={styles.srOnly}>
        A demonstration of the website builder&rsquo;s theme picker, cycling through the{' '}
        {AVAILABLE_TEMPLATES.length} templates. The version you can use is linked below.
      </p>

      <div className={styles.pickerBody} aria-hidden="true">
        <div className={styles.pickerControls}>
          <p className={styles.pickerLabel}>Theme</p>
          <div className={styles.themeGrid}>
            {THEME_CYCLE_STEPS.map((option, optionIndex) => (
              <span
                key={option.templateId}
                className={`${themeStyles.themeOption} ${styles.themeTile}${
                  optionIndex === index ? ` ${themeStyles.selectedTheme} ${styles.themeTileOn}` : ''
                }`}
              >
                <ThemeIcon
                  name={option.templateName}
                  accent={option.accent}
                  fontVar={option.fontVar}
                  abbr={option.abbr}
                />
                <span className={themeStyles.themeOptionInfo}>
                  <strong>{option.templateName}</strong>
                </span>
              </span>
            ))}
          </div>

          <p className={styles.pickerLabel}>Color scheme</p>
          <div className={styles.schemeRow}>
            {THEME_CYCLE_SCHEMES.map((scheme) => (
              <span
                key={scheme.key || 'default'}
                className={`${styles.schemeSwatch}${scheme.key === step.schemeKey ? ` ${styles.schemeSwatchOn}` : ''}`}
              >
                <i data-scheme={scheme.key || 'default'} />
                <small>{scheme.label}</small>
              </span>
            ))}
          </div>

          <p className={styles.pickerLabel}>Accent color</p>
          <div className={styles.accentRow}>
            <span className={styles.accentChip} />
            <span className={styles.accentHex}>{step.accent}</span>
          </div>
        </div>

        <div className={styles.pickerPreview}>
          <div className={styles.previewBar}>
            <span className={styles.dots}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </span>
            <span className={styles.previewHost}>{step.templateName.toLowerCase()}.letsgetquoted.com</span>
          </div>

          <div className={styles.previewViewport} ref={viewportRef}>
            {showFrame && box ? (
              <iframe
                // Keyed on the whole query, so a step change reloads rather than
                // leaving the previous template on screen under a new name.
                key={previewSrc}
                src={previewSrc}
                title={`${step.templateName} template preview`}
                className={styles.previewFrame}
                style={{ width: FRAME_WIDTH, height: box.frameHeight, transform: `scale(${box.scale})` }}
                loading="lazy"
                scrolling="no"
                /* Not somewhere to land. It is a whole website inside a
                   marketing panel: without this a keyboard user tabs off the
                   hero and into a different site's navigation, and a screen
                   reader reads out a second page. It is a picture that happens
                   to be rendered by a browser. */
                tabIndex={-1}
                aria-hidden="true"
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
