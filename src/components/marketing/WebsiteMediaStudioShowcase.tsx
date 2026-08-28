'use client';

import { useState, useRef } from 'react';
import styles from './website-media-studio-showcase.module.css';

type VideoLayoutKey = 'hero' | 'split' | 'story' | 'reel' | 'testimonial' | 'process';

interface VideoLayoutDef {
  key: VideoLayoutKey;
  icon: string;
  name: string;
  sub: string;
  title: string;
  desc: string;
  bullets: string[];
  guardrail: string;
}

const VIDEO_LAYOUTS: VideoLayoutDef[] = [
  {
    key: 'hero',
    icon: '🎬',
    name: 'Hero Loop',
    sub: 'Full-bleed video header',
    title: 'Background Video Hero Loop',
    desc: 'Immersive, full-width video playing silently behind your headline and primary estimate call-to-action.',
    bullets: [
      'Replaces the static photo hero with active job-site or crew motion.',
      'Auto-darkening contrast overlay (0–100%) ensures headline text stays readable.',
      'Automatic mobile data saver: delivers high-res still poster on cellular connections.',
    ],
    guardrail: 'Enforces ≤12 MB video loop recommendation to protect sub-second mobile page loads.',
  },
  {
    key: 'split',
    icon: '⚡',
    name: 'Video + Copy',
    sub: 'Side-by-side player',
    title: 'Video + Copy Split Section',
    desc: 'Video player positioned directly alongside your core service message, value points, and a quote button.',
    bullets: [
      'The versatile all-rounder: ideal for owner introductions, shop tours, or service overviews.',
      'Includes optional play button with automatic timestamp display.',
      'Seamlessly links directly into your instant estimate intake form.',
    ],
    guardrail: 'Accepts native MP4, MOV, WebM uploads up to 50 MB, plus YouTube video embeds.',
  },
  {
    key: 'story',
    icon: '🏗️',
    name: 'Project Story',
    sub: 'Case study spotlight',
    title: 'Project Story Case Study',
    desc: 'A complete job spotlight featuring project location, work timeline, service scope, and start-to-finish video.',
    bullets: [
      'Shows the full job progression: from the initial tear-out to the finished reveal.',
      'Displays project location (city/neighborhood), turnaround timeline, and specific trade scope.',
      'Proves real craftsmanship and builds instant buyer confidence in high-ticket work.',
    ],
    guardrail: 'Keeps project metadata and video assets preserved even if you toggle between layouts.',
  },
  {
    key: 'reel',
    icon: '📱',
    name: 'Reel Gallery',
    sub: 'Vertical phone clips',
    title: 'Vertical Video Reel Showcase',
    desc: 'A horizontal gallery of tall, 9:16 phone-shot video clips showcasing daily project highlights.',
    bullets: [
      'Built specifically for clips shot vertically on iPhone or Android in the field.',
      'Up to 6 browsable reel tiles with individual captions, timestamps, and thumbnail previews.',
      'Touch-friendly mobile carousel allows homeowners to swipe through real project stories.',
    ],
    guardrail: 'Automatic codec check alerts if clips need web-standard formatting before going live.',
  },
  {
    key: 'testimonial',
    icon: '💬',
    name: 'Testimonial',
    sub: 'Customer on camera',
    title: 'On-Camera Video Testimonial',
    desc: 'Satisfied homeowners on camera with their pull quote and verified client attribution alongside.',
    bullets: [
      'The highest-converting trust asset: let your real customers speak directly to new visitors.',
      'Displays customer quote text, homeowner name, and neighborhood/town label.',
      'Carries structured review metadata for search engine indexing.',
    ],
    guardrail: 'Supports up to 6 customer video reviews with individual quotes and author labels.',
  },
  {
    key: 'process',
    icon: '🔢',
    name: 'Step Process',
    sub: 'How work gets done',
    title: 'Process & Timeline Explainer',
    desc: 'A craftsmanship or walk-through video paired with numbered milestones explaining what happens next.',
    bullets: [
      'Numbered 1-2-3-4 step milestones (e.g. Free Estimate → Quote Approval → Job Kickoff → Final Walkthrough).',
      'Reduces homeowner anxiety by clarifying arrival windows and project expectations.',
      'Positioned to guide visitors directly into requesting their instant estimate.',
    ],
    guardrail: 'Customizable step titles and descriptions with automated ordinal numbering.',
  },
];

