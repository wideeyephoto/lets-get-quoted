'use client';

import Image from 'next/image';
import { useState, useRef, useEffect } from 'react';
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
    guardrail: 'Accepts start-to-finish video edits up to 50 MB, with optional before/after still pair.',
  },
  {
    key: 'reel',
    icon: '📱',
    name: 'Vertical Reel',
    sub: 'Mobile-first 9:16 portrait',
    title: 'Vertical Reel (9:16 Social Style)',
    desc: 'Engaging vertical video format optimized for smartphone capture from job sites and quick crew updates.',
    bullets: [
      'Native 9:16 portrait aspect ratio matching TikTok, Instagram Reels, and YouTube Shorts.',
      'Includes animated sound equalizer icon to indicate active audio playback.',
      'Floating primary CTA button stays locked to the bottom of the video frame.',
    ],
    guardrail: 'Auto-crops 9:16 vertical clips on desktop viewports while maintaining sharp focus.',
  },
  {
    key: 'testimonial',
    icon: '💬',
    name: 'Video Review',
    sub: 'Authentic homeowner proof',
    title: 'Homeowner Video Testimonial Card',
    desc: 'Direct customer recommendation clip with verified homeowner rating, project badge, and review excerpt.',
    bullets: [
      'Places a genuine customer endorsement directly in your page hierarchy.',
      'Integrated 5-star rating, customer location, and verified reviewer badge.',
      'Significantly outperforms text-only reviews in closing undecided website visitors.',
    ],
    guardrail: 'Includes verified customer trust badges and optional project location tags.',
  },
  {
    key: 'process',
    icon: '🛠️',
    name: 'Process Clip',
    sub: 'Step-by-step walkthrough',
    title: '3-Step Workmanship Process',
    desc: 'Educational walkthrough demonstrating your preparation, installation standards, and cleanup protocol.',
    bullets: [
      'Demonstrates your trade standards: site protection, precise installation, and spotless cleanup.',
      'Reduces homeowner anxiety by clarifying arrival windows and project expectations.',
      'Positioned to guide visitors directly into requesting their instant estimate.',
    ],
    guardrail: 'Customizable step titles and descriptions with automated ordinal numbering.',
  },
];

