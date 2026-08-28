'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import ThemeIcon from '@/app/dashboard/sites/ThemeIcon';
import { AVAILABLE_TEMPLATES } from '@/lib/templates/types';
import {
  DWELL_MS,
  THEME_CYCLE_SCHEMES,
  THEME_CYCLE_STEPS,
  themeCycleAt,
  type ThemeCycleStep,
} from '@/lib/theme-cycle';
import styles from './hero-theme-cycler-dark.module.css';

const FRAME_WIDTH = 1280;

export default function HeroThemeCyclerDark() {
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showFrame, setShowFrame] = useState(false);
  const [box, setBox] = useState<{ scale: number; frameHeight: number } | null>(null);

  // Manual override state if contractor clicks a specific theme or scheme
  const [manualStep, setManualStep] = useState<ThemeCycleStep | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Check reduced motion
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIsPlaying(false);
      setShowFrame(true);
    }
  }, []);

  // Measure iframe scaling based on viewport width
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

  // Automatic cycling timer
  useEffect(() => {
    if (!isPlaying) return;

    let visible = !document.hidden;
    let onScreen = false;

    const tick = () => {
      if (isPlaying && visible && onScreen && !manualStep) {
        setIndex((value) => (value + 1) % THEME_CYCLE_STEPS.length);
      }
    };
    const timer = window.setInterval(tick, DWELL_MS);

    const onVisibility = () => {
      visible = !document.hidden;
    };
    document.addEventListener('visibilitychange', onVisibility);

    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
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
  }, [isPlaying, manualStep]);

  // Current active step (either manual selection or auto cycle step)
  const currentStep = manualStep || themeCycleAt(index * DWELL_MS).step;
  const previewSrc = `/themes/${currentStep.templateId}?scheme=${encodeURIComponent(currentStep.schemeKey)}&accent=${encodeURIComponent(currentStep.accent)}`;

  const handleSelectTemplate = (templateId: string) => {
    const stepIndex = THEME_CYCLE_STEPS.findIndex((s) => s.templateId === templateId);
    if (stepIndex !== -1) {
      setIndex(stepIndex);
      setManualStep(THEME_CYCLE_STEPS[stepIndex]);
    }
  };

  const handleSelectScheme = (schemeKey: string) => {
    const targetScheme = THEME_CYCLE_SCHEMES.find((s) => s.key === schemeKey);
    if (targetScheme) {
      setManualStep({
        ...currentStep,
        schemeKey: targetScheme.key,
        schemeLabel: targetScheme.label,
      });
    }
  };

  return (
    <div className={styles.pickerContainer} ref={rootRef}>
      {/* Top Window Bar */}
      <div className={styles.pickerTopBar}>
        <div className={styles.windowDots}>
          <span className={`${styles.dot} ${styles.dotRed}`} />
          <span className={`${styles.dot} ${styles.dotYellow}`} />
          <span className={`${styles.dot} ${styles.dotGreen}`} />
        </div>

        <div className={styles.addressBar}>
          <span className={styles.sslBadge}>🔒 SSL LIVE</span>
          <span>{currentStep.templateName.toLowerCase()}.letsgetquoted.com</span>
        </div>

        <div className={styles.cycleControlRow}>
          <button
            type="button"
            className={styles.cycleToggleBtn}
            onClick={() => {
              if (manualStep) {
                setManualStep(null);
                setIsPlaying(true);
              } else {
                setIsPlaying(!isPlaying);
              }
            }}
            title={isPlaying && !manualStep ? 'Pause automatic preview cycling' : 'Resume auto cycle'}
          >
            {isPlaying && !manualStep ? '⏸ Pause' : '▶ Auto-Cycle'}
          </button>
        </div>
      </div>

      {/* Picker Body with Controls on Left and 1280px Preview Frame on Right */}
      <div className={styles.pickerBody}>
        {/* Controls Column */}
        <div className={styles.pickerControls}>
          {/* Theme Archetypes */}
          <div className={styles.controlSection}>
            <div className={styles.controlLabel}>
              <span>Template Archetype</span>
              <small>{AVAILABLE_TEMPLATES.length} Styles</small>
            </div>

            <div className={styles.themeGrid}>
              {THEME_CYCLE_STEPS.map((option) => {
                const isSelected = option.templateId === currentStep.templateId;
                return (
                  <button
                    key={option.templateId}
                    type="button"
                    onClick={() => handleSelectTemplate(option.templateId)}
                    className={`${styles.themeTile} ${isSelected ? styles.themeTileActive : ''}`}
                    title={`Preview ${option.templateName} theme`}
                  >
                    <ThemeIcon
                      name={option.templateName}
                      accent={option.accent}
                      fontVar={option.fontVar}
                      abbr={option.abbr}
                    />
                    <span className={styles.themeTileName}>{option.templateName}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color Schemes */}
          <div className={styles.controlSection}>
            <div className={styles.controlLabel}>
              <span>Color System</span>
              <small>{currentStep.schemeLabel}</small>
            </div>

            <div className={styles.schemeGrid}>
              {THEME_CYCLE_SCHEMES.slice(0, 8).map((scheme) => {
                const isSelected = scheme.key === currentStep.schemeKey;
                return (
                  <button
                    key={scheme.key || 'default'}
                    type="button"
                    onClick={() => handleSelectScheme(scheme.key)}
                    className={`${styles.schemeSwatch} ${isSelected ? styles.schemeSwatchActive : ''}`}
                    title={`Apply ${scheme.label} palette`}
                  >
                    <span
                      className={styles.swatchChip}
                      data-scheme={scheme.key || 'default'}
                    />
                    <span className={styles.schemeLabelText}>{scheme.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Accent Display & Gallery Link */}
          <div className={styles.accentRow}>
            <div className={styles.accentLeft}>
              <span
                className={styles.accentDot}
                style={{ backgroundColor: currentStep.accent }}
              />
              <span className={styles.accentHex}>{currentStep.accent}</span>
            </div>
            <Link href="/demo/sites" className={styles.galleryLink}>
              Full Gallery ↗
            </Link>
          </div>
        </div>

        {/* Live Preview Column */}
        <div className={styles.pickerPreview}>
          <div className={styles.previewViewport} ref={viewportRef}>
            {showFrame && box ? (
              <iframe
                key={previewSrc}
                src={previewSrc}
                title={`${currentStep.templateName} contractor website preview`}
                className={styles.previewFrame}
                style={{
                  width: FRAME_WIDTH,
                  height: box.frameHeight,
                  transform: `scale(${box.scale})`,
                }}
                loading="lazy"
                scrolling="no"
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
