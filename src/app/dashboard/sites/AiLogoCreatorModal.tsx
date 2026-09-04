'use client';

import { useState, useMemo, useTransition, useEffect, useRef } from 'react';
import Image from 'next/image';
import {
  generateLogoConcepts,
  generateLogoSvg,
  LOGO_STYLE_LABELS,
  CURATED_COLOR_PALETTES,
  resolveGlyphForTrade,
  type LogoStyle,
  type LogoColorMode,
  type GeneratedLogo,
} from '@/lib/logo-creator';
import { AI_LOGO_DIRECTIONS, type AiLogoDirection } from '@/lib/logo-image-prompt';
import { SERVICE_ICON_GLYPHS } from '@/lib/templates/ServiceIcon';
import type { PendingAiLogo } from '@/lib/site-content';
import {
  generateAiLogoAction,
  generateLogoTaglinesAction,
  getAiLogosAction,
  deleteAiLogoAction,
  dismissAiLogoPendingAction,
  saveAdjustedAiLogoAction,
  type GeneratedAiLogo,
} from './actions';

const CREATIVE_PHASES = [
  {
    step: '01',
    title: 'Deconstructing brand brief & trade symbolism',
    detail: 'Translating industry marks, negative space cues, and custom brand personality…',
  },
  {
    step: '02',
    title: 'Forging geometric silhouette & emblem balance',
    detail: 'Iterating bold marks calibrated for work trucks, yard signs, and mobile headers…',
  },
  {
    step: '03',
    title: 'Harmonizing bespoke typography & hierarchy',
    detail: 'Refining letterforms, kerning, and visual weight for premium contractor branding…',
  },
  {
    step: '04',
    title: 'Rendering high-resolution vector geometry & palette',
    detail: 'Infusing primary accents and balanced contrast into production artwork…',
  },
  {
    step: '05',
    title: 'Resolving transparent alpha channel & production asset',
    detail: 'Finalizing clean transparent edges for seamless dark and light background use…',
  },
];

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const AI_LOGO_STUDIO_STYLES = `
@keyframes aiLogoSpinSlow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes aiLogoSpinReverse {
  from { transform: rotate(360deg); }
  to { transform: rotate(0deg); }
}

@keyframes aiLogoPulseGlow {
  0%, 100% {
    opacity: 0.42;
    transform: scale(0.96);
  }
  50% {
    opacity: 0.88;
    transform: scale(1.1);
  }
}

@keyframes aiLogoSparkPulse {
  0%, 100% {
    transform: scale(1) rotate(0deg);
    opacity: 0.95;
    filter: drop-shadow(0 0 8px rgba(168,85,247,0.5));
  }
  50% {
    transform: scale(1.18) rotate(10deg);
    opacity: 1;
    filter: drop-shadow(0 0 20px rgba(168,85,247,0.85));
  }
}

@keyframes aiLogoShimmerBar {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(250%);
  }
}

@keyframes aiLogoDotBlink {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.3; transform: scale(0.8); }
}

.ai-logo-studio-modal {
  background: var(--bg-2, #ffffff);
  color: var(--text, #0f172a);
}

.ai-logo-studio-modal input[type="text"],
.ai-logo-studio-modal select,
.ai-logo-studio-modal textarea {
  background: var(--bg-2, #ffffff);
  color: var(--text, #0f172a);
  border-color: var(--line, #cbd5e1);
}

.ai-logo-studio-checkerboard {
  background-color: var(--bg-3, #f8fafc);
  background-image: linear-gradient(45deg, rgba(var(--tint, 15, 23, 42), 0.08) 25%, transparent 25%),
                    linear-gradient(-45deg, rgba(var(--tint, 15, 23, 42), 0.08) 25%, transparent 25%),
                    linear-gradient(45deg, transparent 75%, rgba(var(--tint, 15, 23, 42), 0.08) 75%),
                    linear-gradient(-45deg, transparent 75%, rgba(var(--tint, 15, 23, 42), 0.08) 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
}
`;

