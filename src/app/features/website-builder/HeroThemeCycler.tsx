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
 * that the site is yours to change, and that changing it is instant. A still
 * image of somebody else's finished homepage cannot say either thing.
 *
 * IT IS A REPLICA MADE OF THE REAL PARTS. ThemeIcon is the dashboard's own
 * component, the tiles come from AVAILABLE_TEMPLATES, the swatches from
 * COLOR_SCHEMES, and each theme’s color is the accent on its own config. Add a
 * ninth template to the app and it appears in this hero without anybody
 * remembering to update a marketing page — which a screenshot could never do,
 * and would go quietly stale instead.
 *
 * NOT INTERACTIVE, AND THAT IS A CHOICE. The real thing at /demo/sites drives a
 * live iframe of /themes/[id]. An iframe in a hero loads during first paint, on
 * the page where speed is the argument. This plays the same sequence with none
 * of that, and the demo link below it goes to the version you can actually
 * click.
 */
export default function HeroThemeCycler() {
  // Step 0 is what the server renders, so no-JS and reduced-motion visitors get
  // a complete, honest picture of the control rather than an empty box.
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setPlaying(true);
  }, []);

  /**
   * Stops when it cannot be seen — off screen or on a hidden tab.
   *
   * A marketing page left open in a background tab has no business waking the
   * compositor every 2.4 seconds forever. setInterval rather than the rAF loop
   * the /for hero needs: nothing here moves between steps, so there is exactly
   * one state change every DWELL_MS and a frame loop would be 143 wasted ticks
   * out of every 144.
   */
  useEffect(() => {
    if (!playing) return;

    let visible = !document.hidden;
    let onScreen = true;

    const tick = () => {
      if (visible && onScreen) setIndex((value) => (value + 1) % THEME_CYCLE_STEPS.length);
    };
    const timer = window.setInterval(tick, DWELL_MS);

    const onVisibility = () => {
      visible = !document.hidden;
    };
    document.addEventListener('visibilitychange', onVisibility);

    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
    }, { threshold: 0.15 });
    if (rootRef.current) observer.observe(rootRef.current);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
    };
  }, [playing]);

  const { step } = themeCycleAt(index * DWELL_MS);

  return (
    <div
      className={styles.picker}
      ref={rootRef}
      style={
        {
          '--pick-accent': step.accent,
          '--pick-bg': step.bg,
          '--pick-surface': step.surface,
          '--pick-ink': step.ink,
          '--pick-muted': step.muted,
          '--pick-line': step.line,
        } as CSSProperties
      }
    >
      {/**
       * ONE LIVE REGION FOR THE WHOLE THING, AND IT IS OFF.
       *
       * Eight themes cycling forever through a polite region would announce a
       * theme name every 2.4 seconds for as long as the page is open — the
       * definition of a region nobody can use. The control is decorative here;
       * the real, operable one is a link away and is announced properly. So the
       * sequence is hidden from assistive tech and a single static sentence
       * describes what it is.
       */}
      <p className={styles.srOnly}>
        A demonstration of the website builder&rsquo;s theme picker, cycling through the{' '}
        {AVAILABLE_TEMPLATES.length} templates. The live version is linked below.
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

        {/* The payoff. Every color below is a custom property set on the root
            of this component, so one state change repaints the whole preview —
            which is the claim the section is making. */}
        <div className={styles.pickerPreview}>
          <div className={styles.previewBar}>
            <span className={styles.dots}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </span>
            <span className={styles.previewHost}>{step.templateName.toLowerCase()}.letsgetquoted.com</span>
          </div>
          <div className={styles.previewSite}>
            <div className={styles.previewTop}>
              <span className={styles.previewBrand} style={{ fontFamily: step.fontVar }}>
                Cedar Creek Roofing
              </span>
              <span className={styles.previewCta}>Get an estimate</span>
            </div>
            <p className={styles.previewHeadline} style={{ fontFamily: step.fontVar }}>
              Roof repairs and full replacements.
            </p>
            <p className={styles.previewSub}>Serving Fairview, Northgate and 6 nearby towns.</p>
            <div className={styles.previewCard}>
              <span className={styles.previewCardLabel}>Instant estimate</span>
              <span className={styles.previewCardRange}>$9,400 &ndash; $13,200</span>
            </div>
          </div>
        </div>
      </div>

      <p className={styles.pickerFoot}>
        {step.templateName} &middot; {step.schemeLabel}
      </p>
    </div>
  );
}
