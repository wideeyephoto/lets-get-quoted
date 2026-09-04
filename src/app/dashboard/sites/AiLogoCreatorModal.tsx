'use client';

import { useState, useMemo, useTransition, useEffect } from 'react';
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
import { generateAiLogoAction, generateLogoTaglinesAction, type GeneratedAiLogo } from './actions';

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
};

type ViewTab = 'ai' | 'concepts' | 'mockups';
type MockupType = 'truck' | 'uniform' | 'invoice' | 'mobile';

export default function AiLogoCreatorModal({
  open,
  onClose,
  businessName: initialName,
  trade,
  accentColor: initialAccent,
  aiCredits,
  onRefreshCredits,
  onSelectLogo,
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
  const [selectedMockup, setSelectedMockup] = useState<MockupType>('truck');
  const [previewLogoIndex, setPreviewLogoIndex] = useState(0);
  const [creativeBrief, setCreativeBrief] = useState('');
  const [aiDirection, setAiDirection] = useState<AiLogoDirection>('art_director');
  const [aiConcepts, setAiConcepts] = useState<GeneratedAiLogo[]>([]);
  const [selectedAiLogoId, setSelectedAiLogoId] = useState<string | null>(null);
  const [mockupUsesAi, setMockupUsesAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  
  const [suggestedTaglines, setSuggestedTaglines] = useState<string[]>([]);
  const [isGeneratingAi, startAiTransition] = useTransition();
  const [isGeneratingImage, startImageTransition] = useTransition();
  const [downloadingKit, setDownloadingKit] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isGeneratingImage) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isGeneratingImage]);

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

  const activeMockupLogo = concepts[previewLogoIndex] ?? concepts[0];
  const activeAiLogo = aiConcepts.find((concept) => concept.id === selectedAiLogoId) ?? aiConcepts[0] ?? null;

  if (!open) return null;

  function handleSelectPalette(p: typeof CURATED_COLOR_PALETTES[0]) {
    setAccent(p.primary);
    setSecondary(p.secondary);
  }

  function handleTriggerAiSlogans() {
    startAiTransition(async () => {
      const res = await generateLogoTaglinesAction({
        companyName: name,
        trade: trade || 'Contractor',
      });
      if (res.ok && res.taglines && res.taglines.length > 0) {
        setSuggestedTaglines(res.taglines);
        if (!tagline) {
          setTagline(res.taglines[0]);
        }
        onRefreshCredits?.();
      }
    });
  }

  function handleGenerateAiLogo() {
    setAiError(null);
    startImageTransition(async () => {
      const result = await generateAiLogoAction({
        businessName: name,
        trade,
        tagline: tagline || null,
        establishedYear: year || null,
        accentColor: accent,
        secondaryColor: secondary,
        emblem: selectedGlyphKey,
        direction: aiDirection,
        creativeBrief: creativeBrief || null,
      });

      if (!result.ok || !result.image) {
        setAiError(result.message || 'Could not generate a logo right now.');
        return;
      }

      setAiConcepts((current) => [result.image!, ...current]);
      setSelectedAiLogoId(result.image.id);
      onRefreshCredits?.();
    });
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

  function renderMockupLogo(vectorMode: LogoColorMode = 'color') {
    if (mockupUsesAi && activeAiLogo) {
      return (
        <Image
          src={activeAiLogo.url}
          alt={`${name} logo mockup`}
          width={1536}
          height={1024}
          sizes="(max-width: 900px) 80vw, 520px"
          style={{ display: 'block', width: '100%', height: 'auto', maxHeight: '190px', objectFit: 'contain' }}
        />
      );
    }

    return (
      <div
        style={{ width: '100%' }}
        dangerouslySetInnerHTML={{
          __html: generateLogoSvg({
            businessName: name,
            trade,
            tagline: tagline || null,
            establishedYear: year || null,
            accentColor: accent,
            secondaryColor: secondary,
            iconGlyphKey: selectedGlyphKey,
            style: activeMockupLogo.style,
            colorMode: vectorMode,
          }),
        }}
      />
    );
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
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          maxWidth: '1200px',
          width: '100%',
          height: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.4)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{AI_LOGO_STUDIO_STYLES}</style>
        {/* Header */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
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
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: '#0f172a' }}>
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
                      background: aiCredits <= 25 ? '#fef3c7' : '#eff6ff',
                      border: aiCredits <= 25 ? '1px solid #fde68a' : '1px solid #dbeafe',
                      color: aiCredits <= 25 ? '#b45309' : '#1d4ed8',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                    }}
                  >
                    <span>⚡ {aiCredits.toLocaleString('en-US')} AI {aiCredits === 1 ? 'credit' : 'credits'}</span>
                    {aiCredits <= 25 ? (
                      <a href="/dashboard/settings#buy-credits" style={{ color: '#b45309', textDecoration: 'underline', marginLeft: '0.2rem' }}>
                        + Top up
                      </a>
                    ) : null}
                  </span>
                )}
              </div>
              <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                Generate original brand concepts, then prove them on your website, truck, and uniform.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* View Tab Switcher */}
            <div style={{ background: '#e2e8f0', padding: '3px', borderRadius: '8px', display: 'flex', gap: '3px' }}>
              <button
                type="button"
                onClick={() => setActiveTab('ai')}
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeTab === 'ai' ? '#ffffff' : 'transparent',
                  color: activeTab === 'ai' ? '#6d28d9' : '#64748b',
                  fontWeight: 800,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  boxShadow: activeTab === 'ai' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                ✦ AI Concept Lab
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('concepts')}
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeTab === 'concepts' ? '#ffffff' : 'transparent',
                  color: activeTab === 'concepts' ? '#0f172a' : '#64748b',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  boxShadow: activeTab === 'concepts' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                ◇ Editable Vectors
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('mockups')}
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeTab === 'mockups' ? '#ffffff' : 'transparent',
                  color: activeTab === 'mockups' ? '#0f172a' : '#64748b',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  boxShadow: activeTab === 'mockups' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                🚚 Brand Mockups
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: '#f1f5f9',
                border: 'none',
                borderRadius: '8px',
                padding: '0.5rem 0.75rem',
                cursor: 'pointer',
                fontWeight: 700,
                color: '#475569',
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
              borderRight: '1px solid #e2e8f0',
              background: '#f8fafc',
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
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#334155', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Business Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Maplewood Plumbing"
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1.5px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: '0.9rem', fontWeight: 600, boxSizing: 'border-box' }}
              />
            </div>

            {/* Tagline + AI Generator */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Tagline / Slogan
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={handleTriggerAiSlogans}
                    disabled={isGeneratingAi}
                    style={{
                      background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                      border: '1px solid #bfdbfe',
                      borderRadius: '6px',
                      padding: '2px 8px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: '#1d4ed8',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {isGeneratingAi ? '⏳ Generating...' : '✨ AI Slogans'}
                  </button>
                  {typeof aiCredits === 'number' && (
                    <span style={{ fontSize: '0.7rem', color: aiCredits <= 25 ? '#b45309' : '#64748b', fontWeight: 600 }}>
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
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1.5px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: '0.9rem', boxSizing: 'border-box' }}
              />

              {/* AI Slogan Suggestions Pills */}
              {suggestedTaglines.length > 0 && (
                <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700 }}>Pick an AI Slogan:</span>
                  {suggestedTaglines.map((t, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setTagline(t)}
                      style={{
                        textAlign: 'left',
                        padding: '4px 8px',
                        background: tagline === t ? '#eff6ff' : '#ffffff',
                        border: tagline === t ? '1.5px solid #3b82f6' : '1px solid #e2e8f0',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        color: tagline === t ? '#1d4ed8' : '#334155',
                        fontWeight: tagline === t ? 700 : 500,
                        cursor: 'pointer',
                      }}
                    >
                      &bull; {t}
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
                  background: 'linear-gradient(145deg, #faf5ff, #eef2ff)',
                  border: '1px solid #ddd6fe',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 900, color: '#5b21b6', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
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
                          border: aiDirection === direction.id ? '1.5px solid #7c3aed' : '1px solid #ddd6fe',
                          background: aiDirection === direction.id ? '#ffffff' : 'rgba(255,255,255,0.55)',
                          color: aiDirection === direction.id ? '#5b21b6' : '#475569',
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
                  <p style={{ margin: '5px 0 0', fontSize: '0.69rem', lineHeight: 1.35, color: '#6b7280' }}>
                    {AI_LOGO_DIRECTIONS.find((direction) => direction.id === aiDirection)?.description}
                  </p>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 900, color: '#5b21b6', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Art Director Brief <span style={{ fontWeight: 600, color: '#8b5cf6' }}>(optional)</span>
                  </label>
                  <textarea
                    value={creativeBrief}
                    maxLength={600}
                    onChange={(event) => setCreativeBrief(event.target.value)}
                    placeholder="Try: An alpine peak hidden inside a lightning bolt. Confident, premium, no generic house roofs."
                    rows={3}
                    style={{ width: '100%', resize: 'vertical', padding: '0.55rem 0.65rem', borderRadius: '8px', border: '1.5px solid #c4b5fd', background: '#ffffff', color: '#1e1b4b', fontSize: '0.8rem', lineHeight: 1.4, boxSizing: 'border-box' }}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleGenerateAiLogo}
                  disabled={isGeneratingImage || !name.trim()}
                  style={{
                    width: '100%',
                    padding: '0.7rem 0.9rem',
                    border: 'none',
                    borderRadius: '9px',
                    background: isGeneratingImage ? '#6d28d9' : 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                    color: '#ffffff',
                    fontWeight: 900,
                    fontSize: '0.86rem',
                    cursor: isGeneratingImage ? 'wait' : 'pointer',
                    boxShadow: '0 7px 18px rgba(109,40,217,0.24)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.45rem',
                  }}
                >
                  {isGeneratingImage ? (
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
                    <span style={{ fontSize: '0.72rem', color: aiCredits <= 25 ? '#b45309' : '#6d28d9', fontWeight: 700 }}>
                      ⚡ {aiCredits.toLocaleString('en-US')} AI {aiCredits === 1 ? 'credit' : 'credits'} available
                      {aiCredits <= 25 ? (
                        <a href="/dashboard/settings#buy-credits" style={{ color: '#b45309', textDecoration: 'underline', marginLeft: '0.25rem' }}>
                          + Top up
                        </a>
                      ) : null}
                    </span>
                  )}
                  <span style={{ fontSize: '0.66rem', color: '#6d28d9', textAlign: 'right', lineHeight: 1.35, flex: '1 1 auto' }}>
                    Transparent, high-res PNG
                  </span>
                </div>
              </div>
            )}

            {/* Trade Icon Glyph Picker */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#334155', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {activeTab === 'ai' ? 'Emblem Inspiration' : 'Trade Emblem / Icon'}
              </label>
              <div
                onClick={() => setGlyphPickerOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.5rem 0.75rem',
                  background: '#ffffff',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div
                    style={{ width: '28px', height: '28px', background: '#eff6ff', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    dangerouslySetInnerHTML={{
                      __html: `<svg width="18" height="18" viewBox="0 0 24 24" fill="${SERVICE_ICON_GLYPHS[selectedGlyphKey]?.mode === 'fill' ? accent : 'none'}" stroke="${SERVICE_ICON_GLYPHS[selectedGlyphKey]?.mode === 'fill' ? 'none' : accent}" stroke-width="2">${SERVICE_ICON_GLYPHS[selectedGlyphKey]?.body ?? ''}</svg>`,
                    }}
                  />
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', textTransform: 'capitalize' }}>
                    {selectedGlyphKey}
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: 700 }}>Browse 45+ ▾</span>
              </div>
            </div>

            {/* Curated Color Themes */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#334155', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                      background: accent === p.primary && secondary === p.secondary ? '#eff6ff' : '#ffffff',
                      border: accent === p.primary && secondary === p.secondary ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155' }}>{p.name}</span>
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
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '2px' }}>
                  Primary Accent
                </label>
                <input
                  type="color"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  style={{ width: '100%', height: '32px', padding: '2px', borderRadius: '6px', border: '1px solid #cbd5e1', cursor: 'pointer' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '2px' }}>
                  Secondary / Gold
                </label>
                <input
                  type="color"
                  value={secondary}
                  onChange={(e) => setSecondary(e.target.value)}
                  style={{ width: '100%', height: '32px', padding: '2px', borderRadius: '6px', border: '1px solid #cbd5e1', cursor: 'pointer' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '2px' }}>
                Est. Year
              </label>
              <input
                type="text"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: '0.85rem', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Right Stage: Concepts or Mockups */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f1f5f9' }}>
            {/* View Mode Bar */}
            <div
              style={{
                padding: '0.65rem 1.25rem',
                background: '#ffffff',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              {activeTab === 'ai' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                  <span style={{ padding: '3px 8px', borderRadius: '999px', background: '#f3e8ff', color: '#6d28d9', fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.04em' }}>
                    GPT IMAGE
                  </span>
                  <span style={{ color: '#475569', fontSize: '0.78rem', fontWeight: 700 }}>
                    {AI_LOGO_DIRECTIONS.find((direction) => direction.id === aiDirection)?.label}
                  </span>
                </div>
              ) : activeTab === 'concepts' ? (
                <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto' }}>
                  <button
                    type="button"
                    onClick={() => setActiveFilter('all')}
                    style={{
                      padding: '0.3rem 0.7rem',
                      borderRadius: '16px',
                      border: activeFilter === 'all' ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                      background: activeFilter === 'all' ? '#eff6ff' : '#ffffff',
                      color: activeFilter === 'all' ? '#1d4ed8' : '#475569',
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
                        border: activeFilter === st ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                        background: activeFilter === st ? '#eff6ff' : '#ffffff',
                        color: activeFilter === st ? '#1d4ed8' : '#475569',
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
              ) : (
                /* Mockup Type Switcher */
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', alignSelf: 'center' }}>Proof Context:</span>
                  {(
                    [
                      { id: 'truck', label: '🚚 Service Truck Door' },
                      { id: 'uniform', label: '👕 Work Polo / Shirt' },
                      { id: 'invoice', label: '📄 Invoice Header' },
                      { id: 'mobile', label: '📱 Mobile Favicon' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedMockup(m.id)}
                      style={{
                        padding: '0.3rem 0.65rem',
                        borderRadius: '6px',
                        border: selectedMockup === m.id ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                        background: selectedMockup === m.id ? '#eff6ff' : '#ffffff',
                        color: selectedMockup === m.id ? '#1d4ed8' : '#475569',
                        fontWeight: 700,
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Color Mode Switcher */}
              {activeTab !== 'ai' ? <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>Render Mode:</span>
                <button
                  type="button"
                  onClick={() => setColorMode('color')}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    border: colorMode === 'color' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                    background: colorMode === 'color' ? '#eff6ff' : '#ffffff',
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
                    border: colorMode === 'dark' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                    background: colorMode === 'dark' ? '#1e293b' : '#ffffff',
                    color: colorMode === 'dark' ? '#ffffff' : '#334155',
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
                    border: colorMode === 'white_decal' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                    background: colorMode === 'white_decal' ? '#0f172a' : '#ffffff',
                    color: colorMode === 'white_decal' ? '#ffffff' : '#334155',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                  title="White vinyl decal cutout for truck wraps"
                >
                  ⚪ Decal
                </button>
              </div> : (
                <span style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 700 }}>
                  Transparent PNG • 1536 × 1024
                </span>
              )}
            </div>

            {/* Stage Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
              {activeTab === 'ai' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {aiError && (
                    <div role="alert" style={{ padding: '0.75rem 0.9rem', borderRadius: '10px', border: '1px solid #fecaca', background: '#fff1f2', color: '#9f1239', fontSize: '0.82rem', fontWeight: 700, display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                      <span>{aiError}</span>
                      <button type="button" onClick={() => setAiError(null)} style={{ border: 'none', background: 'transparent', color: '#9f1239', cursor: 'pointer', fontWeight: 900 }}>✕</button>
                    </div>
                  )}

                  {isGeneratingImage && aiConcepts.length === 0 ? (
                    <AiArtDirectorLoadingState variant="hero" elapsedSeconds={elapsedSeconds} />
                  ) : null}

                  {isGeneratingImage && aiConcepts.length > 0 ? (
                    <AiArtDirectorLoadingState variant="card" elapsedSeconds={elapsedSeconds} />
                  ) : null}

                  {aiConcepts.length === 0 && !isGeneratingImage ? (
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
                        disabled={!name.trim() || isGeneratingImage}
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
                          <div key={logo.id} style={{ padding: '0.9rem', borderRadius: '15px', border: selected ? '2px solid #7c3aed' : '1px solid #dbe2ea', background: '#ffffff', boxShadow: selected ? '0 14px 32px rgba(109,40,217,0.14)' : '0 5px 15px rgba(15,23,42,0.06)' }}>
                            <button type="button" onClick={() => setSelectedAiLogoId(logo.id)} style={{ display: 'block', width: '100%', padding: 0, border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.65rem' }}>
                                <div>
                                  <strong style={{ display: 'block', color: '#0f172a', fontSize: '0.83rem' }}>{direction?.label || 'AI concept'} {aiConcepts.length > 1 ? `#${aiConcepts.length - index}` : ''}</strong>
                                  <span style={{ color: '#64748b', fontSize: '0.68rem' }}>Original AI concept • transparent PNG</span>
                                </div>
                                {selected && <span style={{ padding: '3px 7px', borderRadius: '999px', background: '#f3e8ff', color: '#6d28d9', fontSize: '0.65rem', fontWeight: 900 }}>SELECTED</span>}
                              </div>
                              <div style={{ position: 'relative', width: '100%', aspectRatio: '3 / 2', overflow: 'hidden', borderRadius: '11px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', backgroundImage: 'linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)', backgroundSize: '22px 22px', backgroundPosition: '0 0, 0 11px, 11px -11px, -11px 0px' }}>
                                <Image src={logo.url} alt={`${name} generated logo concept`} fill sizes="(max-width: 900px) 100vw, 50vw" style={{ objectFit: 'contain', padding: '0.75rem' }} />
                              </div>
                            </button>

                            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                              <button type="button" onClick={() => { onSelectLogo('', logo.url); onClose(); }} style={{ flex: 1, minWidth: '150px', padding: '0.58rem 0.7rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: '#ffffff', fontSize: '0.8rem', fontWeight: 900, cursor: 'pointer' }}>
                                Apply to Website
                              </button>
                              <button type="button" onClick={() => void handleDownloadAiLogo(logo)} style={{ padding: '0.58rem 0.7rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#334155', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer' }}>Download PNG</button>
                              <button type="button" onClick={() => { setSelectedAiLogoId(logo.id); setMockupUsesAi(true); setActiveTab('mockups'); }} style={{ padding: '0.58rem 0.7rem', borderRadius: '8px', border: '1px solid #c4b5fd', background: '#faf5ff', color: '#6d28d9', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer' }}>See Mockups</button>
                            </div>
                            <details style={{ marginTop: '0.6rem' }}>
                              <summary style={{ cursor: 'pointer', color: '#64748b', fontSize: '0.68rem', fontWeight: 700 }}>View the art-direction prompt</summary>
                              <pre style={{ margin: '0.45rem 0 0', padding: '0.65rem', maxHeight: '150px', overflow: 'auto', whiteSpace: 'pre-wrap', borderRadius: '8px', background: '#f8fafc', color: '#475569', fontFamily: 'inherit', fontSize: '0.65rem', lineHeight: 1.45 }}>{logo.prompt}</pre>
                            </details>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {aiConcepts.length > 0 && (
                    <div style={{ padding: '0.7rem 0.85rem', borderRadius: '10px', border: '1px solid #dbeafe', background: '#eff6ff', color: '#1e40af', fontSize: '0.72rem', lineHeight: 1.5 }}>
                      AI concepts are high-resolution transparent PNGs. For fully editable shapes and one-color decal exports, use the Editable Vectors tab.
                    </div>
                  )}
                </div>
              ) : activeTab === 'concepts' ? (
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
                        border: '1.5px solid #e2e8f0',
                        borderRadius: '14px',
                        padding: '1.25rem',
                        background: '#ffffff',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569' }}>
                            {logo.styleLabel}
                          </span>
                          <span style={{ fontSize: '0.7rem', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>
                            Multi-Layer Vector
                          </span>
                        </div>

                        {/* Vector Preview Box */}
                        <div
                          style={{
                            background: colorMode === 'dark' || colorMode === 'white_decal' ? '#0f172a' : '#f8fafc',
                            borderRadius: '10px',
                            padding: '1rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid #e2e8f0',
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
                            background: '#ffffff',
                            color: '#0f172a',
                            border: '1.5px solid #cbd5e1',
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
                            background: '#ffffff',
                            color: '#0f172a',
                            border: '1.5px solid #cbd5e1',
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
                            background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                            color: '#92400e',
                            border: '1px solid #fcd34d',
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
              ) : (
                /* Real-World Mockup Proofing Studio */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Style selector for Mockups */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', background: '#ffffff', padding: '0.5rem 0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', alignSelf: 'center' }}>Test Logo Style:</span>
                    {aiConcepts.slice(0, 3).map((logo, index) => (
                      <button
                        key={logo.id}
                        type="button"
                        onClick={() => { setSelectedAiLogoId(logo.id); setMockupUsesAi(true); }}
                        style={{
                          padding: '0.35rem 0.65rem',
                          borderRadius: '6px',
                          border: mockupUsesAi && activeAiLogo?.id === logo.id ? '1.5px solid #7c3aed' : '1px solid #c4b5fd',
                          background: mockupUsesAi && activeAiLogo?.id === logo.id ? '#f3e8ff' : '#ffffff',
                          color: '#6d28d9',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        ✦ AI Concept {aiConcepts.length > 1 ? aiConcepts.length - index : ''}
                      </button>
                    ))}
                    {concepts.map((c, idx) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setPreviewLogoIndex(idx); setMockupUsesAi(false); }}
                        style={{
                          padding: '0.35rem 0.65rem',
                          borderRadius: '6px',
                          border: !mockupUsesAi && previewLogoIndex === idx ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                          background: !mockupUsesAi && previewLogoIndex === idx ? '#eff6ff' : '#ffffff',
                          color: !mockupUsesAi && previewLogoIndex === idx ? '#1d4ed8' : '#475569',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {c.styleLabel}
                      </button>
                    ))}
                  </div>

                  {/* Mockup Canvas */}
                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: '14px',
                      border: '1px solid #e2e8f0',
                      padding: '2rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: '420px',
                      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)',
                    }}
                  >
                    {selectedMockup === 'truck' && (
                      /* Service Van Door Mockup */
                      <div
                        style={{
                          width: '100%',
                          maxWidth: '700px',
                          height: '340px',
                          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                          borderRadius: '16px',
                          position: 'relative',
                          overflow: 'hidden',
                          boxShadow: '0 20px 35px -10px rgba(0,0,0,0.4)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          alignItems: 'center',
                          border: '4px solid #334155',
                        }}
                      >
                        {/* Van Door Seams & Handle */}
                        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '35px', width: '3px', background: 'rgba(255,255,255,0.08)' }} />
                        <div style={{ position: 'absolute', top: '45px', right: '35px', width: '35px', height: '14px', borderRadius: '4px', background: '#475569', border: '1px solid #64748b' }} />
                        
                        {/* Door Decal Logo */}
                        <div
                          style={{
                            maxWidth: '480px',
                            width: '80%',
                            filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.5))',
                          }}
                        >
                          {renderMockupLogo('dark')}
                        </div>

                        {/* License / Phone Footer on Vehicle */}
                        <div style={{ marginTop: '1.25rem', display: 'flex', gap: '1.5rem', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 800, letterSpacing: '0.1em' }}>
                          <span>📞 1-800-PRO-WORK</span>
                          <span>&bull;</span>
                          <span>LICENSED & INSURED</span>
                        </div>
                      </div>
                    )}

                    {selectedMockup === 'uniform' && (
                      /* Embroidered Polo Chest Patch */
                      <div
                        style={{
                          width: '100%',
                          maxWidth: '560px',
                          height: '320px',
                          background: '#0e1726',
                          borderRadius: '16px',
                          position: 'relative',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          alignItems: 'center',
                          boxShadow: 'inset 0 0 80px rgba(0,0,0,0.8), 0 15px 30px rgba(0,0,0,0.3)',
                          border: '2px solid #1e293b',
                        }}
                      >
                        {/* Embroidered Patch Border */}
                        <div
                          style={{
                            padding: '1.5rem 2rem',
                            borderRadius: '12px',
                            background: '#090d16',
                            border: `2px dashed ${secondary}`,
                            boxShadow: '0 8px 20px rgba(0,0,0,0.6)',
                          }}
                        >
                          <div
                            style={{
                              maxWidth: '380px',
                              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))',
                            }}
                          >
                            {renderMockupLogo('dark')}
                          </div>
                        </div>
                        <span style={{ marginTop: '1rem', color: '#64748b', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em' }}>
                          LEFT CHEST UNIFORM EMBROIDERY
                        </span>
                      </div>
                    )}

                    {selectedMockup === 'invoice' && (
                      /* Invoice Header Mockup */
                      <div
                        style={{
                          width: '100%',
                          maxWidth: '650px',
                          background: '#ffffff',
                          borderRadius: '12px',
                          border: '1px solid #cbd5e1',
                          padding: '1.5rem 2rem',
                          boxShadow: '0 15px 35px rgba(0,0,0,0.1)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '1.25rem',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #f1f5f9', paddingBottom: '1rem' }}>
                          <div style={{ width: '340px', maxWidth: '55%' }}>
                            {renderMockupLogo('color')}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: '#0f172a' }}>OFFICIAL ESTIMATE</h3>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>#EST-2026-0842</span>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.8rem', color: '#475569' }}>
                          <div>
                            <strong>Prepared For:</strong>
                            <p style={{ margin: '2px 0 0' }}>John & Sarah Miller<br />142 Oakridge Blvd</p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <strong>Date:</strong> August 25, 2026<br />
                            <strong>Status:</strong> <span style={{ color: '#16a34a', fontWeight: 700 }}>Approved</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedMockup === 'mobile' && (
                      /* Mobile Browser Header */
                      <div
                        style={{
                          width: '320px',
                          height: '380px',
                          background: '#ffffff',
                          borderRadius: '24px',
                          border: '8px solid #1e293b',
                          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                          display: 'flex',
                          flexDirection: 'column',
                          overflow: 'hidden',
                        }}
                      >
                        {/* Browser Bar */}
                        <div style={{ background: '#f8fafc', padding: '8px 12px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} />
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }} />
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
                          <div style={{ flex: 1, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '2px 8px', fontSize: '0.65rem', color: '#64748b', textAlign: 'center' }}>
                            🔒 {name.toLowerCase().replace(/[^a-z0-9]+/g, '')}.com
                          </div>
                        </div>

                        {/* Mobile Header Nav */}
                        <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ width: '160px', maxHeight: '54px', overflow: 'hidden' }}>{renderMockupLogo('color')}</div>
                          <div style={{ fontSize: '1rem', color: '#0f172a' }}>☰</div>
                        </div>

                        <div style={{ padding: '14px', flex: 1, background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ height: '60px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                          <div style={{ height: '40px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                        </div>
                      </div>
                    )}
                  </div>
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
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}
          onClick={() => setGlyphPickerOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '14px',
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
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>Select Trade Emblem</h3>
              <button
                type="button"
                onClick={() => setGlyphPickerOpen(false)}
                style={{ background: '#f1f5f9', border: 'none', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontWeight: 700 }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid #f1f5f9' }}>
              <input
                type="text"
                value={glyphSearch}
                placeholder="Search 45+ icons (e.g. wrench, faucet, flame, bolt, tree)..."
                onChange={(e) => setGlyphSearch(e.target.value)}
                style={{ width: '100%', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: '0.85rem', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ padding: '1rem', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '0.6rem' }}>
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
                      background: isSelected ? '#eff6ff' : '#ffffff',
                      border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                      borderRadius: '8px',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      dangerouslySetInnerHTML={{
                        __html: `<svg width="24" height="24" viewBox="0 0 24 24" fill="${g.mode === 'fill' ? accent : 'none'}" stroke="${g.mode === 'fill' ? 'none' : accent}" stroke-width="2">${g.body}</svg>`,
                      }}
                    />
                    <span style={{ fontSize: '0.7rem', fontWeight: isSelected ? 800 : 500, color: isSelected ? '#1d4ed8' : '#475569', textTransform: 'capitalize', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                      {k}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
