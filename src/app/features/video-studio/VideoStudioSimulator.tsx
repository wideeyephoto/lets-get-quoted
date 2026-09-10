'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './video-studio.module.css';

type TimestampItem = {
  time: string;
  seconds: number;
  note: string;
  detail: string;
  cost: string;
  hud: {
    top: string;
    left: string;
    width: string;
    height: string;
    label: string;
    color: string;
  };
};

type StudioScenario = {
  id: string;
  label: string;
  videoTitle: string;
  specs: string;
  duration: number;
  durationFormatted: string;
  quoteId: string;
  quoteTitle: string;
  timestamps: TimestampItem[];
  lineItems: { name: string; cost: string }[];
  quoteTotal: string;
  codecBreakdown: {
    format: string;
    bitrate: string;
    mobileScore: string;
    safariStatus: string;
    guardrailStatus: string;
  };
  jsonLdSnippet: string;
};

const STUDIO_SCENARIOS: StudioScenario[] = [
  {
    id: 'walkthrough-video',
    label: '🎥 45s Kitchen Walkthrough',
    videoTitle: 'Kitchen-Remodel-Walkthrough.mov',
    specs: '1080p 60fps · 34.2 MB · Duration: 0:45 · 4K 60FPS',
    duration: 45,
    durationFormatted: '0:45',
    quoteId: 'Quote #1056',
    quoteTitle: 'Quote #1056 · Kitchen Remodel Scope',
    timestamps: [
      {
        time: '0:12',
        seconds: 12,
        note: '18ft Upper Cabinet Demo',
        detail: '18 Linear Ft Oak Upper Cabinets · Demolish & Dispose',
        cost: '$450.00',
        hud: {
          top: '16%',
          left: '18%',
          width: '64%',
          height: '34%',
          label: '✦ AI TAKEOFF: 18ft Upper Cabinet Demo ($450)',
          color: '#f59e0b',
        },
      },
      {
        time: '0:28',
        seconds: 28,
        note: 'Relocate 4 Recessed Cans',
        detail: 'Relocate 4x 6-inch Recessed LED Cans 14ft west',
        cost: '$680.00',
        hud: {
          top: '8%',
          left: '26%',
          width: '48%',
          height: '24%',
          label: '✦ AI SCOPE: Relocate 4 Recessed Cans ($680)',
          color: '#38bdf8',
        },
      },
      {
        time: '0:42',
        seconds: 42,
        note: 'Drywall Patch around Soffit',
        detail: '32 sq ft Level 4 Drywall Patch & Prime at Soffit',
        cost: '$380.00',
        hud: {
          top: '44%',
          left: '30%',
          width: '46%',
          height: '40%',
          label: '✦ AI REPAIR: Drywall Patch around Soffit ($380)',
          color: '#34d399',
        },
      },
    ],
    lineItems: [
      { name: '18ft Upper Cabinet Demolition & Haul-away', cost: '$450.00' },
      { name: 'Relocate 4 Recessed Cans (14/2 Romex + Junction)', cost: '$680.00' },
      { name: 'Drywall Patch & Level 4 Finish around Soffit', cost: '$380.00' },
    ],
    quoteTotal: '$1,510.00',
    codecBreakdown: {
      format: 'H.264 High Profile / AAC Dual Stream',
      bitrate: '6.0 Mbps Adaptive',
      mobileScore: 'A+ (0.4s First Frame LCP)',
      safariStatus: 'iOS 16+ Metal Hardware Decoded',
      guardrailStatus: '34.2 MB (Passes 50MB clip limit)',
    },
    jsonLdSnippet: `{
  "@context": "https://schema.org",
  "@type": "VideoObject",
  "name": "Kitchen Remodel Walkthrough & Takeoff Scope",
  "description": "Multimodal AI video walkthrough extracting demolition, electrical, and drywall scope.",
  "duration": "PT0M45S",
  "hasPart": [
    {
      "@type": "Clip",
      "name": "18ft Upper Cabinet Demo",
      "startOffset": 12,
      "endOffset": 27
    },
    {
      "@type": "Clip",
      "name": "Relocate 4 Recessed Cans",
      "startOffset": 28,
      "endOffset": 41
    },
    {
      "@type": "Clip",
      "name": "Drywall Patch around Soffit",
      "startOffset": 42,
      "endOffset": 45
    }
  ]
}`,
  },
  {
    id: 'hero-video-reel',
    label: '🎬 Website Hero Video Reel',
    videoTitle: 'Austin-Roofing-Project-Story.mp4',
    specs: 'H.264 WebM/MP4 · 8.4 MB (Under 12MB limit) · 1920x1080',
    duration: 32,
    durationFormatted: '0:32',
    quoteId: 'Job #1062',
    quoteTitle: 'Job #1062 · Austin Roofing Reel',
    timestamps: [
      {
        time: '0:05',
        seconds: 5,
        note: 'Drone Ridge Cap Aerial',
        detail: 'Aerial Ridge Cap Inspection · 7/12 Pitch Verified',
        cost: '$820.00',
        hud: {
          top: '12%',
          left: '20%',
          width: '60%',
          height: '36%',
          label: '✦ DRONE VISION: 38ft Ridge Vent & Cap Inspection',
          color: '#38bdf8',
        },
      },
      {
        time: '0:18',
        seconds: 18,
        note: 'Architectural Shingle Laydown',
        detail: '32 SQ Architectural Shingles · 6 Nails/Shingle Spec',
        cost: '$8,450.00',
        hud: {
          top: '34%',
          left: '16%',
          width: '68%',
          height: '48%',
          label: '✦ CRAFTSMANSHIP: 32 SQ Moire Black Laydown',
          color: '#f59e0b',
        },
      },
      {
        time: '0:28',
        seconds: 28,
        note: 'Cleanup & Magnet Nail Sweep',
        detail: 'Double Magnet Ground Sweep · 0 Nails Remaining',
        cost: 'Included',
        hud: {
          top: '56%',
          left: '22%',
          width: '56%',
          height: '32%',
          label: '✦ GROUND SAFETY: Magnet Nail Sweep Verified',
          color: '#34d399',
        },
      },
    ],
    lineItems: [
      { name: '38 LF High-Profile Ridge Vent & Cap Shingles', cost: '$820.00' },
      { name: '32 SQ Architectural Lifetime Shingles + Underlay', cost: '$8,450.00' },
      { name: 'Double Magnet Yard Sweep & Magnetic Debris Haul', cost: '$0.00' },
    ],
    quoteTotal: '$9,270.00',
    codecBreakdown: {
      format: 'WebM (VP9) + MP4 (H.264) Dual Stream',
      bitrate: '2.1 Mbps Ultra-Lean',
      mobileScore: 'A+ (0.3s Sub-Second LCP)',
      safariStatus: 'Zero Battery Drain HW Acceleration',
      guardrailStatus: '8.4 MB (Passes ≤12MB Hero Cap)',
    },
    jsonLdSnippet: `{
  "@context": "https://schema.org",
  "@type": "VideoObject",
  "name": "Austin Architectural Roofing Project Story",
  "description": "Drone aerials, shingle laydown, and cleanup sweep.",
  "duration": "PT0M32S",
  "hasPart": [
    { "@type": "Clip", "name": "Drone Ridge Cap Aerial", "startOffset": 5, "endOffset": 17 },
    { "@type": "Clip", "name": "Architectural Shingle Laydown", "startOffset": 18, "endOffset": 27 },
    { "@type": "Clip", "name": "Cleanup & Magnet Nail Sweep", "startOffset": 28, "endOffset": 32 }
  ]
}`,
  },
  {
    id: 'testimonial-video',
    label: '📹 Client Video Review',
    videoTitle: 'Homeowner-Review-Bathroom.mp4',
    specs: '720p · 14.1 MB · Auto-Closed Captioned · 30 FPS',
    duration: 24,
    durationFormatted: '0:24',
    quoteId: 'Review #409',
    quoteTitle: 'Review #409 · Sarah Jenkins Verified',
    timestamps: [
      {
        time: '0:08',
        seconds: 8,
        note: '5-Star Quality Praise',
        detail: 'Homeowner: "They were clean, punctual, and the tile is flawless."',
        cost: '5.0 ★★★★★',
        hud: {
          top: '22%',
          left: '24%',
          width: '52%',
          height: '44%',
          label: '✦ VERIFIED REVIEW: 5-Star Recommendation',
          color: '#c084fc',
        },
      },
      {
        time: '0:18',
        seconds: 18,
        note: 'Completed 2 Days Early',
        detail: 'Finished 5-day schedule in 3 days with zero callbacks',
        cost: 'Zero Punchlist',
        hud: {
          top: '15%',
          left: '20%',
          width: '60%',
          height: '35%',
          label: '✦ TIMELINE AUDIT: Delivered 2 Days Early',
          color: '#34d399',
        },
      },
    ],
    lineItems: [
      { name: 'Master Bath Curbless Walk-in Shower Tile', cost: '$6,800.00' },
      { name: 'Double Vanity Floating Cabinet & Quartz Counter', cost: '$2,400.00' },
      { name: 'Frameless Heavy Glass Enclosure & Hardware', cost: '$1,350.00' },
    ],
    quoteTotal: '$10,550.00',
    codecBreakdown: {
      format: 'MP4 (H.264) + VTT Captions',
      bitrate: '3.8 Mbps Voice-Optimized',
      mobileScore: 'A (Instant Audio Stream)',
      safariStatus: 'Native iOS Video Playback',
      guardrailStatus: '14.1 MB (Well within 50MB review cap)',
    },
    jsonLdSnippet: `{
  "@context": "https://schema.org",
  "@type": "VideoObject",
  "name": "Homeowner Video Review · Master Bath Renovation",
  "description": "Verified 5-star customer review for bathroom remodel completed ahead of schedule.",
  "duration": "PT0M24S"
}`,
  },
];

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function VideoStudioSimulator() {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSeconds, setCurrentSeconds] = useState(12);
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5 | 2>(1);
  const [activeMode, setActiveMode] = useState<'scope' | 'codec' | 'seo'>('scope');

  const scenario = STUDIO_SCENARIOS[scenarioIdx] || STUDIO_SCENARIOS[0];
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setCurrentSeconds(scenario.timestamps[0]?.seconds || 0);
    setIsPlaying(false);
  }, [scenarioIdx, scenario]);

  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setCurrentSeconds((prev) => {
          const next = prev + 0.5 * playbackRate;
          if (next >= scenario.duration) {
            return 0;
          }
          return next;
        });
      }, 500);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, playbackRate, scenario.duration]);

  // Find active timestamp
  let activeTimestamp = scenario.timestamps[0];
  for (const ts of scenario.timestamps) {
    if (currentSeconds >= ts.seconds) {
      activeTimestamp = ts;
    }
  }

  const progressPercent = Math.min(100, Math.max(0, (currentSeconds / scenario.duration) * 100));

  const handleSeek = (seconds: number) => {
    setCurrentSeconds(seconds);
  };

  return (
    <div className={styles.studioSimulator}>
      {/* Header */}
      <div className={styles.studioHeader}>
        <div>
          <span className={styles.studioBadge}>⚡ Multimodal Video Studio</span>
          <h4 className={styles.studioTitle}>{scenario.videoTitle}</h4>
          <span className={styles.studioSub}>{scenario.specs}</span>
        </div>
        <span className={styles.confidencePill}>Hardware Accelerated · 60 FPS</span>
      </div>

      {/* Scenario Selector Tabs */}
      <div className={styles.scenarioTabs} role="tablist" aria-label="Select Video Scenario">
        {STUDIO_SCENARIOS.map((sc, idx) => {
          const isActive = scenarioIdx === idx;
          return (
            <button
              key={sc.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`${styles.scenarioTab} ${isActive ? styles.scenarioTabActive : ''}`}
              onClick={() => setScenarioIdx(idx)}
            >
              {sc.label}
            </button>
          );
        })}
      </div>

      {/* Interactive Video Viewport */}
      <div className={styles.videoViewportContainer}>
        {/* Top HUD Row */}
        <div className={styles.cameraHudTop}>
          <div className={styles.recIndicator}>
            <span className={styles.recDot} />
            <span>REC · 4K 60FPS</span>
          </div>
          <div className={styles.timecodePill}>
            {formatTime(currentSeconds)} / {scenario.durationFormatted}
          </div>
        </div>

        {/* Scene HUD Overlay Layer */}
        <div className={styles.sceneOverlayArea} aria-hidden="true">
          <div className={styles.cornerTopLeft} />
          <div className={styles.cornerTopRight} />
          <div className={styles.cornerBottomLeft} />
          <div className={styles.cornerBottomRight} />

          {activeTimestamp && (
            <div
              className={styles.hudReticle}
              style={{
                top: activeTimestamp.hud.top,
                left: activeTimestamp.hud.left,
                width: activeTimestamp.hud.width,
                height: activeTimestamp.hud.height,
                borderColor: activeTimestamp.hud.color,
              }}
            >
              <span
                className={styles.hudReticleLabel}
                style={{ background: activeTimestamp.hud.color }}
              >
                {activeTimestamp.hud.label}
              </span>
              <span className={styles.hudReticleDetail}>{activeTimestamp.detail}</span>
            </div>
          )}
        </div>

        {/* Bottom Controls Bar */}
        <div className={styles.controlsBar}>
          <div className={styles.controlsRow}>
            <button
              type="button"
              className={styles.playPauseBtn}
              onClick={() => setIsPlaying(!isPlaying)}
              aria-label={isPlaying ? 'Pause simulation' : 'Play simulation'}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>

            {/* Scrubber */}
            <div className={styles.scrubberWrapper}>
              <div className={styles.scrubberTrack}>
                <div
                  className={styles.scrubberProgress}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <input
                type="range"
                min="0"
                max={scenario.duration}
                step="0.5"
                value={currentSeconds}
                onChange={(e) => handleSeek(Number(e.target.value))}
                className={styles.scrubberInput}
                aria-label="Video scrubber"
              />
            </div>

            <button
              type="button"
              className={styles.speedToggle}
              onClick={() => setPlaybackRate((prev) => (prev === 1 ? 1.5 : prev === 1.5 ? 2 : 1))}
              aria-label="Change playback speed"
            >
              {playbackRate}x
            </button>
          </div>
        </div>
      </div>

      {/* Mode Toggle Bar */}
      <div className={styles.modeToggleBar} role="tablist" aria-label="Studio Inspection Mode">
        <button
          type="button"
          role="tab"
          aria-selected={activeMode === 'scope'}
          className={`${styles.modeBtn} ${activeMode === 'scope' ? styles.modeBtnActive : ''}`}
          onClick={() => setActiveMode('scope')}
        >
          📋 Scope &amp; Line Items
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeMode === 'codec'}
          className={`${styles.modeBtn} ${activeMode === 'codec' ? styles.modeBtnActive : ''}`}
          onClick={() => setActiveMode('codec')}
        >
          ⚡ Mobile Speed &amp; Codec Check
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeMode === 'seo'}
          className={`${styles.modeBtn} ${activeMode === 'seo' ? styles.modeBtnActive : ''}`}
          onClick={() => setActiveMode('seo')}
        >
          🏷️ Google Video SEO (JSON-LD)
        </button>
      </div>

      {/* Mode 1: Scope & Line Items */}
      {activeMode === 'scope' && (
        <>
          <div className={styles.timestampsGrid}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>
              CLICK ANY TIMESTAMP TO JUMP VIDEO &amp; INSPECT AI TAKEOFF:
            </span>
            {scenario.timestamps.map((ts) => {
              const isSelected = activeTimestamp?.time === ts.time;
              return (
                <div
                  key={ts.time}
                  className={`${styles.timestampRow} ${isSelected ? styles.timestampRowActive : ''}`}
                  onClick={() => handleSeek(ts.seconds)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') handleSeek(ts.seconds);
                  }}
                >
                  <div>
                    <span className={styles.timestampTag}>{ts.time}</span>
                    <strong style={{ color: '#0f172a' }}>{ts.note}</strong>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                      {ts.detail}
                    </div>
                  </div>
                  <span style={{ fontWeight: 750, color: '#0284c7' }}>{ts.cost}</span>
                </div>
              );
            })}
          </div>

          <div className={styles.quoteCard}>
            <div className={styles.quoteHead}>
              <span>{scenario.quoteTitle}</span>
              <span className={styles.quoteStatus}>✓ Auto-Drafted via Multimodal AI</span>
            </div>
            <div className={styles.quoteItems}>
              {scenario.lineItems.map((item) => (
                <div key={item.name} className={styles.quoteItem}>
                  <span>{item.name}</span>
                  <strong>{item.cost}</strong>
                </div>
              ))}
            </div>
            <div className={styles.quoteTotalRow}>
              <span>Total Estimated Scope:</span>
              <span>{scenario.quoteTotal}</span>
            </div>
          </div>
        </>
      )}

      {/* Mode 2: Codec & Mobile Speed Check */}
      {activeMode === 'codec' && (
        <div className={styles.codecSpecsGrid}>
          <div className={styles.codecSpecCard}>
            <span className={styles.codecLabel}>Container &amp; Codec</span>
            <span className={styles.codecValue}>{scenario.codecBreakdown.format}</span>
          </div>
          <div className={styles.codecSpecCard}>
            <span className={styles.codecLabel}>Adaptive Bitrate</span>
            <span className={styles.codecValue}>{scenario.codecBreakdown.bitrate}</span>
          </div>
          <div className={styles.codecSpecCard}>
            <span className={styles.codecLabel}>Mobile First-Frame Speed</span>
            <span className={styles.codecValue}>{scenario.codecBreakdown.mobileScore}</span>
          </div>
          <div className={styles.codecSpecCard}>
            <span className={styles.codecLabel}>iOS Safari Hardware Decoder</span>
            <span className={styles.codecValue}>{scenario.codecBreakdown.safariStatus}</span>
          </div>
          <div className={styles.codecSpecCard}>
            <span className={styles.codecLabel}>Weight Guardrail Status</span>
            <span className={styles.codecValue} style={{ color: '#16a34a' }}>
              {scenario.codecBreakdown.guardrailStatus}
            </span>
          </div>
        </div>
      )}

      {/* Mode 3: Google Video SEO */}
      {activeMode === 'seo' && (
        <div>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '0.4rem' }}>
            AUTO-GENERATED SCHEMA.ORG VIDEOOBJECT STRUCTURED DATA:
          </span>
          <pre className={styles.codeBlock}>{scenario.jsonLdSnippet}</pre>
        </div>
      )}
    </div>
  );
}