export default function WebsiteMediaStudioShowcase() {
  const [activeLayout, setActiveLayout] = useState<VideoLayoutKey>('split');
  const [sliderPos, setSliderPos] = useState<number>(50);
  const sliderFrameRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef<boolean>(false);

  const currentLayout = VIDEO_LAYOUTS.find((l) => l.key === activeLayout) || VIDEO_LAYOUTS[0];

  function updateSliderFromClientX(clientX: number) {
    const frame = sliderFrameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    if (rect.width === 0) return;
    const nextPercent = ((clientX - rect.left) / rect.width) * 100;
    setSliderPos(Math.max(0, Math.min(100, nextPercent)));
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    isDraggingRef.current = true;
    if (e.pointerType === 'mouse') e.currentTarget.setPointerCapture?.(e.pointerId);
    updateSliderFromClientX(e.clientX);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (isDraggingRef.current) updateSliderFromClientX(e.clientX);
  }

  function handlePointerUp() {
    isDraggingRef.current = false;
  }

  function handleSliderKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowLeft') {
      setSliderPos((p) => Math.max(0, p - 5));
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      setSliderPos((p) => Math.min(100, p + 5));
      e.preventDefault();
    } else if (e.key === 'Home') {
      setSliderPos(0);
      e.preventDefault();
    } else if (e.key === 'End') {
      setSliderPos(100);
      e.preventDefault();
    }
  }

  return (
    <div className={styles.showcaseContainer}>
      {/* -------------------------------------------------------------
          1. VIDEO STUDIO: 6 DEDICATED LAYOUTS INTERACTIVE SHOWCASE
          ------------------------------------------------------------- */}
      <div className={styles.studioCard}>
        <div className={styles.studioHeader}>
          <div className={styles.studioHeaderTop}>
            <span className={styles.badge}>🎬 Built-in Video Studio</span>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
              Up to 4 video bands per page
            </span>
          </div>
          <h3 className={styles.studioTitle}>
            Show your craftsmanship with six dedicated video layouts.
          </h3>
          <p className={styles.studioSubtitle}>
            Video builds instant trust with homeowners. Upload clips from your phone (MP4, MOV, WebM) or paste a YouTube
            link. Switch between six layouts anytime—your footage and copy are preserved automatically.
          </p>
        </div>

        {/* Layout Navigation Tabs */}
        <div className={styles.layoutNav} role="tablist" aria-label="Video Layout Options">
          {VIDEO_LAYOUTS.map((layout) => (
            <button
              key={layout.key}
              type="button"
              role="tab"
              aria-selected={activeLayout === layout.key}
              onClick={() => setActiveLayout(layout.key)}
              className={`${styles.layoutTab} ${activeLayout === layout.key ? styles.layoutTabActive : ''}`}
            >
              <span className={styles.layoutIcon}>{layout.icon}</span>
              <span className={styles.layoutTabLabel}>{layout.name}</span>
              <span className={styles.layoutTabSub}>{layout.sub}</span>
            </button>
          ))}
        </div>

        {/* Interactive Studio Stage */}
        <div className={styles.studioBody}>
          {/* Visual Mock Viewport */}
          <div className={styles.mockViewport}>
            <div className={styles.viewportBar}>
              <div className={styles.dots}>
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
              </div>
              <span className={styles.viewportUrl}>cedarcreekroofing.com · layout: {activeLayout}</span>
            </div>

            <div className={styles.mockContent}>
              {activeLayout === 'hero' && (
                <div className={styles.heroLoopPreview}>
                  <span className={styles.videoOverlayBadge}>● Background Video Loop</span>
                  <div style={{ color: 'var(--flare)', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase' }}>
                    Premier Roofing &amp; Siding
                  </div>
                  <h4 className={styles.heroLoopHeading}>Built to Last Through Every Storm</h4>
                  <p className={styles.heroLoopText}>
                    Full roof replacements, emergency leak repairs, and seamless gutters in Fairview.
                  </p>
                  <span className={styles.heroLoopBtn}>Get Instant Estimate &rarr;</span>
                </div>
              )}

              {activeLayout === 'split' && (
                <div className={styles.splitPreview}>
                  <div className={styles.videoScreenMock}>
                    <div className={styles.playCircle}>▶</div>
                    <span className={styles.videoDurationTag}>1:14</span>
                  </div>
                  <div className={styles.splitCopy}>
                    <span className={styles.splitEyebrow}>Meet The Crew</span>
                    <h4 className={styles.splitHeading}>Honest Work, Guaranteed Craftsmanship</h4>
                    <p className={styles.splitDesc}>
                      Dana explains how our intake inspection works and why we leave jobsites cleaner than we found them.
                    </p>
                  </div>
                </div>
              )}

              {activeLayout === 'story' && (
                <div className={styles.storyPreview}>
                  <div className={styles.storyHeader}>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--flare)', fontWeight: 800 }}>FEATURED PROJECT</div>
                      <strong style={{ fontSize: '0.95rem', color: '#fff' }}>Historic Shingle &amp; Copper Flashing</strong>
                    </div>
                    <div className={styles.storyMetaPills}>
                      <span className={styles.metaPill}>📍 Northgate</span>
                      <span className={styles.metaPill}>⏱️ 4 Days</span>
                    </div>
                  </div>
                  <div className={styles.storyMediaRow}>
                    <div className={styles.videoScreenMock}>
                      <div className={styles.playCircle}>▶</div>
                      <span className={styles.videoDurationTag}>2:05</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span>✓ Full deck inspection &amp; tear-off</span>
                      <span>✓ Heavy architectural shingles</span>
                      <span>✓ Lifetime leak-free warranty</span>
                    </div>
                  </div>
                </div>
              )}

              {activeLayout === 'reel' && (
                <div className={styles.reelsGrid}>
                  <div className={styles.reelCard}>
                    <span style={{ fontSize: '0.65rem', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>0:42</span>
                    <span className={styles.reelTitle}>Copper Valley Install</span>
                  </div>
                  <div className={styles.reelCard} style={{ background: '#192841' }}>
                    <span style={{ fontSize: '0.65rem', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>0:38</span>
                    <span className={styles.reelTitle}>Storm Damage Fix</span>
                  </div>
                  <div className={styles.reelCard} style={{ background: '#1c2e3d' }}>
                    <span style={{ fontSize: '0.65rem', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>0:54</span>
                    <span className={styles.reelTitle}>Final Reveal</span>
                  </div>
                </div>
              )}

              {activeLayout === 'testimonial' && (
                <div className={styles.testimonialCardMock}>
                  <div className={styles.videoScreenMock} style={{ aspectRatio: '1 / 1' }}>
                    <div className={styles.playCircle} style={{ width: 32, height: 32, fontSize: '0.75rem' }}>▶</div>
                    <span className={styles.videoDurationTag}>0:45</span>
                  </div>
                  <div>
                    <p className={styles.testQuote}>
                      &ldquo;They arrived on Monday at 7:30 AM and by Thursday afternoon the whole roof was finished. Cleanest crew I’ve ever hired.&rdquo;
                    </p>
                    <div className={styles.testAuthor}>Marcus &amp; Sarah Jenkins</div>
                    <div className={styles.testRole}>Fairview Homeowners · Full Replacement</div>
                  </div>
                </div>
              )}

              {activeLayout === 'process' && (
                <div className={styles.processStepsMock}>
                  <div className={styles.videoScreenMock}>
                    <div className={styles.playCircle}>▶</div>
                    <span className={styles.videoDurationTag}>1:30</span>
                  </div>
                  <div className={styles.stepList}>
                    <div className={styles.stepRow}>
                      <span className={styles.stepNumber}>1</span> Instant 60-Sec Estimate
                    </div>
                    <div className={styles.stepRow}>
                      <span className={styles.stepNumber}>2</span> On-Site Drone Inspection
                    </div>
                    <div className={styles.stepRow}>
                      <span className={styles.stepNumber}>3</span> E-Sign Quote &amp; Deposit
                    </div>
                    <div className={styles.stepRow}>
                      <span className={styles.stepNumber}>4</span> 1-Day Installation
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Details Sidebar */}
          <div className={styles.studioDetails}>
            <div className={styles.detailsHeader}>
              <h4 className={styles.detailsTitle}>{currentLayout.title}</h4>
              <p className={styles.detailsDesc}>{currentLayout.desc}</p>
            </div>

            <ul className={styles.featureList}>
              {currentLayout.bullets.map((bullet, idx) => (
                <li key={idx} className={styles.featureItem}>
                  <span className={styles.featureCheck}>✓</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>

            <div className={styles.guardrailBox}>
              <div className={styles.guardrailTitle}>
                <span>🛡️</span> Built-in Performance Check
              </div>
              <p className={styles.guardrailText}>{currentLayout.guardrail}</p>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------
          2. CRAFTSMANSHIP PROOF: INTERACTIVE BEFORE / AFTER SLIDER
          ------------------------------------------------------------- */}
      <div className={styles.baSection}>
        <div className={styles.baInfo}>
          <span className={styles.badge}>📸 Interactive Proof</span>
          <h3 className={styles.baTitle}>
            Drag-to-reveal Before &amp; After project sliders.
          </h3>
          <p className={styles.baText}>
            Nothing convinces a homeowner faster than visual proof of transformation. Upload side-by-side job photos
            and let visitors interactively slide between the initial problem and your finished craftsmanship.
          </p>
          <ul className={styles.featureList}>
            <li className={styles.featureItem}>
              <span className={styles.featureCheck}>✓</span>
              <span>Smooth mouse drag, mobile touch swipe, and keyboard arrow controls.</span>
            </li>
            <li className={styles.featureItem}>
              <span className={styles.featureCheck}>✓</span>
              <span>Highlights repairs, remodels, fresh paint, paver patios, and new roofs.</span>
            </li>
            <li className={styles.featureItem}>
              <span className={styles.featureCheck}>✓</span>
              <span>Embed up to 10 project comparisons across your services and galleries.</span>
            </li>
          </ul>
        </div>

        <div>
          <div
            ref={sliderFrameRef}
            className={styles.baInteractiveFrame}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            role="region"
            aria-label="Interactive before and after project showcase"
          >
            {/* After Image (Full background) */}
            <img
              src="/media/website-builder/lawn-and-order/lawn-and-order-project-gallery.jpg"
              alt="Finished landscaped patio and manicured lawn after installation"
              className={styles.baImgLayer}
              loading="lazy"
              draggable={false}
            />

            {/* Before Image (Clipped overlay) */}
            <div
              className={styles.baBeforeClip}
              style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
            >
              <img
                src="/media/website-builder/lawn-and-order/lawn-and-order-desktop-hero.jpg"
                alt="Original yard site prior to excavation and grading"
                className={styles.baImgLayer}
                style={{ filter: 'grayscale(0.35) contrast(0.95)' }}
                loading="lazy"
                draggable={false}
              />
            </div>

            {/* Tags */}
            <span className={`${styles.baPillTag} ${styles.baTagBefore}`}>Before</span>
            <span className={`${styles.baPillTag} ${styles.baTagAfter}`}>After</span>

            {/* Draggable Divider Handle */}
            <div
              className={styles.baDividerHandle}
              style={{ left: `${sliderPos}%` }}
              role="slider"
              tabIndex={0}
              aria-label="Drag before and after transformation"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(sliderPos)}
              onKeyDown={handleSliderKeyDown}
            >
              <div className={styles.baHandleKnob}>‹ ›</div>
            </div>
          </div>
          <p className={styles.baSliderHint}>
            👈 Drag slider horizontally or use left/right arrow keys to reveal before &amp; after 👉
          </p>
        </div>
      </div>
    </div>
  );
}