function AiArtDirectorLoadingState({
  variant = 'hero',
  elapsedSeconds,
}: {
  variant?: 'hero' | 'card';
  elapsedSeconds: number;
}) {
  const phaseIndex = Math.min(CREATIVE_PHASES.length - 1, Math.floor(elapsedSeconds / 22));
  const currentPhase = CREATIVE_PHASES[phaseIndex];

  const progressPercent = Math.min(
    96,
    Math.max(
      8,
      elapsedSeconds < 20
        ? Math.round(8 + (elapsedSeconds / 20) * 32)
        : elapsedSeconds < 60
          ? Math.round(40 + ((elapsedSeconds - 20) / 40) * 35)
          : Math.round(75 + ((elapsedSeconds - 60) / 60) * 21)
    )
  );

  const milestones = [
    { label: 'Bespoke Concept', icon: '✦', active: phaseIndex >= 0 },
    { label: 'Vector Silhouette', icon: '◬', active: phaseIndex >= 1 },
    { label: 'Brand Typography', icon: 'Aa', active: phaseIndex >= 2 },
    { label: 'Transparent PNG', icon: '❖', active: phaseIndex >= 3 },
  ];

  if (variant === 'card') {
    return (
      <div
        style={{
          borderRadius: '16px',
          padding: '1.25rem 1.4rem',
          background:
            'radial-gradient(circle at 18% 22%, rgba(124, 58, 237, 0.32), transparent 45%), linear-gradient(145deg, #090d16 0%, #1e1b4b 60%, #172554 100%)',
          color: '#ffffff',
          boxShadow: '0 16px 36px rgba(15, 23, 42, 0.28)',
          border: '1px solid rgba(167, 139, 250, 0.28)',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
          {/* Orbital Spinner Emblem */}
          <div
            style={{
              position: 'relative',
              width: '52px',
              height: '52px',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: '-6px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(168,85,247,0.5), transparent 70%)',
                animation: 'aiLogoPulseGlow 2.8s ease-in-out infinite',
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: '2px dashed rgba(196,181,253,0.5)',
                animation: 'aiLogoSpinSlow 12s linear infinite',
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: '4px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #7c3aed, #4338ca)',
                border: '1px solid rgba(255,255,255,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 6px 16px rgba(109,40,217,0.4)',
              }}
            >
              <span
                style={{
                  fontSize: '1.35rem',
                  color: '#ffffff',
                  animation: 'aiLogoSparkPulse 2.4s ease-in-out infinite',
                }}
              >
                ✦
              </span>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <strong style={{ fontSize: '1.05rem', fontWeight: 900, color: '#ffffff' }}>
                Your AI art director is building a fresh identity
              </strong>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: 'rgba(167,139,250,0.18)',
                  border: '1px solid rgba(196,181,253,0.3)',
                  color: '#c4b5fd',
                  fontSize: '0.7rem',
                  fontWeight: 800,
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#4ade80',
                    animation: 'aiLogoDotBlink 1.4s ease-in-out infinite',
                  }}
                />
                ⏱ {formatElapsed(elapsedSeconds)}
              </span>
            </div>
            <p style={{ margin: 0, color: '#c4b5fd', fontSize: '0.8rem', lineHeight: 1.5 }}>
              Concept, silhouette, typography, and transparent production artwork are being resolved together. This can take up to two minutes.
            </p>
          </div>
        </div>

        {/* Progress Bar & Current Phase */}
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '0.75rem 0.9rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem', fontSize: '0.72rem' }}>
            <span style={{ color: '#e2e8f0', fontWeight: 700 }}>
              <span style={{ color: '#a78bfa', fontWeight: 800, marginRight: '0.35rem' }}>PHASE {currentPhase.step}</span>
              {currentPhase.title}
            </span>
            <span style={{ color: '#94a3b8', fontWeight: 700 }}>{progressPercent}%</span>
          </div>

          <div
            style={{
              height: '6px',
              borderRadius: '999px',
              background: 'rgba(255,255,255,0.1)',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progressPercent}%`,
                background: 'linear-gradient(90deg, #7c3aed, #6366f1, #38bdf8)',
                borderRadius: '999px',
                position: 'relative',
                transition: 'width 0.8s ease',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.7) 50%, transparent 100%)',
                  animation: 'aiLogoShimmerBar 1.8s infinite',
                }}
              />
            </div>
          </div>
        </div>

        {/* Milestones */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
          {milestones.map((m) => (
            <span
              key={m.label}
              style={{
                padding: '0.25rem 0.6rem',
                borderRadius: '999px',
                border: m.active ? '1px solid rgba(196,181,253,0.45)' : '1px solid rgba(255,255,255,0.1)',
                background: m.active ? 'rgba(124,58,237,0.24)' : 'rgba(255,255,255,0.03)',
                color: m.active ? '#e0e7ff' : '#64748b',
                fontSize: '0.68rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                transition: 'all 0.3s ease',
              }}
            >
              <span style={{ color: m.active ? '#a78bfa' : '#475569' }}>{m.icon}</span>
              {m.label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // Hero Variant (when aiConcepts.length === 0)
  return (
    <div
      style={{
        minHeight: '520px',
        borderRadius: '20px',
        padding: '3rem 1.5rem',
        background:
          'radial-gradient(circle at 50% 25%, rgba(124, 58, 237, 0.32), transparent 48%), radial-gradient(circle at 80% 85%, rgba(37, 99, 235, 0.22), transparent 44%), linear-gradient(155deg, #090d16 0%, #17153a 52%, #0e1e38 100%)',
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        boxShadow: '0 24px 60px rgba(10, 13, 26, 0.45)',
        border: '1px solid rgba(167, 139, 250, 0.22)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Studio Emblem / Ring */}
      <div
        style={{
          position: 'relative',
          width: '108px',
          height: '108px',
          marginBottom: '1.75rem',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: '-18px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(168,85,247,0.55), rgba(79,70,229,0.2) 60%, transparent 75%)',
            animation: 'aiLogoPulseGlow 3s ease-in-out infinite',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '2px dashed rgba(196,181,253,0.45)',
            animation: 'aiLogoSpinSlow 18s linear infinite',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: '6px',
            borderRadius: '50%',
            border: '2px solid transparent',
            borderTopColor: '#c084fc',
            borderRightColor: '#60a5fa',
            animation: 'aiLogoSpinReverse 8s linear infinite',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: '12px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(124,58,237,0.9), rgba(67,56,202,0.95))',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.28)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(79,70,229,0.5)',
          }}
        >
          <span
            style={{
              fontSize: '2.1rem',
              color: '#ffffff',
              animation: 'aiLogoSparkPulse 2.4s ease-in-out infinite',
            }}
          >
            ✦
          </span>
        </div>
      </div>

      {/* Eyebrow */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.45rem',
          padding: '0.35rem 0.85rem',
          borderRadius: '999px',
          background: 'rgba(167,139,250,0.12)',
          border: '1px solid rgba(196,181,253,0.25)',
          color: '#c4b5fd',
          fontSize: '0.72rem',
          fontWeight: 800,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          marginBottom: '1rem',
        }}
      >
        <span
          style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: '#4ade80',
            animation: 'aiLogoDotBlink 1.4s ease-in-out infinite',
          }}
        />
        STUDIO IN SESSION • RESOLVING BRAND IDENTITY
      </div>

      {/* Required Exact Headline */}
      <h3
        style={{
          maxWidth: '640px',
          margin: '0 0 0.75rem',
          fontSize: 'clamp(1.5rem, 3.2vw, 2.15rem)',
          fontWeight: 900,
          lineHeight: 1.18,
          letterSpacing: '-0.03em',
          color: '#ffffff',
        }}
      >
        Your AI art director is building a fresh identity
      </h3>

      {/* Required Exact Description */}
      <p
        style={{
          maxWidth: '560px',
          margin: '0 0 1.75rem',
          color: '#cbd5e1',
          fontSize: '0.92rem',
          lineHeight: 1.65,
        }}
      >
        Concept, silhouette, typography, and transparent production artwork are being resolved together. This can take up to two minutes.
      </p>

      {/* Progress Track */}
      <div style={{ width: '100%', maxWidth: '480px', marginBottom: '1.25rem' }}>
        <div
          style={{
            height: '8px',
            borderRadius: '999px',
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.12)',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progressPercent}%`,
              background: 'linear-gradient(90deg, #7c3aed, #6366f1, #38bdf8)',
              borderRadius: '999px',
              position: 'relative',
              transition: 'width 0.8s ease',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.7) 50%, transparent 100%)',
                animation: 'aiLogoShimmerBar 1.8s infinite',
              }}
            />
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '0.5rem',
            fontSize: '0.74rem',
            color: '#94a3b8',
          }}
        >
          <span>⏱ {formatElapsed(elapsedSeconds)} elapsed</span>
          <span style={{ color: '#c4b5fd', fontWeight: 700 }}>{progressPercent}% resolved</span>
        </div>
      </div>

      {/* Active Phase Card */}
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          padding: '0.9rem 1.2rem',
          borderRadius: '12px',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          marginBottom: '1.5rem',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <span
            style={{
              background: '#7c3aed',
              color: '#ffffff',
              padding: '2px 7px',
              borderRadius: '5px',
              fontSize: '0.66rem',
              fontWeight: 800,
              letterSpacing: '0.05em',
            }}
          >
            PHASE {currentPhase.step}
          </span>
          <span style={{ color: '#ffffff', fontSize: '0.84rem', fontWeight: 700 }}>
            {currentPhase.title}
          </span>
        </div>
        <div style={{ color: '#94a3b8', fontSize: '0.75rem', lineHeight: 1.45 }}>
          {currentPhase.detail}
        </div>
      </div>

      {/* Milestone Badges */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.55rem', maxWidth: '580px' }}>
        {milestones.map((m) => (
          <span
            key={m.label}
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: '999px',
              border: m.active ? '1px solid rgba(196,181,253,0.45)' : '1px solid rgba(255,255,255,0.1)',
              background: m.active ? 'rgba(124,58,237,0.22)' : 'rgba(255,255,255,0.04)',
              color: m.active ? '#e0e7ff' : '#64748b',
              fontSize: '0.74rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              transition: 'all 0.3s ease',
            }}
          >
            <span style={{ color: m.active ? '#a78bfa' : '#475569', fontSize: '0.75rem' }}>{m.icon}</span>
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  businessName: string;
  trade?: string | null;
  accentColor?: string | null;
  aiCredits?: number | null;
  onRefreshCredits?: () => void;
  onSelectLogo: (logoSvg: string, logoDataUri: string) => void;
  savedLogos?: GeneratedAiLogo[];
  onLogosChange?: (logos: GeneratedAiLogo[]) => void;
  pendingGeneration?: PendingAiLogo | null;
  onPendingChange?: (pending: PendingAiLogo | null) => void;
};

type ViewTab = 'ai' | 'concepts';

export default function AiLogoCreatorModal({
  open,
  onClose,
  businessName: initialName,
  trade,
  accentColor: initialAccent,
  aiCredits,
  onRefreshCredits,
  onSelectLogo,
  savedLogos = [],
  onLogosChange,
  pendingGeneration = null,
  onPendingChange,
}: Props) {
  const [name, setName] = useState(initialName || "Let's Get Quoted");
  const [tagline, setTagline] = useState('');
  const [year, setYear] = useState('2026');
  const [accent, setAccent] = useState(initialAccent || '#2563eb');
  const [secondary, setSecondary] = useState('#f59e0b');
  const [colorMode, setColorMode] = useState<LogoColorMode>('color');
  const [selectedGlyphKey, setSelectedGlyphKey] = useState<string>(() => resolveGlyphForTrade(trade));
  const [glyphPickerOpen, setGlyphPickerOpen] = useState(false);
  const [glyphSearch, setGlyphSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<LogoStyle | 'all'>('all');
  const [activeTab, setActiveTab] = useState<ViewTab>('ai');
  const [creativeBrief, setCreativeBrief] = useState('');
  const [aiDirection, setAiDirection] = useState<AiLogoDirection>('art_director');
  const [aiConcepts, setAiConcepts] = useState<GeneratedAiLogo[]>(() => savedLogos);
  const [selectedAiLogoId, setSelectedAiLogoId] = useState<string | null>(() => savedLogos[0]?.id ?? null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [deletingLogoId, setDeletingLogoId] = useState<string | null>(null);
  const [localPending, setLocalPending] = useState<PendingAiLogo | null>(null);

  // AI Remix / Iteration state
  const [remixingLogo, setRemixingLogo] = useState<GeneratedAiLogo | null>(null);
  const [remixPrompt, setRemixPrompt] = useState('');

  // Client-side Canvas Quick Adjust state (0 AI credits)
  const [adjustingLogo, setAdjustingLogo] = useState<GeneratedAiLogo | null>(null);
  const [adjustHue, setAdjustHue] = useState(0);
  const [adjustSaturation, setAdjustSaturation] = useState(100);
  const [adjustBrightness, setAdjustBrightness] = useState(100);
  const [adjustContrast, setAdjustContrast] = useState(100);
  const [isWhiteDecal, setIsWhiteDecal] = useState(false);
  const [isBlackSilhouette, setIsBlackSilhouette] = useState(false);
  const [adjustPreviewBg, setAdjustPreviewBg] = useState<'checkered' | 'dark' | 'light'>('checkered');
  const [isSavingAdjusted, setIsSavingAdjusted] = useState(false);
  const adjustCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isAdjustBackdropMouseDownRef = useRef(false);
  const isRemixBackdropMouseDownRef = useRef(false);

  // Sync when savedLogos prop updates from parent
  useEffect(() => {
    if (savedLogos && savedLogos.length > 0) {
      setAiConcepts(savedLogos);
      setSelectedAiLogoId((prev) => prev ?? savedLogos[0]?.id ?? null);
    }
  }, [savedLogos]);

  // Load latest AI logos & pending task when modal opens
  useEffect(() => {
    if (!open) return;
    let isMounted = true;
    getAiLogosAction().then((res) => {
      if (!isMounted) return;
      if (res.logos && res.logos.length > 0) {
        setAiConcepts(res.logos);
        onLogosChange?.(res.logos);
        setSelectedAiLogoId((prev) => prev ?? res.logos[0]?.id ?? null);
      }
      if (res.pending) {
        setLocalPending(res.pending);
        onPendingChange?.(res.pending);
        if (res.pending.status === 'failed' && res.pending.error) {
          setAiError(res.pending.error);
        }
      }
    }).catch(() => {});
    return () => { isMounted = false; };
  }, [open, onLogosChange, onPendingChange]);

  const [suggestedTaglines, setSuggestedTaglines] = useState<string[]>([]);
  const [taglineError, setTaglineError] = useState<string | null>(null);
  const [isGeneratingAi, startAiTransition] = useTransition();
  const [isGeneratingImage, startImageTransition] = useTransition();
  const [downloadingKit, setDownloadingKit] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const effectivePending = localPending || pendingGeneration;
  const isGenerating = isGeneratingImage || (effectivePending?.status === 'pending');
  const isAiOfflineOrBroken = Boolean(
    aiError ||
    effectivePending?.status === 'failed' ||
    (typeof aiCredits === 'number' && aiCredits <= 0)
  );
  const showEditableVectors = isAiOfflineOrBroken || activeTab === 'concepts';

  useEffect(() => {
    if (!isGenerating) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = effectivePending?.startedAt ? Date.parse(effectivePending.startedAt) : Date.now();
    const tick = () => {
      const ms = Date.now() - (Number.isNaN(startedAt) ? Date.now() : startedAt);
      setElapsedSeconds(Math.max(0, Math.floor(ms / 1000)));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isGenerating, effectivePending?.startedAt]);

  // Background polling while pending generation is active and modal is open
  useEffect(() => {
    if (!open || !effectivePending || effectivePending.status !== 'pending') return;
    const poller = setInterval(async () => {
      try {
        const res = await getAiLogosAction();
        if (res.logos && res.logos.length > 0) {
          setAiConcepts(res.logos);
          onLogosChange?.(res.logos);
        }
        if (!res.pending || res.pending.status !== 'pending') {
          setLocalPending(null);
          onPendingChange?.(res.pending ?? null);
          if (res.pending?.status === 'failed') {
            setAiError(res.pending.error || 'AI logo generation was unable to complete.');
          }
        }
      } catch {
        // Keep polling
      }
    }, 2500);
    return () => clearInterval(poller);
  }, [open, effectivePending, onLogosChange, onPendingChange]);

  useEffect(() => {
    if (!adjustingLogo || !adjustCanvasRef.current) return;
    let active = true;
    let objectUrl = '';
    const canvas = adjustCanvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    (async () => {
      try {
        let src = adjustingLogo.url;
        try {
          const res = await fetch(adjustingLogo.url);
          if (res.ok) {
            const blob = await res.blob();
            if (!active) return;
            objectUrl = URL.createObjectURL(blob);
            src = objectUrl;
          }
        } catch {
          // fallback to original url
        }

        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          if (!active) return;
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          if (isWhiteDecal || isBlackSilhouette) {
            ctx.drawImage(img, 0, 0);
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;
            const targetColor = isWhiteDecal ? 255 : 0;
            for (let i = 0; i < data.length; i += 4) {
              const alpha = data[i + 3];
              if (alpha > 15) {
                data[i] = targetColor;
                data[i + 1] = targetColor;
                data[i + 2] = targetColor;
              }
            }
            ctx.putImageData(imgData, 0, 0);
          } else {
            ctx.filter = `hue-rotate(${adjustHue}deg) saturate(${adjustSaturation}%) brightness(${adjustBrightness}%) contrast(${adjustContrast}%)`;
            ctx.drawImage(img, 0, 0);
            ctx.filter = 'none';
          }
        };
        img.src = src;
      } catch (err) {
        console.error('Failed to render canvas adjustment', err);
      }
    })();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [adjustingLogo, adjustHue, adjustSaturation, adjustBrightness, adjustContrast, isWhiteDecal, isBlackSilhouette]);

  const concepts = useMemo(() => {
    return generateLogoConcepts({
      businessName: name,
      trade,
      tagline: tagline || null,
      establishedYear: year || null,
      accentColor: accent,
      secondaryColor: secondary,
      iconGlyphKey: selectedGlyphKey,
      colorMode,
      styles:
        activeFilter === 'all'
          ? ['modern_shield', 'vintage_stamp', 'minimal_monogram', 'hexagon_badge', 'dynamic_motion']
          : [activeFilter],
    });
  }, [name, trade, tagline, year, accent, secondary, selectedGlyphKey, colorMode, activeFilter]);

  const activeAiLogo = aiConcepts.find((concept) => concept.id === selectedAiLogoId) ?? aiConcepts[0] ?? null;

  if (!open) return null;

  function handleSelectPalette(p: typeof CURATED_COLOR_PALETTES[0]) {
    setAccent(p.primary);
    setSecondary(p.secondary);
  }

  function handleTriggerAiSlogans() {
    setTaglineError(null);
    startAiTransition(async () => {
      try {
        const res = await generateLogoTaglinesAction({
          companyName: name || "Let's Get Quoted",
          trade: trade || 'Contractor',
        });
        const taglines = res.taglines && res.taglines.length > 0 ? res.taglines : null;
        if (taglines) {
          setSuggestedTaglines(taglines);
          if (!tagline) {
            setTagline(taglines[0]);
          }
          onRefreshCredits?.();
        } else if (!res.ok) {
          setTaglineError(res.message || 'Could not generate taglines.');
        }
      } catch (err) {
        setTaglineError(err instanceof Error ? err.message : 'Could not generate taglines.');
      }
    });
  }

  function handleGenerateAiLogo() {
    setAiError(null);
    const pendingRecord: PendingAiLogo = {
      id: `pending-${Date.now()}`,
      startedAt: new Date().toISOString(),
      prompt: creativeBrief || name,
      direction: aiDirection,
      status: 'pending',
    };
    setLocalPending(pendingRecord);
    onPendingChange?.(pendingRecord);

    startImageTransition(async () => {
      const result = await generateAiLogoAction({
        businessName: name,
        trade,
        tagline: tagline || null,
        establishedYear: year || null,
        accentColor: accent,
        secondaryColor: secondary,
        emblem: activeTab === 'concepts' ? selectedGlyphKey : null,
        direction: aiDirection,
        creativeBrief: creativeBrief || null,
      });

      setLocalPending(null);
      onPendingChange?.(null);

      if (!result.ok || !result.image) {
        setAiError(result.message || 'Could not generate a logo right now.');
        return;
      }

      const updated = result.logos || [result.image, ...aiConcepts.filter((c) => c.id !== result.image!.id)];
      setAiConcepts(updated);
      onLogosChange?.(updated);
      setSelectedAiLogoId(result.image.id);
      onRefreshCredits?.();
    });
  }

  async function handleDeleteAiLogo(logo: GeneratedAiLogo) {
    if (!window.confirm('Delete this AI logo concept? This permanently removes the file from your brand studio.')) {
      return;
    }
    setDeletingLogoId(logo.id);
    try {
      const res = await deleteAiLogoAction(logo.storagePath || '', logo.id);
      if (res.ok && res.logos) {
        setAiConcepts(res.logos);
        onLogosChange?.(res.logos);
        if (selectedAiLogoId === logo.id) {
          setSelectedAiLogoId(res.logos[0]?.id ?? null);
        }
      } else {
        const next = aiConcepts.filter((item) => item.id !== logo.id);
        setAiConcepts(next);
        onLogosChange?.(next);
        if (selectedAiLogoId === logo.id) {
          setSelectedAiLogoId(next[0]?.id ?? null);
        }
      }
      onRefreshCredits?.();
    } catch (err) {
      console.error('Failed to delete logo', err);
      alert('Could not delete logo. Please try again.');
    } finally {
      setDeletingLogoId(null);
    }
  }

  async function handleDownloadAiLogo(logo: GeneratedAiLogo) {
    const fileName = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'brand'}-ai-logo.png`;
    try {
      const response = await fetch(logo.url);
      if (!response.ok) throw new Error(`Download failed (${response.status})`);
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch {
      window.open(logo.url, '_blank', 'noopener,noreferrer');
    }
  }

  function handleGenerateRemixLogo() {
    if (!remixingLogo) return;
    const target = remixingLogo;
    const promptText = remixPrompt.trim();
    if (!promptText) return;

    setAiError(null);
    const pendingRecord: PendingAiLogo = {
      id: `pending-${Date.now()}`,
      startedAt: new Date().toISOString(),
      prompt: `Revision: ${promptText}`,
      direction: target.direction,
      status: 'pending',
    };
    setLocalPending(pendingRecord);
    onPendingChange?.(pendingRecord);
    setRemixingLogo(null);
    setRemixPrompt('');

    startImageTransition(async () => {
      const result = await generateAiLogoAction({
        businessName: name,
        trade,
        tagline: tagline || null,
        establishedYear: year || null,
        accentColor: accent,
        secondaryColor: secondary,
        emblem: activeTab === 'concepts' ? selectedGlyphKey : null,
        direction: target.direction,
        creativeBrief: creativeBrief || null,
        parentLogoId: target.id,
        revisionInstructions: promptText,
      });

      setLocalPending(null);
      onPendingChange?.(null);

      if (!result.ok || !result.image) {
        setAiError(result.message || 'Could not generate revised logo right now.');
        return;
      }

      const updated = result.logos || [result.image, ...aiConcepts.filter((c) => c.id !== result.image!.id)];
      setAiConcepts(updated);
      onLogosChange?.(updated);
      setSelectedAiLogoId(result.image.id);
      onRefreshCredits?.();
    });
  }

  async function handleSaveAdjustedCanvasLogo() {
    if (!adjustingLogo || !adjustCanvasRef.current) return;
    const canvas = adjustCanvasRef.current;
    try {
      setIsSavingAdjusted(true);
      const base64Png = canvas.toDataURL('image/png');
      const label = isWhiteDecal
        ? 'White Decal'
        : isBlackSilhouette
        ? 'Black Silhouette'
        : 'Adjusted';
      const res = await saveAdjustedAiLogoAction({
        base64Png,
        originalLogoId: adjustingLogo.id,
        businessName: name,
        label,
      });

      if (res.ok && res.image) {
        const updated = res.logos || [res.image, ...aiConcepts.filter((c) => c.id !== res.image!.id)];
        setAiConcepts(updated);
        onLogosChange?.(updated);
        setSelectedAiLogoId(res.image.id);
        setAdjustingLogo(null);
      } else {
        alert(res.message || 'Could not save adjusted logo.');
      }
    } catch (err) {
      console.error('Failed to save adjusted logo', err);
      alert('Error saving adjusted logo.');
    } finally {
      setIsSavingAdjusted(false);
    }
  }

  function handleDownloadAdjustedCanvas() {
    if (!adjustCanvasRef.current) return;
    const label = isWhiteDecal ? 'white-decal' : isBlackSilhouette ? 'black-silhouette' : 'adjusted';
    const fileName = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'brand'}-${label}-logo.png`;
    const dataUrl = adjustCanvasRef.current.toDataURL('image/png');
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }

  function handleDownloadSvg(logo: GeneratedLogo, suffix = '') {
    const blob = new Blob([logo.svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-logo-${logo.style}${suffix}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function renderSvgToPng(svgStr: string, width: number, height: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('No canvas context');
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });
  }

  async function handleDownloadPng(logo: GeneratedLogo) {
    try {
      const pngDataUri = await renderSvgToPng(logo.svg, 1920, 660);
      const a = document.createElement('a');
      a.href = pngDataUri;
      a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-logo-${logo.style}-hd.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error('PNG conversion failed:', e);
      handleDownloadSvg(logo);
    }
  }

  async function handleDownloadBrandKit(logo: GeneratedLogo) {
    setDownloadingKit(true);
    try {
      // 1. Download Master Vector SVG
      handleDownloadSvg(logo, '-master');

      // 2. Download High-Res Color PNG
      const colorPng = await renderSvgToPng(logo.svg, 1920, 660);
      const a1 = document.createElement('a');
      a1.href = colorPng;
      a1.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-brand-hd.png`;
      document.body.appendChild(a1);
      a1.click();
      document.body.removeChild(a1);

      // 3. Download Inverted White Vinyl Decal SVG & PNG
      const whiteDecalSvg = generateLogoSvg({
        businessName: name,
        trade,
        tagline: tagline || null,
        establishedYear: year || null,
        accentColor: accent,
        secondaryColor: secondary,
        iconGlyphKey: selectedGlyphKey,
        style: logo.style,
        colorMode: 'white_decal',
      });
      const whiteDecalPng = await renderSvgToPng(whiteDecalSvg, 1920, 660);
      const a2 = document.createElement('a');
      a2.href = whiteDecalPng;
      a2.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-white-decal.png`;
      document.body.appendChild(a2);
      a2.click();
      document.body.removeChild(a2);
    } catch (err) {
      console.error('Brand kit export error:', err);
    } finally {
      setDownloadingKit(false);
    }
  }

  const allGlyphKeys = Object.keys(SERVICE_ICON_GLYPHS);
  const filteredGlyphKeys = allGlyphKeys.filter((k) =>
    k.toLowerCase().includes(glyphSearch.toLowerCase())
  );

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
        boxSizing: 'border-box',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !adjustingLogo && !remixingLogo && !glyphPickerOpen) {
          onClose();
        }
      }}
    >
      <div
        className="ai-logo-studio-modal"
        style={{
          background: 'var(--bg-2, #ffffff)',
          color: 'var(--text, #0f172a)',
          borderRadius: '16px',
          maxWidth: '1240px',
          width: '100%',
          height: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          border: '1px solid var(--line, rgba(255, 255, 255, 0.1))',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{AI_LOGO_STUDIO_STYLES}</style>
        {/* Header */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid var(--line, rgba(255, 255, 255, 0.08))',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--bg-2, #ffffff)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: '1.2rem',
                boxShadow: '0 4px 12px rgba(37,99,235,0.25)',
              }}
            >
              ✨
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: 'var(--text, #0f172a)' }}>
                  AI Logo &amp; Brand Studio
                </h2>
                {typeof aiCredits === 'number' && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.25rem 0.6rem',
                      borderRadius: '999px',
                      background: aiCredits <= 25 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                      border: aiCredits <= 25 ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(59, 130, 246, 0.35)',
                      color: aiCredits <= 25 ? '#f59e0b' : '#3b82f6',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                    }}
                  >
                    <span>⚡ {aiCredits.toLocaleString('en-US')} AI {aiCredits === 1 ? 'credit' : 'credits'}</span>
                    {aiCredits <= 25 ? (
                      <a href="/dashboard/settings#buy-credits" style={{ color: '#f59e0b', textDecoration: 'underline', marginLeft: '0.2rem' }}>
                        + Top up
                      </a>
                    ) : null}
                  </span>
                )}
              </div>
              <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
                Generate original brand concepts and apply them directly to your contractor website.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* View Tab Switcher */}
            <div style={{ background: 'rgba(var(--tint, 15, 23, 42), 0.08)', padding: '3px', borderRadius: '8px', display: 'flex', gap: '3px' }}>
              <button
                type="button"
                onClick={() => setActiveTab('ai')}
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeTab === 'ai' ? 'var(--bg-2, #ffffff)' : 'transparent',
                  color: activeTab === 'ai' ? '#a855f7' : 'var(--muted, #64748b)',
                  fontWeight: 800,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  boxShadow: activeTab === 'ai' ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                }}
              >
                ✦ AI Concept Lab
              </button>
              {showEditableVectors && (
                <button
                  type="button"
                  onClick={() => setActiveTab('concepts')}
                  style={{
                    padding: '0.4rem 0.85rem',
                    borderRadius: '6px',
                    border: 'none',
                    background: activeTab === 'concepts' ? 'var(--bg-2, #ffffff)' : 'transparent',
                    color: activeTab === 'concepts' ? 'var(--text, #0f172a)' : 'var(--muted, #64748b)',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    boxShadow: activeTab === 'concepts' ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <span>◇ Editable Vectors</span>
                  {isAiOfflineOrBroken && (
                    <span style={{ fontSize: '0.65rem', background: '#fef3c7', color: '#92400e', padding: '1px 5px', borderRadius: '4px', fontWeight: 800 }}>
                      Offline Fallback
                    </span>
                  )}
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(var(--tint, 15, 23, 42), 0.06)',
                border: '1px solid var(--line, transparent)',
                borderRadius: '8px',
                padding: '0.5rem 0.75rem',
                cursor: 'pointer',
                fontWeight: 700,
                color: 'var(--text, #475569)',
              }}
            >
              ✕ Close
            </button>
          </div>
        </div>

        {/* Main Body: Split Pane */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left Sidebar: Controls */}
          <div
            style={{
              width: '340px',
              borderRight: '1px solid var(--line, rgba(255, 255, 255, 0.08))',
              background: 'var(--bg-3, #f8fafc)',
              overflowY: 'auto',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              boxSizing: 'border-box',
            }}
          >
            {/* Business Name */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text, #334155)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Business Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Maplewood Plumbing"
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1.5px solid var(--line, #cbd5e1)', background: 'var(--bg-2, #ffffff)', color: 'var(--text, #0f172a)', fontSize: '0.9rem', fontWeight: 600, boxSizing: 'border-box' }}
              />
            </div>

            {/* Tagline + AI Generator */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text, #334155)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Tagline / Slogan
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={handleTriggerAiSlogans}
                    disabled={isGeneratingAi}
                    style={{
                      background: 'rgba(59, 130, 246, 0.12)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      borderRadius: '6px',
                      padding: '2px 8px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: '#3b82f6',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {isGeneratingAi ? '⏳ Generating...' : '✨ AI Slogans'}
                  </button>
                  {typeof aiCredits === 'number' && (
                    <span style={{ fontSize: '0.7rem', color: aiCredits <= 25 ? '#b45309' : 'var(--muted, #64748b)', fontWeight: 600 }}>
                      ⚡ {aiCredits.toLocaleString('en-US')}
                    </span>
                  )}
                </div>
              </div>
              <input
                type="text"
                value={tagline}
                placeholder="e.g. Heating, Cooling & Drain Experts"
                onChange={(e) => setTagline(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1.5px solid var(--line, #cbd5e1)', background: 'var(--bg-2, #ffffff)', color: 'var(--text, #0f172a)', fontSize: '0.9rem', boxSizing: 'border-box' }}
              />

              {taglineError && (
                <div style={{ marginTop: '0.35rem', fontSize: '0.72rem', color: '#ef4444', fontWeight: 600 }}>
                  ⚠️ {taglineError}
                </div>
              )}

              {/* AI Slogan Suggestions Pills */}
              {suggestedTaglines.length > 0 && (
                <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--muted, #64748b)', fontWeight: 700 }}>Pick an AI Slogan:</span>
                    <button
                      type="button"
                      onClick={() => setSuggestedTaglines([])}
                      style={{ border: 'none', background: 'transparent', color: 'var(--muted, #94a3b8)', fontSize: '0.68rem', cursor: 'pointer' }}
                    >
                      Dismiss
                    </button>
                  </div>
                  {suggestedTaglines.map((t, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setTagline(t)}
                      style={{
                        textAlign: 'left',
                        padding: '5px 8px',
                        background: tagline === t ? 'rgba(59, 130, 246, 0.18)' : 'var(--bg-2, #ffffff)',
                        border: tagline === t ? '1.5px solid #3b82f6' : '1px solid var(--line, #e2e8f0)',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        color: tagline === t ? '#60a5fa' : 'var(--text, #334155)',
                        fontWeight: tagline === t ? 700 : 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>&bull; {t}</span>
                      {tagline === t && <span style={{ fontSize: '0.75rem', color: '#3b82f6', fontWeight: 900 }}>✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {activeTab === 'ai' && (
              <div
                style={{
                  padding: '0.9rem',
                  borderRadius: '12px',
                  background: 'linear-gradient(145deg, rgba(168, 85, 247, 0.08), rgba(59, 130, 246, 0.08))',
                  border: '1px solid rgba(168, 85, 247, 0.25)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 900, color: '#a855f7', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Creative Direction
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                    {AI_LOGO_DIRECTIONS.map((direction) => (
                      <button
                        key={direction.id}
                        type="button"
                        onClick={() => setAiDirection(direction.id)}
                        title={direction.description}
                        style={{
                          padding: '0.45rem 0.5rem',
                          borderRadius: '7px',
                          border: aiDirection === direction.id ? '1.5px solid #a855f7' : '1px solid var(--line, rgba(168, 85, 247, 0.2))',
                          background: aiDirection === direction.id ? 'var(--bg-2, #ffffff)' : 'rgba(var(--tint, 15, 23, 42), 0.04)',
                          color: aiDirection === direction.id ? '#a855f7' : 'var(--muted, #475569)',
                          fontWeight: 800,
                          fontSize: '0.72rem',
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                      >
                        {direction.shortLabel}
                      </button>
                    ))}
                  </div>
                  <p style={{ margin: '5px 0 0', fontSize: '0.69rem', lineHeight: 1.35, color: 'var(--muted, #6b7280)' }}>
                    {AI_LOGO_DIRECTIONS.find((direction) => direction.id === aiDirection)?.description}
                  </p>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 900, color: '#a855f7', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Art Director Brief <span style={{ fontWeight: 600, color: 'var(--muted, #8b5cf6)' }}>(optional)</span>
                  </label>
                  <textarea
                    value={creativeBrief}
                    maxLength={600}
                    onChange={(event) => setCreativeBrief(event.target.value)}
                    placeholder="Try: An alpine peak hidden inside a lightning bolt. Confident, premium, no generic house roofs."
                    rows={3}
                    style={{ width: '100%', resize: 'vertical', padding: '0.55rem 0.65rem', borderRadius: '8px', border: '1.5px solid var(--line, #c4b5fd)', background: 'var(--bg-2, #ffffff)', color: 'var(--text, #1e1b4b)', fontSize: '0.8rem', lineHeight: 1.4, boxSizing: 'border-box' }}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleGenerateAiLogo}
                  disabled={isGenerating || !name.trim()}
                  style={{
                    width: '100%',
                    padding: '0.7rem 0.9rem',
                    border: 'none',
                    borderRadius: '9px',
                    background: isGenerating ? '#6d28d9' : 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                    color: '#ffffff',
                    fontWeight: 900,
                    fontSize: '0.86rem',
                    cursor: isGenerating ? 'wait' : 'pointer',
                    boxShadow: '0 7px 18px rgba(109,40,217,0.24)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.45rem',
                  }}
                >
                  {isGenerating ? (
                    <>
                      <span style={{ display: 'inline-block', animation: 'aiLogoSpinSlow 2.5s linear infinite' }}>✦</span>
                      <span>Building identity ({formatElapsed(elapsedSeconds)})…</span>
                    </>
                  ) : aiConcepts.length ? (
                    '✦ Generate Another Concept'
                  ) : (
                    '✦ Generate My First AI Logo'
                  )}
                </button>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
                  {typeof aiCredits === 'number' && (
                    <span style={{ fontSize: '0.72rem', color: aiCredits <= 25 ? '#f59e0b' : '#a855f7', fontWeight: 700 }}>
                      ⚡ {aiCredits.toLocaleString('en-US')} AI {aiCredits === 1 ? 'credit' : 'credits'} available
                      {aiCredits <= 25 ? (
                        <a href="/dashboard/settings#buy-credits" style={{ color: '#f59e0b', textDecoration: 'underline', marginLeft: '0.25rem' }}>
                          + Top up
                        </a>
                      ) : null}
                    </span>
                  )}
                  <span style={{ fontSize: '0.66rem', color: 'var(--muted, #6d28d9)', textAlign: 'right', lineHeight: 1.35, flex: '1 1 auto' }}>
                    Transparent, high-res PNG
                  </span>
                </div>
              </div>
            )}

            {/* Trade Icon Glyph Picker - ONLY needed when using editable vectors */}
            {activeTab === 'concepts' && (
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text, #334155)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Trade Emblem / Icon
                </label>
                <div
                  onClick={() => setGlyphPickerOpen(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0.75rem',
                    background: 'var(--bg-2, #ffffff)',
                    border: '1.5px solid var(--line, #cbd5e1)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div
                      style={{ width: '28px', height: '28px', background: 'rgba(var(--tint, 15, 23, 42), 0.06)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      dangerouslySetInnerHTML={{
                        __html: `<svg width="18" height="18" viewBox="0 0 24 24" fill="${SERVICE_ICON_GLYPHS[selectedGlyphKey]?.mode === 'fill' ? accent : 'none'}" stroke="${SERVICE_ICON_GLYPHS[selectedGlyphKey]?.mode === 'fill' ? 'none' : accent}" stroke-width="2">${SERVICE_ICON_GLYPHS[selectedGlyphKey]?.body ?? ''}</svg>`,
                      }}
                    />
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text, #0f172a)', textTransform: 'capitalize' }}>
                      {selectedGlyphKey}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#3b82f6', fontWeight: 700 }}>Browse 45+ ▾</span>
                </div>
              </div>
            )}

            {/* Curated Color Themes */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text, #334155)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Color Story Presets
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {CURATED_COLOR_PALETTES.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => handleSelectPalette(p)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.4rem 0.6rem',
                      background: accent === p.primary && secondary === p.secondary ? 'rgba(37, 99, 235, 0.18)' : 'var(--bg-2, #ffffff)',
                      border: accent === p.primary && secondary === p.secondary ? '1.5px solid #3b82f6' : '1px solid var(--line, rgba(255, 255, 255, 0.08))',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text, #334155)' }}>{p.name}</span>
                    <div style={{ display: 'flex', gap: '3px' }}>
                      <span style={{ width: '14px', height: '14px', borderRadius: '3px', background: p.primary }} />
                      <span style={{ width: '14px', height: '14px', borderRadius: '3px', background: p.secondary }} />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Colors & Established Year */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted, #475569)', marginBottom: '2px' }}>
                  Primary Accent
                </label>
                <input
                  type="color"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  style={{ width: '100%', height: '32px', padding: '2px', borderRadius: '6px', border: '1px solid var(--line, #cbd5e1)', cursor: 'pointer' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted, #475569)', marginBottom: '2px' }}>
                  Secondary / Gold
                </label>
                <input
                  type="color"
                  value={secondary}
                  onChange={(e) => setSecondary(e.target.value)}
                  style={{ width: '100%', height: '32px', padding: '2px', borderRadius: '6px', border: '1px solid var(--line, #cbd5e1)', cursor: 'pointer' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted, #475569)', marginBottom: '2px' }}>
                Est. Year
              </label>
              <input
                type="text"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--line, #cbd5e1)', background: 'var(--bg-2, #ffffff)', color: 'var(--text, #0f172a)', fontSize: '0.85rem', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Right Stage: Concepts */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-3, #f1f5f9)' }}>
            {/* View Mode Bar */}
            <div
              style={{
                padding: '0.65rem 1.25rem',
                background: 'var(--bg-2, #ffffff)',
                borderBottom: '1px solid var(--line, rgba(255,255,255,0.08))',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              {activeTab === 'ai' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                  <span style={{ padding: '3px 8px', borderRadius: '999px', background: 'rgba(124, 58, 237, 0.15)', color: '#c084fc', fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.04em' }}>
                    GPT IMAGE
                  </span>
                  <span style={{ color: 'var(--text, #475569)', fontSize: '0.78rem', fontWeight: 700 }}>
                    {AI_LOGO_DIRECTIONS.find((direction) => direction.id === aiDirection)?.label}
                  </span>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto' }}>
                  <button
                    type="button"
                    onClick={() => setActiveFilter('all')}
                    style={{
                      padding: '0.3rem 0.7rem',
                      borderRadius: '16px',
                      border: activeFilter === 'all' ? '1.5px solid #3b82f6' : '1px solid var(--line, #e2e8f0)',
                      background: activeFilter === 'all' ? 'rgba(37, 99, 235, 0.18)' : 'var(--bg-2, #ffffff)',
                      color: activeFilter === 'all' ? '#60a5fa' : 'var(--text, #475569)',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    All 5 Styles
                  </button>
                  {(Object.keys(LOGO_STYLE_LABELS) as LogoStyle[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setActiveFilter(st)}
                      style={{
                        padding: '0.3rem 0.7rem',
                        borderRadius: '16px',
                        border: activeFilter === st ? '1.5px solid #3b82f6' : '1px solid var(--line, #e2e8f0)',
                        background: activeFilter === st ? 'rgba(37, 99, 235, 0.18)' : 'var(--bg-2, #ffffff)',
                        color: activeFilter === st ? '#60a5fa' : 'var(--text, #475569)',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {LOGO_STYLE_LABELS[st]}
                    </button>
                  ))}
                </div>
              )}

              {/* Color Mode Switcher */}
              {activeTab !== 'ai' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted, #64748b)', fontWeight: 700 }}>Render Mode:</span>
                  <button
                    type="button"
                    onClick={() => setColorMode('color')}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '4px',
                      border: colorMode === 'color' ? '1.5px solid #3b82f6' : '1px solid var(--line, #cbd5e1)',
                      background: colorMode === 'color' ? 'rgba(37, 99, 235, 0.18)' : 'var(--bg-2, #ffffff)',
                      color: colorMode === 'color' ? '#60a5fa' : 'var(--text, #334155)',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    ☀️ Light
                  </button>
                  <button
                    type="button"
                    onClick={() => setColorMode('dark')}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '4px',
                      border: colorMode === 'dark' ? '1.5px solid #3b82f6' : '1px solid var(--line, #cbd5e1)',
                      background: colorMode === 'dark' ? '#1e293b' : 'var(--bg-2, #ffffff)',
                      color: colorMode === 'dark' ? '#ffffff' : 'var(--text, #334155)',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    🌙 Dark
                  </button>
                  <button
                    type="button"
                    onClick={() => setColorMode('white_decal')}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '4px',
                      border: colorMode === 'white_decal' ? '1.5px solid #3b82f6' : '1px solid var(--line, #cbd5e1)',
                      background: colorMode === 'white_decal' ? '#0f172a' : 'var(--bg-2, #ffffff)',
                      color: colorMode === 'white_decal' ? '#ffffff' : 'var(--text, #334155)',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                    title="White vinyl decal cutout for truck wraps"
                  >
                    ⚪ Decal
                  </button>
                </div>
              ) : (
                <span style={{ color: 'var(--muted, #64748b)', fontSize: '0.72rem', fontWeight: 700 }}>
                  Transparent PNG • 1536 × 1024
                </span>
              )}
            </div>

            {/* Stage Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
              {activeTab === 'ai' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {aiError && (
                    <div role="alert" style={{ padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.08)', color: '#f87171', fontSize: '0.82rem', fontWeight: 700, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>⚠️</span>
                          <span>{aiError}</span>
                        </div>
                        <button type="button" onClick={() => setAiError(null)} style={{ border: 'none', background: 'transparent', color: '#f87171', cursor: 'pointer', fontWeight: 900 }}>✕</button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.45rem', borderTop: '1px solid rgba(239, 68, 68, 0.2)' }}>
                        <span style={{ fontSize: '0.75rem', color: '#fca5a5', fontWeight: 600 }}>
                          AI generator is offline. You can use Editable Vectors to create your brand identity.
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveTab('concepts')}
                          style={{
                            padding: '0.35rem 0.75rem',
                            borderRadius: '6px',
                            border: '1px solid rgba(239, 68, 68, 0.4)',
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: '#f87171',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          Use Editable Vectors →
                        </button>
                      </div>
                    </div>
                  )}

                  {isGenerating && aiConcepts.length === 0 ? (
                    <AiArtDirectorLoadingState variant="hero" elapsedSeconds={elapsedSeconds} />
                  ) : null}

                  {isGenerating && aiConcepts.length > 0 ? (
                    <AiArtDirectorLoadingState variant="card" elapsedSeconds={elapsedSeconds} />
                  ) : null}

                  {aiConcepts.length === 0 && !isGenerating ? (
                    <div
                      style={{
                        minHeight: '500px',
                        borderRadius: '20px',
                        padding: '3rem',
                        background: 'radial-gradient(circle at 14% 18%, rgba(168,85,247,0.34), transparent 28%), radial-gradient(circle at 84% 80%, rgba(37,99,235,0.28), transparent 32%), linear-gradient(145deg, #0f172a 0%, #1e1b4b 58%, #172554 100%)',
                        color: '#ffffff',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        textAlign: 'center',
                        boxShadow: '0 22px 55px rgba(15,23,42,0.24)',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      <span style={{ color: '#c4b5fd', fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Generative Brand Intelligence</span>
                      <h3 style={{ maxWidth: '620px', margin: '0.75rem 0 0.65rem', fontSize: 'clamp(1.8rem, 4vw, 3.25rem)', lineHeight: 1.02, letterSpacing: '-0.045em' }}>
                        Start with a real idea.<br />Not another logo template.
                      </h3>
                      <p style={{ maxWidth: '570px', margin: 0, color: '#cbd5e1', fontSize: '0.92rem', lineHeight: 1.65 }}>
                        AI image generation explores custom symbolism, typography, negative space, and personality from your actual brand brief—then gives you production-ready transparent artwork.
                      </p>
                      <div style={{ marginTop: '1.5rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.55rem' }}>
                        {['Original visual metaphor', 'Exact brand colors', 'Truck-to-favicon ready'].map((quality) => (
                          <span key={quality} style={{ padding: '0.45rem 0.75rem', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.08)', color: '#e2e8f0', fontSize: '0.75rem', fontWeight: 700 }}>{quality}</span>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={handleGenerateAiLogo}
                        disabled={!name.trim() || isGenerating}
                        style={{ marginTop: '1.75rem', padding: '0.8rem 1.15rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.2)', background: '#ffffff', color: '#4c1d95', fontSize: '0.88rem', fontWeight: 900, cursor: 'pointer', boxShadow: '0 10px 25px rgba(0,0,0,0.22)' }}
                      >
                        ✦ Generate {name.trim() ? `${name.trim()}'s` : 'My'} First Concept
                      </button>
                    </div>
                  ) : aiConcepts.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1rem' }}>
                      {aiConcepts.map((logo, index) => {
                        const direction = AI_LOGO_DIRECTIONS.find((item) => item.id === logo.direction);
                        const selected = activeAiLogo?.id === logo.id;
                        return (
                          <div key={logo.id} style={{ padding: '0.9rem', borderRadius: '15px', border: selected ? '2px solid #7c3aed' : '1px solid var(--line, rgba(255,255,255,0.08))', background: 'var(--bg-2, #ffffff)', boxShadow: selected ? '0 14px 32px rgba(109,40,217,0.18)' : '0 4px 12px rgba(0,0,0,0.06)' }}>
                            <button type="button" onClick={() => setSelectedAiLogoId(logo.id)} style={{ display: 'block', width: '100%', padding: 0, border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.65rem' }}>
                                <div>
                                  <strong style={{ display: 'block', color: 'var(--text, #0f172a)', fontSize: '0.83rem' }}>{direction?.label || 'AI concept'} {aiConcepts.length > 1 ? `#${aiConcepts.length - index}` : ''}</strong>
                                  <span style={{ color: 'var(--muted, #64748b)', fontSize: '0.68rem' }}>Original AI concept • transparent PNG</span>
                                </div>
                                {selected && <span style={{ padding: '3px 7px', borderRadius: '999px', background: 'rgba(124, 58, 237, 0.15)', color: '#c084fc', fontSize: '0.65rem', fontWeight: 900 }}>SELECTED</span>}
                              </div>
                              <div className="ai-logo-studio-checkerboard" style={{ position: 'relative', width: '100%', aspectRatio: '3 / 2', overflow: 'hidden', borderRadius: '11px', border: '1px solid var(--line, #e2e8f0)' }}>
                                <Image src={logo.url} alt={`${name} generated logo concept`} fill sizes="(max-width: 900px) 100vw, 50vw" style={{ objectFit: 'contain', padding: '0.75rem' }} />
                              </div>
                            </button>

                            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                              <button type="button" onClick={() => { onSelectLogo('', logo.url); onClose(); }} style={{ flex: 1, minWidth: '150px', padding: '0.58rem 0.7rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: '#ffffff', fontSize: '0.8rem', fontWeight: 900, cursor: 'pointer' }}>
                                Apply to Website
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRemixingLogo(logo);
                                  setRemixPrompt('');
                                }}
                                style={{
                                  padding: '0.58rem 0.7rem',
                                  borderRadius: '8px',
                                  border: '1px solid rgba(192, 132, 252, 0.4)',
                                  background: 'rgba(124, 58, 237, 0.1)',
                                  color: '#c084fc',
                                  fontSize: '0.78rem',
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                                title="Tweak colors, typography, or iconography with AI iterations"
                              >
                                🪄 Tweak with AI
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setAdjustingLogo(logo);
                                  setAdjustHue(0);
                                  setAdjustSaturation(100);
                                  setAdjustBrightness(100);
                                  setAdjustContrast(100);
                                  setIsWhiteDecal(false);
                                  setIsBlackSilhouette(false);
                                }}
                                style={{
                                  padding: '0.58rem 0.7rem',
                                  borderRadius: '8px',
                                  border: '1px solid rgba(147, 197, 253, 0.4)',
                                  background: 'rgba(37, 99, 235, 0.1)',
                                  color: '#60a5fa',
                                  fontSize: '0.78rem',
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                                title="Instant color shift, white vinyl decal filter, or silhouette (0 AI credits)"
                              >
                                🎨 Quick Adjust
                              </button>
                              <button type="button" onClick={() => void handleDownloadAiLogo(logo)} style={{ padding: '0.58rem 0.7rem', borderRadius: '8px', border: '1px solid var(--line, #cbd5e1)', background: 'var(--bg-2, #ffffff)', color: 'var(--text, #334155)', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer' }}>Download PNG</button>
                              <a href="/dashboard/merchandise" style={{ padding: '0.58rem 0.7rem', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.4)', background: 'rgba(16, 185, 129, 0.1)', color: '#34d399', fontSize: '0.78rem', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>👕 Order Merch</a>
                              <button
                                type="button"
                                onClick={() => void handleDeleteAiLogo(logo)}
                                disabled={deletingLogoId === logo.id}
                                style={{
                                  padding: '0.58rem 0.7rem',
                                  borderRadius: '8px',
                                  border: '1px solid rgba(248, 113, 113, 0.4)',
                                  background: 'rgba(239, 68, 68, 0.1)',
                                  color: '#f87171',
                                  fontSize: '0.78rem',
                                  fontWeight: 800,
                                  cursor: deletingLogoId === logo.id ? 'wait' : 'pointer',
                                }}
                                title="Permanently delete this AI logo concept"
                              >
                                {deletingLogoId === logo.id ? 'Deleting...' : '🗑 Delete'}
                              </button>
                            </div>
                            <details style={{ marginTop: '0.6rem' }}>
                              <summary style={{ cursor: 'pointer', color: 'var(--muted, #64748b)', fontSize: '0.68rem', fontWeight: 700 }}>View the art-direction prompt</summary>
                              <pre style={{ margin: '0.45rem 0 0', padding: '0.65rem', maxHeight: '150px', overflow: 'auto', whiteSpace: 'pre-wrap', borderRadius: '8px', background: 'var(--bg-3, #f8fafc)', color: 'var(--text, #475569)', border: '1px solid var(--line, transparent)', fontFamily: 'inherit', fontSize: '0.65rem', lineHeight: 1.45 }}>{logo.prompt}</pre>
                            </details>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {aiConcepts.length > 0 && (
                    <div style={{ padding: '0.7rem 0.85rem', borderRadius: '10px', border: '1px solid rgba(59, 130, 246, 0.25)', background: 'rgba(59, 130, 246, 0.08)', color: '#60a5fa', fontSize: '0.72rem', lineHeight: 1.5 }}>
                      AI concepts are high-resolution transparent PNGs. Use <strong>🎨 Quick Adjust</strong> on any concept to shift colors, convert to a white vinyl decal, or download.
                    </div>
                  )}
                </div>
              ) : (
                /* Grid of Concepts */
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
                    gap: '1.25rem',
                  }}
                >
                  {concepts.map((logo) => (
                    <div
                      key={logo.id}
                      style={{
                        border: '1.5px solid var(--line, #e2e8f0)',
                        borderRadius: '14px',
                        padding: '1.25rem',
                        background: 'var(--bg-2, #ffffff)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text, #475569)' }}>
                            {logo.styleLabel}
                          </span>
                          <span style={{ fontSize: '0.7rem', background: 'rgba(37, 99, 235, 0.15)', color: '#60a5fa', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>
                            Multi-Layer Vector
                          </span>
                        </div>

                        {/* Vector Preview Box */}
                        <div
                          style={{
                            background: colorMode === 'dark' || colorMode === 'white_decal' ? '#0f172a' : 'var(--bg-3, #f8fafc)',
                            borderRadius: '10px',
                            padding: '1rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid var(--line, #e2e8f0)',
                            marginBottom: '1rem',
                            minHeight: '140px',
                          }}
                          dangerouslySetInnerHTML={{ __html: logo.svg }}
                        />
                      </div>

                      {/* Action Bar */}
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => {
                            onSelectLogo(logo.svg, logo.dataUri);
                            onClose();
                          }}
                          style={{
                            flex: 1,
                            padding: '0.55rem 0.85rem',
                            background: '#2563eb',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 800,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            boxShadow: '0 2px 4px rgba(37,99,235,0.2)',
                          }}
                        >
                          ✨ Apply to Website
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownloadSvg(logo)}
                          style={{
                            padding: '0.55rem 0.75rem',
                            background: 'var(--bg-2, #ffffff)',
                            color: 'var(--text, #0f172a)',
                            border: '1.5px solid var(--line, #cbd5e1)',
                            borderRadius: '8px',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}
                          title="Download scalable SVG vector"
                        >
                          ⬇️ SVG
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownloadPng(logo)}
                          style={{
                            padding: '0.55rem 0.75rem',
                            background: 'var(--bg-2, #ffffff)',
                            color: 'var(--text, #0f172a)',
                            border: '1.5px solid var(--line, #cbd5e1)',
                            borderRadius: '8px',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}
                          title="Download Ultra-HD Transparent PNG"
                        >
                          🖼️ HD PNG
                        </button>

                        <button
                          type="button"
                          disabled={downloadingKit}
                          onClick={() => handleDownloadBrandKit(logo)}
                          style={{
                            padding: '0.55rem 0.75rem',
                            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.2))',
                            color: '#f59e0b',
                            border: '1px solid rgba(245, 158, 11, 0.4)',
                            borderRadius: '8px',
                            fontWeight: 800,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}
                          title="Download complete brand kit with SVG, PNG, and White Decal"
                        >
                          🎁 Brand Kit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Trade Glyph Picker Modal Drawer */}
      {glyphPickerOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (e.target === e.currentTarget) setGlyphPickerOpen(false);
          }}
        >
          <div
            style={{
              background: 'var(--bg-2, #ffffff)',
              borderRadius: '14px',
              border: '1px solid var(--line, rgba(255,255,255,0.1))',
              maxWidth: '560px',
              width: '100%',
              maxHeight: '70vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--line, #e2e8f0)', background: 'var(--bg-3, #f8fafc)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text, #0f172a)' }}>Select Trade Emblem</h3>
              <button
                type="button"
                onClick={() => setGlyphPickerOpen(false)}
                style={{ background: 'var(--bg-2, #f1f5f9)', border: '1px solid var(--line, transparent)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontWeight: 700, color: 'var(--text, #0f172a)' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--line, #f1f5f9)', background: 'var(--bg-2, #ffffff)' }}>
              <input
                type="text"
                value={glyphSearch}
                placeholder="Search 45+ icons (e.g. wrench, faucet, flame, bolt, tree)..."
                onChange={(e) => setGlyphSearch(e.target.value)}
                style={{ width: '100%', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid var(--line, #cbd5e1)', background: 'var(--bg-2, #ffffff)', color: 'var(--text, #0f172a)', fontSize: '0.85rem', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ padding: '1rem', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '0.6rem', background: 'var(--bg-2, #ffffff)' }}>
              {filteredGlyphKeys.map((k) => {
                const g = SERVICE_ICON_GLYPHS[k];
                const isSelected = selectedGlyphKey === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setSelectedGlyphKey(k);
                      setGlyphPickerOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '0.6rem 0.4rem',
                      background: isSelected ? 'rgba(37, 99, 235, 0.18)' : 'var(--bg-3, #ffffff)',
                      border: isSelected ? '2px solid #3b82f6' : '1px solid var(--line, #e2e8f0)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      dangerouslySetInnerHTML={{
                        __html: `<svg width="24" height="24" viewBox="0 0 24 24" fill="${g.mode === 'fill' ? accent : 'none'}" stroke="${g.mode === 'fill' ? 'none' : accent}" stroke-width="2">${g.body}</svg>`,
                      }}
                    />
                    <span style={{ fontSize: '0.7rem', fontWeight: isSelected ? 800 : 500, color: isSelected ? '#60a5fa' : 'var(--text, #475569)', textTransform: 'capitalize', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                      {k}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* AI Remix / Tweak Modal */}
      {remixingLogo && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000002,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onMouseDown={(e) => {
            isRemixBackdropMouseDownRef.current = (e.target === e.currentTarget);
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (isRemixBackdropMouseDownRef.current && e.target === e.currentTarget) {
              setRemixingLogo(null);
            }
            isRemixBackdropMouseDownRef.current = false;
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '560px',
              background: 'var(--bg-2, #ffffff)',
              borderRadius: '16px',
              border: '1px solid var(--line, rgba(255,255,255,0.1))',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '90vh',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '1.1rem 1.25rem',
                borderBottom: '1px solid var(--line, #e2e8f0)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--bg-3, #f8fafc)',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: 'var(--text, #0f172a)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🪄</span> Tweak Logo with AI
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted, #64748b)' }}>
                  Iterate on this concept while preserving its core silhouette & visual metaphor
                </span>
              </div>
              <button
                type="button"
                onClick={() => setRemixingLogo(null)}
                style={{
                  background: 'var(--bg-2, #e2e8f0)',
                  border: '1px solid var(--line, transparent)',
                  borderRadius: '8px',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontWeight: 800,
                  color: 'var(--text, #475569)',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', background: 'var(--bg-2, #ffffff)' }}>
              {/* Reference Logo Preview */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '0.75rem',
                  borderRadius: '12px',
                  background: 'var(--bg-3, #f8fafc)',
                  border: '1px solid var(--line, #e2e8f0)',
                }}
              >
                <div
                  className="ai-logo-studio-checkerboard"
                  style={{
                    width: '80px',
                    height: '60px',
                    position: 'relative',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: '1px solid var(--line, #cbd5e1)',
                    flexShrink: 0,
                  }}
                >
                  <Image
                    src={remixingLogo.url}
                    alt="Original concept"
                    fill
                    sizes="80px"
                    style={{ objectFit: 'contain', padding: '4px' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text, #0f172a)' }}>
                    Reference Concept ({AI_LOGO_DIRECTIONS.find((d) => d.id === remixingLogo.direction)?.label || 'Original'})
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--muted, #64748b)', marginTop: '2px' }}>
                    The art director will use this concept as the structural foundation for your revision.
                  </div>
                </div>
              </div>

              {/* 1-Click Suggestion Pills */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text, #334155)', marginBottom: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Quick Revision Ideas
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {[
                    { label: '🎨 Apply selected palette', prompt: `Update color accents to match our palette (${accent} and ${secondary}).` },
                    { label: '🔤 Make font bolder', prompt: 'Make the business name typography bolder, heavier, and more commanding.' },
                    { label: '💧 Simplify symbol', prompt: 'Simplify and sharpen the symbol mark with cleaner lines and less visual clutter.' },
                    { label: '🏷️ Add tagline', prompt: `Add tagline "${tagline || 'Quality Service'}" cleanly integrated under the primary mark.` },
                    { label: '✨ Minimalist & clean', prompt: 'Make it more minimalist and modern with streamlined shapes and maximum negative space.' },
                    { label: '🏗️ More rugged & industrial', prompt: 'Give it a more rugged, industrial, heavy-duty aesthetic suitable for fleet vehicles.' },
                  ].map((pill) => (
                    <button
                      key={pill.label}
                      type="button"
                      onClick={() => {
                        setRemixPrompt((prev) => {
                          const trimmed = prev.trim();
                          if (!trimmed) return pill.prompt;
                          if (trimmed.includes(pill.prompt)) return trimmed;
                          return `${trimmed} ${pill.prompt}`;
                        });
                      }}
                      style={{
                        padding: '0.35rem 0.65rem',
                        borderRadius: '999px',
                        border: '1px solid var(--line, #cbd5e1)',
                        background: 'var(--bg-3, #f8fafc)',
                        color: 'var(--text, #334155)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Revision Instructions Textarea */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text, #334155)', marginBottom: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Revision Instructions
                </label>
                <textarea
                  rows={3}
                  value={remixPrompt}
                  onChange={(e) => setRemixPrompt(e.target.value)}
                  placeholder="Describe your desired changes (e.g. 'Make the icon more abstract and modern', 'Change the accent colors to vivid cyan and navy', 'Enlarge the company name')..."
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.75rem',
                    borderRadius: '10px',
                    border: '1.5px solid var(--line, #cbd5e1)',
                    background: 'var(--bg-2, #ffffff)',
                    color: 'var(--text, #0f172a)',
                    fontSize: '0.85rem',
                    lineHeight: 1.45,
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#7c3aed'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--line, #cbd5e1)'; }}
                />
              </div>

              {/* Credit Note */}
              <div
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: '10px',
                  background: 'rgba(124, 58, 237, 0.12)',
                  border: '1px solid rgba(124, 58, 237, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.75rem',
                  color: '#c084fc',
                  fontWeight: 600,
                }}
              >
                <span>⚡</span>
                <span>
                  Uses 1 AI generation credit. Generates in the background so you can freely navigate while the art director finishes.
                </span>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '0.85rem 1.25rem',
                borderTop: '1px solid var(--line, #e2e8f0)',
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: '0.65rem',
                background: 'var(--bg-3, #f8fafc)',
              }}
            >
              <button
                type="button"
                onClick={() => setRemixingLogo(null)}
                style={{
                  padding: '0.55rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid var(--line, #cbd5e1)',
                  background: 'var(--bg-2, #ffffff)',
                  color: 'var(--text, #475569)',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerateRemixLogo}
                disabled={!remixPrompt.trim() || isGenerating}
                style={{
                  padding: '0.55rem 1.15rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: !remixPrompt.trim() || isGenerating
                    ? 'var(--line, #cbd5e1)'
                    : 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                  color: '#ffffff',
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  cursor: !remixPrompt.trim() || isGenerating ? 'not-allowed' : 'pointer',
                  boxShadow: !remixPrompt.trim() || isGenerating ? 'none' : '0 4px 12px rgba(124, 58, 237, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>✦</span> Generate Revised Concept
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Canvas Quick Adjust & Decal Modal */}
      {adjustingLogo && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000002,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onMouseDown={(e) => {
            isAdjustBackdropMouseDownRef.current = (e.target === e.currentTarget);
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (isAdjustBackdropMouseDownRef.current && e.target === e.currentTarget && !isSavingAdjusted) {
              setAdjustingLogo(null);
            }
            isAdjustBackdropMouseDownRef.current = false;
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '620px',
              background: 'var(--bg-2, #ffffff)',
              borderRadius: '16px',
              border: '1px solid var(--line, rgba(255,255,255,0.1))',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '92vh',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '1.1rem 1.25rem',
                borderBottom: '1px solid var(--line, #e2e8f0)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--bg-3, #f8fafc)',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: 'var(--text, #0f172a)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🎨</span> Quick Adjust & Decal Studio
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted, #64748b)' }}>
                  0 AI credits • Instant color shifts, filters, and white vinyl decal conversion
                </span>
              </div>
              <button
                type="button"
                disabled={isSavingAdjusted}
                onClick={() => setAdjustingLogo(null)}
                style={{
                  background: 'var(--bg-2, #e2e8f0)',
                  border: '1px solid var(--line, transparent)',
                  borderRadius: '8px',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: isSavingAdjusted ? 'not-allowed' : 'pointer',
                  fontWeight: 800,
                  color: 'var(--text, #475569)',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.15rem', background: 'var(--bg-2, #ffffff)' }}>
              {/* Canvas Preview Area with Background Selector */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text, #334155)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Live Canvas Preview
                  </span>
                  <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-3, #f1f5f9)', border: '1px solid var(--line, transparent)', padding: '2px', borderRadius: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setAdjustPreviewBg('checkered')}
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        border: 'none',
                        background: adjustPreviewBg === 'checkered' ? 'var(--bg-2, #ffffff)' : 'transparent',
                        color: adjustPreviewBg === 'checkered' ? 'var(--text, #0f172a)' : 'var(--muted, #64748b)',
                        fontWeight: 700,
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                        boxShadow: adjustPreviewBg === 'checkered' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                      }}
                    >
                      Checker
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustPreviewBg('dark')}
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        border: 'none',
                        background: adjustPreviewBg === 'dark' ? '#0f172a' : 'transparent',
                        color: adjustPreviewBg === 'dark' ? '#ffffff' : 'var(--muted, #64748b)',
                        fontWeight: 700,
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                      }}
                    >
                      Dark
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustPreviewBg('light')}
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        border: 'none',
                        background: adjustPreviewBg === 'light' ? 'var(--bg-2, #ffffff)' : 'transparent',
                        color: adjustPreviewBg === 'light' ? 'var(--text, #0f172a)' : 'var(--muted, #64748b)',
                        fontWeight: 700,
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                        boxShadow: adjustPreviewBg === 'light' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                      }}
                    >
                      Light
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: '200px',
                    borderRadius: '12px',
                    border: '1.5px solid var(--line, #cbd5e1)',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background:
                      adjustPreviewBg === 'dark'
                        ? '#090d16'
                        : adjustPreviewBg === 'light'
                        ? '#ffffff'
                        : 'var(--bg-3, #f8fafc)',
                    backgroundImage:
                      adjustPreviewBg === 'checkered'
                        ? 'linear-gradient(45deg, rgba(148, 163, 184, 0.2) 25%, transparent 25%), linear-gradient(-45deg, rgba(148, 163, 184, 0.2) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(148, 163, 184, 0.2) 75%), linear-gradient(-45deg, transparent 75%, rgba(148, 163, 184, 0.2) 75%)'
                        : 'none',
                    backgroundSize: '20px 20px',
                    backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                  }}
                >
                  <canvas
                    ref={adjustCanvasRef}
                    style={{
                      maxWidth: '92%',
                      maxHeight: '92%',
                      objectFit: 'contain',
                    }}
                  />
                </div>
              </div>

              {/* 1-Click Preset Modes */}
              <div>
                <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text, #334155)', marginBottom: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  1-Click Presets & Decals
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsWhiteDecal(true);
                      setIsBlackSilhouette(false);
                      setAdjustPreviewBg('dark');
                    }}
                    style={{
                      padding: '0.55rem 0.65rem',
                      borderRadius: '8px',
                      border: isWhiteDecal ? '2px solid #2563eb' : '1px solid var(--line, #cbd5e1)',
                      background: isWhiteDecal ? 'rgba(37, 99, 235, 0.18)' : 'var(--bg-3, #ffffff)',
                      color: isWhiteDecal ? '#60a5fa' : 'var(--text, #334155)',
                      fontWeight: 800,
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '2px',
                    }}
                  >
                    <span>⚪ White Vinyl Decal</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--muted, #64748b)', fontWeight: 500 }}>For dark glass & trucks</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsBlackSilhouette(true);
                      setIsWhiteDecal(false);
                      setAdjustPreviewBg('light');
                    }}
                    style={{
                      padding: '0.55rem 0.65rem',
                      borderRadius: '8px',
                      border: isBlackSilhouette ? '2px solid #2563eb' : '1px solid var(--line, #cbd5e1)',
                      background: isBlackSilhouette ? 'rgba(37, 99, 235, 0.18)' : 'var(--bg-3, #ffffff)',
                      color: isBlackSilhouette ? '#60a5fa' : 'var(--text, #334155)',
                      fontWeight: 800,
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '2px',
                    }}
                  >
                    <span>⚫ Black Silhouette</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--muted, #64748b)', fontWeight: 500 }}>Single-color stamp</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsWhiteDecal(false);
                      setIsBlackSilhouette(false);
                      setAdjustHue(0);
                      setAdjustSaturation(100);
                      setAdjustBrightness(100);
                      setAdjustContrast(100);
                      setAdjustPreviewBg('checkered');
                    }}
                    style={{
                      padding: '0.55rem 0.65rem',
                      borderRadius: '8px',
                      border: '1px solid var(--line, #cbd5e1)',
                      background: 'var(--bg-3, #ffffff)',
                      color: 'var(--text, #475569)',
                      fontWeight: 800,
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '2px',
                    }}
                  >
                    <span>↺ Reset to Original</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--muted, #64748b)', fontWeight: 500 }}>Revert all sliders</span>
                  </button>
                </div>
              </div>

              {/* Color Tuning Sliders */}
              <div
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', opacity: isWhiteDecal || isBlackSilhouette ? 0.45 : 1 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text, #334155)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Color & Tone Sliders
                  </span>
                  {(isWhiteDecal || isBlackSilhouette) && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--muted, #64748b)', fontStyle: 'italic' }}>
                      (Sliders active when decal preset is off)
                    </span>
                  )}
                </div>

                {/* Hue Rotate */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text, #475569)', marginBottom: '0.2rem' }}>
                    <span>Hue Shift</span>
                    <span>{adjustHue}°</span>
                  </div>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    disabled={isWhiteDecal || isBlackSilhouette}
                    value={adjustHue}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      setIsWhiteDecal(false);
                      setIsBlackSilhouette(false);
                      setAdjustHue(Number(e.target.value));
                    }}
                    style={{ width: '100%', cursor: 'pointer', accentColor: '#2563eb' }}
                  />
                </div>

                {/* Saturation */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text, #475569)', marginBottom: '0.2rem' }}>
                    <span>Color Saturation</span>
                    <span>{adjustSaturation}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    step="2"
                    disabled={isWhiteDecal || isBlackSilhouette}
                    value={adjustSaturation}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      setIsWhiteDecal(false);
                      setIsBlackSilhouette(false);
                      setAdjustSaturation(Number(e.target.value));
                    }}
                    style={{ width: '100%', cursor: 'pointer', accentColor: '#2563eb' }}
                  />
                </div>

                {/* Brightness & Contrast */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text, #475569)', marginBottom: '0.2rem' }}>
                      <span>Brightness</span>
                      <span>{adjustBrightness}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      step="2"
                      disabled={isWhiteDecal || isBlackSilhouette}
                      value={adjustBrightness}
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        setIsWhiteDecal(false);
                        setIsBlackSilhouette(false);
                        setAdjustBrightness(Number(e.target.value));
                      }}
                      style={{ width: '100%', cursor: 'pointer', accentColor: '#2563eb' }}
                    />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text, #475569)', marginBottom: '0.2rem' }}>
                      <span>Contrast</span>
                      <span>{adjustContrast}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      step="2"
                      disabled={isWhiteDecal || isBlackSilhouette}
                      value={adjustContrast}
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        setIsWhiteDecal(false);
                        setIsBlackSilhouette(false);
                        setAdjustContrast(Number(e.target.value));
                      }}
                      style={{ width: '100%', cursor: 'pointer', accentColor: '#2563eb' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '0.85rem 1.25rem',
                borderTop: '1px solid var(--line, #e2e8f0)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--bg-3, #f8fafc)',
              }}
            >
              <button
                type="button"
                disabled={isSavingAdjusted}
                onClick={() => setAdjustingLogo(null)}
                style={{
                  padding: '0.55rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid var(--line, #cbd5e1)',
                  background: 'var(--bg-2, #ffffff)',
                  color: 'var(--text, #475569)',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: isSavingAdjusted ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={handleDownloadAdjustedCanvas}
                  style={{
                    padding: '0.55rem 0.95rem',
                    borderRadius: '8px',
                    border: '1px solid var(--line, #cbd5e1)',
                    background: 'var(--bg-2, #ffffff)',
                    color: 'var(--text, #0f172a)',
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  ⬇️ Download PNG
                </button>
                <button
                  type="button"
                  disabled={isSavingAdjusted}
                  onClick={handleSaveAdjustedCanvasLogo}
                  style={{
                    padding: '0.55rem 1.15rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: isSavingAdjusted ? 'var(--muted, #94a3b8)' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                    color: '#ffffff',
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    cursor: isSavingAdjusted ? 'wait' : 'pointer',
                    boxShadow: isSavingAdjusted ? 'none' : '0 4px 12px rgba(37, 99, 235, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>💾</span> {isSavingAdjusted ? 'Saving to Studio...' : 'Save as New Logo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
