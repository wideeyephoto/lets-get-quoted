'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import styles from './hero-intake-story.module.css';

/**
 * Condensed, single-story hero intake sequence for the homepage.
 *
 * Replaces the rapid multi-slide carousel with a focused 7.5s product-driven
 * animation using real contractor terminology (HOT LEAD, QUOTE-READY, IN SERVICE AREA)
 * and bath-to-shower project imagery.
 */
export default function HeroIntakeStory() {
  const [beat, setBeat] = useState(1); // 1: Photo, 2: Scan, 3: Details, 4: Qualified, 5: Complete/Hold
  const [isPlaying, setIsPlaying] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [isHoveredOrFocused, setIsHoveredOrFocused] = useState(false);
  const [hasCompletedOnce, setHasCompletedOnce] = useState(false);
  const [pulse, setPulse] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const elapsedRef = useRef<number>(0);

  // Check reduced motion
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setBeat(5);
      setHasCompletedOnce(true);
      return;
    }
  }, []);

  // Track page visibility
  useEffect(() => {
    const onVisibilityChange = () => {
      setPageVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // IntersectionObserver: Start only when >= 35% in view
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting && entry.intersectionRatio >= 0.35;
        setIsInView(visible);
        if (visible && !hasCompletedOnce) {
          setIsPlaying(true);
        }
      },
      { threshold: [0, 0.35, 1] },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasCompletedOnce]);

  // Main animation timer loop based on exact sequence timing
  useEffect(() => {
    if (
      !isPlaying ||
      !isInView ||
      !pageVisible ||
      isHoveredOrFocused ||
      hasCompletedOnce
    ) {
      return;
    }

    let rafId: number;
    let lastStamp = performance.now();

    const tick = (now: number) => {
      const delta = now - lastStamp;
      lastStamp = now;
      elapsedRef.current += delta;
      const elapsed = elapsedRef.current;

      if (elapsed < 800) {
        setBeat(1);
      } else if (elapsed < 2500) {
        setBeat(2);
      } else if (elapsed < 4200) {
        setBeat(3);
      } else if (elapsed < 5200) {
        if (beat !== 4) {
          setBeat(4);
          setPulse(true);
          setTimeout(() => setPulse(false), 800);
        }
      } else if (elapsed < 7500) {
        setBeat(5);
      } else {
        setBeat(5);
        setIsPlaying(false);
        setHasCompletedOnce(true);
        return;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [beat, hasCompletedOnce, isInView, isHoveredOrFocused, isPlaying, pageVisible]);

  const handleReplay = () => {
    elapsedRef.current = 0;
    setPulse(false);
    setBeat(1);
    setHasCompletedOnce(false);
    setIsPlaying(true);
  };

  const isScanning = beat === 2;
  const isDetails = beat >= 3;
  const isQualified = beat >= 4;

  return (
    <div
      aria-label="AI intake live project qualification preview"
      className={styles.container}
      data-scanning={isScanning ? 'true' : 'false'}
      onBlur={() => setIsHoveredOrFocused(false)}
      onFocus={() => setIsHoveredOrFocused(true)}
      onMouseEnter={() => setIsHoveredOrFocused(true)}
      onMouseLeave={() => setIsHoveredOrFocused(false)}
      ref={containerRef}
    >
      <div
        className={styles.panel}
        data-pulse={pulse ? 'true' : 'false'}
        data-scanning={isScanning ? 'true' : 'false'}
        tabIndex={0}
      >
        {/* Header Bar */}
        <div className={styles.headerBar}>
          <div className={styles.headerLead}>
            <span aria-hidden="true" className={styles.headerDot} />
            <span className={styles.headerTitle}>Michelle C. · AI Intake</span>
          </div>
          <span className={styles.headerPhase}>
            {beat === 1 && '01 · PHOTO RECEIVED'}
            {beat === 2 && '02 · AI SCANNING'}
            {beat === 3 && '03 · DETAILS RESOLVED'}
            {beat >= 4 && '04 · LEAD QUALIFIED'}
          </span>
        </div>

        {/* Visual Stage */}
        <div className={styles.stage}>
          <div
            className={styles.photoWrapper}
            data-entered={beat >= 1 ? 'true' : 'false'}
          >
            <Image
              alt="Homeowner bathroom photo sent via AI intake"
              className={styles.photo}
              fill
              priority
              sizes="(max-width: 700px) 92vw, 540px"
              src="/demo/bath-to-shower/homeowner-tub-photo-v1.png"
            />
          </div>

          <div aria-hidden="true" className={styles.stageVignette} />

          {/* LiDAR 3D Spatial Scan & AI Target Corners */}
          <div
            aria-hidden="true"
            className={styles.targetBox}
            data-scanning={isScanning ? 'true' : 'false'}
            data-visible={beat >= 2 && beat < 4 ? 'true' : 'false'}
          >
            <div className={styles.lidarMesh} />
            <div className={styles.lidarPoints}>
              <span className={styles.lPoint} style={{ top: '25%', left: '20%' }} />
              <span className={styles.lPoint} style={{ top: '35%', left: '50%' }} />
              <span className={styles.lPoint} style={{ top: '45%', left: '80%' }} />
              <span className={styles.lPoint} style={{ top: '65%', left: '30%' }} />
              <span className={styles.lPoint} style={{ top: '75%', left: '70%' }} />
            </div>
            <span className={styles.cornerTL} />
            <span className={styles.cornerTR} />
            <span className={styles.cornerBL} />
            <span className={styles.cornerBR} />
            <span className={styles.scanLine} />

            {/* Simulated LiDAR Alcove Dimension Anchor */}
            <div className={styles.alcoveMeasure}>
              <i>◀</i>
              <span>60.0&quot; ALCOVE SPAN</span>
              <i>▶</i>
            </div>
          </div>

          {/* Floating HUD status indicator during scan */}
          {beat === 2 && (
            <div className={styles.hudStatus}>
              <i aria-hidden="true" />
              <span>LiDAR 3D SCAN · 120k PTS/SEC</span>
            </div>
          )}

          {/* Staggered Feature / Scope Chips */}
          <div
            aria-label="Identified job details"
            className={styles.chipsContainer}
          >
            <span
              className={styles.chip}
              data-visible={isDetails ? 'true' : 'false'}
              style={{ transitionDelay: isDetails ? '0ms' : '0ms' }}
            >
              <i>✓</i> Tub edge &amp; drain visible
            </span>
            <span
              className={styles.chip}
              data-visible={isDetails ? 'true' : 'false'}
              style={{ transitionDelay: isDetails ? '140ms' : '0ms' }}
            >
              <i>✓</i> 60&quot; alcove · left-wall valve
            </span>
            <span
              className={styles.chip}
              data-visible={isDetails ? 'true' : 'false'}
              style={{ transitionDelay: isDetails ? '280ms' : '0ms' }}
            >
              <i>✓</i> Tile surround documented
            </span>
            <span
              className={styles.chip}
              data-visible={isDetails ? 'true' : 'false'}
              style={{ transitionDelay: isDetails ? '420ms' : '0ms' }}
            >
              <i>✓</i> Low-threshold base suggested
            </span>
          </div>

          {/* Lead Qualified Lift Card */}
          <div
            aria-label="Qualified lead summary"
            className={styles.qualifiedCard}
            data-visible={isQualified ? 'true' : 'false'}
          >
            <div className={styles.qualifiedTop}>
              <div className={styles.badgeGroup}>
                <span className={styles.badgeHot}>HOT LEAD</span>
                <span className={styles.badgeReady}>QUOTE-READY</span>
                <span className={styles.badgeArea}>IN SERVICE AREA</span>
              </div>
            </div>

            <div className={styles.qualifiedScope}>
              <h3 className={styles.scopeTitle}>60&quot; Alcove Bath-to-Shower Conversion</h3>
              <p className={styles.scopeSpecs}>
                Left-wall valve preserved · Low-threshold shower base · Waterproof wall system
              </p>
            </div>

            <div className={styles.estimateRow}>
              <div>
                <div className={styles.estimateLabel}>Draft Estimate</div>
                <div className={styles.estimateSub}>4 lines auto-filled from price book</div>
              </div>
              <div className={styles.estimateAmount}>$7,600 – $9,200</div>
            </div>

            <div className={styles.guardrailNote}>
              <i>✓</i> Profit guardrails applied · Ready for contractor review
            </div>
          </div>
        </div>

        {/* Footer Bar with Replay Affordance */}
        <div className={styles.footerBar}>
          <div className={styles.footerNote}>
            <strong>Photo to quote-ready</strong> in seconds
          </div>
          <button
            aria-label="Replay AI intake qualification animation"
            className={styles.replayBtn}
            onClick={handleReplay}
            type="button"
          >
            <span aria-hidden="true">↺</span> Replay
          </button>
        </div>
      </div>
    </div>
  );
}
