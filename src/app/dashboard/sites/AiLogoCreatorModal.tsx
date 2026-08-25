'use client';

import { useState, useMemo, useTransition } from 'react';
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
import { SERVICE_ICON_GLYPHS } from '@/lib/templates/ServiceIcon';
import { generateLogoTaglinesAction } from './actions';

type Props = {
  open: boolean;
  onClose: () => void;
  businessName: string;
  trade?: string | null;
  accentColor?: string | null;
  onSelectLogo: (logoSvg: string, logoDataUri: string) => void;
};

type ViewTab = 'concepts' | 'mockups';
type MockupType = 'truck' | 'uniform' | 'invoice' | 'mobile';

export default function AiLogoCreatorModal({
  open,
  onClose,
  businessName: initialName,
  trade,
  accentColor: initialAccent,
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
  const [activeTab, setActiveTab] = useState<ViewTab>('concepts');
  const [selectedMockup, setSelectedMockup] = useState<MockupType>('truck');
  const [previewLogoIndex, setPreviewLogoIndex] = useState(0);
  
  const [suggestedTaglines, setSuggestedTaglines] = useState<string[]>([]);
  const [isGeneratingAi, startAiTransition] = useTransition();
  const [downloadingKit, setDownloadingKit] = useState(false);

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
      }
    });
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
      const img = new Image();
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
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: '#0f172a' }}>
                AI Vector Logo & Brand Studio
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                Professional multi-layer vector heraldry, curved heritage stamps & high-res print kits.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* View Tab Switcher */}
            <div style={{ background: '#e2e8f0', padding: '3px', borderRadius: '8px', display: 'flex', gap: '3px' }}>
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
                🎨 Logo Concepts
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
                🚚 Real-World Proofs
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
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.9rem', fontWeight: 600, boxSizing: 'border-box' }}
              />
            </div>

            {/* Tagline + AI Generator */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Tagline / Slogan
                </label>
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
              </div>
              <input
                type="text"
                value={tagline}
                placeholder="e.g. Heating, Cooling & Drain Experts"
                onChange={(e) => setTagline(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box' }}
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

            {/* Trade Icon Glyph Picker */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#334155', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Trade Emblem / Icon
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
                style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', boxSizing: 'border-box' }}
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
              {/* Style Filter Tabs (in Concepts view) */}
              {activeTab === 'concepts' ? (
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
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
              </div>
            </div>

            {/* Stage Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
              {activeTab === 'concepts' ? (
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
                  <div style={{ display: 'flex', gap: '0.5rem', background: '#ffffff', padding: '0.5rem 0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', alignSelf: 'center' }}>Test Logo Style:</span>
                    {concepts.map((c, idx) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setPreviewLogoIndex(idx)}
                        style={{
                          padding: '0.35rem 0.65rem',
                          borderRadius: '6px',
                          border: previewLogoIndex === idx ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                          background: previewLogoIndex === idx ? '#eff6ff' : '#ffffff',
                          color: previewLogoIndex === idx ? '#1d4ed8' : '#475569',
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
                              colorMode: 'dark',
                            }),
                          }}
                        />

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
                                colorMode: 'dark',
                              }),
                            }}
                          />
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
                          <div
                            style={{ maxWidth: '340px' }}
                            dangerouslySetInnerHTML={{ __html: activeMockupLogo.svg }}
                          />
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
                          <div style={{ maxWidth: '160px' }} dangerouslySetInnerHTML={{ __html: activeMockupLogo.svg }} />
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
                style={{ width: '100%', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', boxSizing: 'border-box' }}
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