export default function WebsiteMediaStudioShowcase() {
  const [activeLayout, setActiveLayout] = useState<VideoLayoutKey>('hero');
  const [sliderPos, setSliderPos] = useState<number>(50);
  const [isSplitPlaying, setIsSplitPlaying] = useState<boolean>(false);
  const [isStoryPlaying, setIsStoryPlaying] = useState<boolean>(false);
  const [isNear, setIsNear] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const sliderFrameRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef<boolean>(false);
  const splitVideoRef = useRef<HTMLVideoElement>(null);
  const storyVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!containerRef.current || typeof IntersectionObserver === 'undefined') {
      setIsNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const currentLayout = VIDEO_LAYOUTS.find((l) => l.key === activeLayout) || VIDEO_LAYOUTS[0];

  function getViewportUrl(key: VideoLayoutKey) {
    switch (key) {
      case 'hero':
        return 'greenvalleylawncare.com · layout: hero';
      case 'split':
        return 'cedarcreekwoodworking.com · layout: split';
      case 'story':
        return 'fairviewroofing.com · layout: story';
      case 'reel':
        return 'precisiontradecraft.com · layout: reel';
      case 'testimonial':
        return 'fairviewroofing.com · layout: testimonial';
      case 'process':
        return 'cedarcreekwoodworking.com · layout: process';
      default:
        return `cedarcreekservices.com · layout: ${key}`;
    }
  }

  function toggleSplitPlay() {
    if (!splitVideoRef.current) return;
    if (splitVideoRef.current.paused) {
      splitVideoRef.current.play();
      setIsSplitPlaying(true);
    } else {
      splitVideoRef.current.pause();
      setIsSplitPlaying(false);
    }
  }

  function toggleStoryPlay() {
    if (!storyVideoRef.current) return;
    if (storyVideoRef.current.paused) {
      storyVideoRef.current.play();
      setIsStoryPlaying(true);
    } else {
      storyVideoRef.current.pause();
      setIsStoryPlaying(false);
    }
  }

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
    <div className={styles.showcaseContainer} ref={containerRef}>
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
              onClick={() => {
                setActiveLayout(layout.key);
                setIsSplitPlaying(false);
                setIsStoryPlaying(false);
              }}
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
              <span className={styles.viewportUrl}>{getViewportUrl(activeLayout)}</span>
            </div>

            <div className={styles.mockContent}>
              {activeLayout === 'hero' && (
                <div className={styles.heroLoopPreview}>
                  <video
                    autoPlay={isNear}
                    loop
                    muted
                    playsInline
                    preload="none"
                    className={styles.heroBgVideo}
                    src={isNear ? "/media/website-builder/studio/zero-turn-mower-loop.mp4" : undefined}
                    poster="/media/website-builder/studio/zero-turn-mower-poster.jpg"
                  />
                  <div className={styles.heroLoopScrim} />
                  <div className={styles.heroLoopOverlay}>
                    <div style={{ color: 'var(--flare)', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', textShadow: '0 1px 8px rgba(0, 0, 0, 0.95)' }}>
                      Green Valley Turf &amp; Grounds
                    </div>
                    <h4 className={styles.heroLoopHeading}>Built for Clean Cuts &amp; Perfect Stripes</h4>
                    <p className={styles.heroLoopText}>
                      Precision lawn maintenance, seasonal cleanups, and commercial turf management in Fairview.
                    </p>
                    <span className={styles.heroLoopBtn}>Get Instant Estimate &rarr;</span>
                  </div>
                </div>
              )}

              {activeLayout === 'split' && (
                <div className={styles.splitPreview}>
                  <div
                    className={styles.videoScreenWrapper}
                    onClick={toggleSplitPlay}
                    title="Click to play / pause video clip"
                  >
                    <video
                      ref={splitVideoRef}
                      src="/media/website-builder/studio/craftsman-woodworking.mp4"
                      poster="/media/website-builder/studio/craftsman-woodworking-poster.jpg"
                      playsInline
                      loop
                      muted
                      className={styles.realVideoPlayer}
                    />
                    {!isSplitPlaying && (
                      <div className={styles.playOverlay}>
                        <div className={styles.playCircle}>▶</div>
                      </div>
                    )}
                    <span className={styles.videoDurationTag}>
                      {isSplitPlaying ? 'Playing' : '0:05'}
                    </span>
                  </div>
                  <div className={styles.splitCopy}>
                    <span className={styles.splitEyebrow}>Meet The Craftsman</span>
                    <h4 className={styles.splitHeading}>Honest Work, Guaranteed Craftsmanship</h4>
                    <p className={styles.splitDesc}>
                      Dana explains how our custom millwork process works and why we leave jobsites cleaner than we found them.
                    </p>
                    <button
                      type="button"
                      onClick={toggleSplitPlay}
                      className={styles.miniVideoControlBtn}
                    >
                      {isSplitPlaying ? '⏸ Pause Clip' : '▶ Play Full Video'}
                    </button>
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
                    <div
                      className={styles.videoScreenWrapper}
                      onClick={toggleStoryPlay}
                      title="Click to play project walkthrough"
                    >
                      <video
                        ref={storyVideoRef}
                        src="/media/website-builder/studio/roofer-inspecting-shingles.mp4"
                        poster="/media/website-builder/studio/roofer-inspecting-shingles-poster.jpg"
                        playsInline
                        loop
                        muted
                        className={styles.realVideoPlayer}
                      />
                      {!isStoryPlaying && (
                        <div className={styles.playOverlay}>
                          <div className={styles.playCircle}>▶</div>
                        </div>
                      )}
                      <span className={styles.videoDurationTag}>
                        {isStoryPlaying ? 'Playing' : '0:05'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span>✓ Full deck inspection &amp; tear-off</span>
                      <span>✓ Heavy architectural shingles</span>
                      <span>✓ Lifetime leak-free warranty</span>
                      <button
                        type="button"
                        onClick={toggleStoryPlay}
                        className={styles.miniVideoControlBtn}
                        style={{ marginTop: 8 }}
                      >
                        {isStoryPlaying ? '⏸ Pause Walkthrough' : '▶ Play Walkthrough'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeLayout === 'reel' && (
                <div className={styles.reelsGrid}>
                  <div className={`${styles.reelCard} ${styles.reelCardVideo}`}>
                    <video
                      autoPlay
                      loop
                      muted
                      playsInline
                      className={styles.realReelVideo}
                      src="/media/website-builder/studio/zero-turn-mower-loop.mp4"
                      poster="/media/website-builder/studio/zero-turn-mower-poster.jpg"
                    />
                    <div className={styles.reelOverlay}>
                      <span className={styles.reelTimeBadge}>● Live Reel · 0:42</span>
                      <span className={styles.reelTitle}>Lawn Striping</span>
                    </div>
                  </div>
                  <div className={styles.reelCard} style={{ background: '#192841' }}>
                    <video
                      autoPlay
                      loop
                      muted
                      playsInline
                      className={styles.realReelVideo}
                      src="/media/website-builder/studio/roofer-inspecting-shingles.mp4"
                      poster="/media/website-builder/studio/roofer-inspecting-shingles-poster.jpg"
                    />
                    <div className={styles.reelOverlay}>
                      <span className={styles.reelTimeBadge}>0:38</span>
                      <span className={styles.reelTitle}>Rooftop Inspection</span>
                    </div>
                  </div>
                  <div className={styles.reelCard} style={{ background: '#1c2e3d' }}>
                    <video
                      autoPlay
                      loop
                      muted
                      playsInline
                      className={styles.realReelVideo}
                      src="/media/website-builder/studio/craftsman-woodworking.mp4"
                      poster="/media/website-builder/studio/craftsman-woodworking-poster.jpg"
                    />
                    <div className={styles.reelOverlay}>
                      <span className={styles.reelTimeBadge}>0:54</span>
                      <span className={styles.reelTitle}>Wood Framing Craft</span>
                    </div>
                  </div>
                </div>
              )}

              {activeLayout === 'testimonial' && (
                <div className={styles.testimonialCardMock}>
                  <div className={styles.videoScreenWrapper} style={{ aspectRatio: '1 / 1' }}>
                    <video
                      autoPlay
                      loop
                      muted
                      playsInline
                      className={styles.realVideoPlayer}
                      src="/media/website-builder/studio/roofer-inspecting-shingles.mp4"
                      poster="/media/website-builder/studio/roofer-inspecting-shingles-poster.jpg"
                    />
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
                  <div className={styles.videoScreenWrapper}>
                    <video
                      autoPlay
                      loop
                      muted
                      playsInline
                      className={styles.realVideoPlayer}
                      src="/media/website-builder/studio/craftsman-woodworking.mp4"
                      poster="/media/website-builder/studio/craftsman-woodworking-poster.jpg"
                    />
                    <span className={styles.videoDurationTag}>1:30</span>
                  </div>
                  <div className={styles.stepList}>
                    <div className={styles.stepRow}>
                      <span className={styles.stepNumber}>1</span> Instant 60-Sec Estimate
                    </div>
                    <div className={styles.stepRow}>
                      <span className={styles.stepNumber}>2</span> Material &amp; Scope Walkthrough
                    </div>
                    <div className={styles.stepRow}>
                      <span className={styles.stepNumber}>3</span> E-Sign Quote &amp; Deposit
                    </div>
                    <div className={styles.stepRow}>
                      <span className={styles.stepNumber}>4</span> Custom Build &amp; Clean Reveal
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
            <Image
              src="/media/website-builder/before-after/backyard-landscaping-after.png"
              alt="Finished Kansas City backyard with new sod, a paver walkway, edged planting beds, and path lights"
              className={styles.baImgLayer}
              fill
              sizes="(max-width: 900px) 100vw, 42vw"
              loading="lazy"
              quality={80}
              draggable={false}
            />

            {/* Before Image (Clipped overlay) */}
            <div
              className={styles.baBeforeClip}
              style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
            >
              <Image
                src="/media/website-builder/before-after/backyard-landscaping-before.png"
                alt="The same Kansas City backyard before renovation, with patchy grass, weeds, and a cracked concrete walkway"
                className={styles.baImgLayer}
                fill
                sizes="(max-width: 900px) 100vw, 42vw"
                loading="lazy"
                quality={80}
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
