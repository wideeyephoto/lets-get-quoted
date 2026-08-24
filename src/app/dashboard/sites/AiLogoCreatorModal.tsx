'use client';

import { useState, useMemo } from 'react';
import {
  generateLogoConcepts,
  LOGO_STYLE_LABELS,
  type LogoStyle,
  type GeneratedLogo,
} from '@/lib/logo-creator';

type Props = {
  open: boolean;
  onClose: () => void;
  businessName: string;
  trade?: string | null;
  accentColor?: string | null;
  onSelectLogo: (logoSvg: string, logoDataUri: string) => void;
};

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
  const [activeFilter, setActiveFilter] = useState<LogoStyle | 'all'>('all');

  const concepts = useMemo(() => {
    return generateLogoConcepts({
      businessName: name,
      trade,
      tagline: tagline || null,
      establishedYear: year || null,
      accentColor: accent,
      styles:
        activeFilter === 'all'
          ? ['modern_shield', 'minimal_monogram', 'vintage_stamp', 'hexagon_badge', 'dynamic_motion']
          : [activeFilter],
    });
  }, [name, trade, tagline, year, accent, activeFilter]);

  if (!open) return null;

  function handleDownloadSvg(logo: GeneratedLogo) {
    const blob = new Blob([logo.svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-logo-${logo.style}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          maxWidth: '960px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800 }}>✨ AI Vector Logo Studio</h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748b' }}>
              Create high-resolution, infinitely scalable vector logos for your website, truck wraps, and invoices.
            </p>
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
              fontWeight: 600,
            }}
          >
            ✕ Close
          </button>
        </div>

        {/* Controls Bar */}
        <div
          style={{
            padding: '1rem 1.5rem',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '0.75rem',
          }}
        >
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '2px' }}>
              Business Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '2px' }}>
              Tagline (Optional)
            </label>
            <input
              type="text"
              value={tagline}
              placeholder="e.g. Heating & Air Conditioning"
              onChange={(e) => setTagline(e.target.value)}
              style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '2px' }}>
              Est. Year
            </label>
            <input
              type="text"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '2px' }}>
              Accent Color
            </label>
            <input
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              style={{ width: '100%', height: '34px', padding: '2px', borderRadius: '6px', border: '1px solid #cbd5e1', cursor: 'pointer' }}
            />
          </div>
        </div>

        {/* Style Filter Tabs */}
        <div style={{ padding: '0.75rem 1.5rem', display: 'flex', gap: '0.5rem', overflowX: 'auto', borderBottom: '1px solid #f1f5f9' }}>
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '20px',
              border: activeFilter === 'all' ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
              background: activeFilter === 'all' ? '#eff6ff' : '#ffffff',
              color: activeFilter === 'all' ? '#1d4ed8' : '#475569',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
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
                padding: '0.35rem 0.75rem',
                borderRadius: '20px',
                border: activeFilter === st ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                background: activeFilter === st ? '#eff6ff' : '#ffffff',
                color: activeFilter === st ? '#1d4ed8' : '#475569',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {LOGO_STYLE_LABELS[st]}
            </button>
          ))}
        </div>

        {/* Concepts Grid */}
        <div
          style={{
            padding: '1.5rem',
            overflowY: 'auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {concepts.map((logo) => (
            <div
              key={logo.id}
              style={{
                border: '1.5px solid #e2e8f0',
                borderRadius: '12px',
                padding: '1.25rem',
                background: '#ffffff',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>
                    {logo.styleLabel}
                  </span>
                  <span style={{ fontSize: '0.7rem', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', color: '#475569' }}>
                    Vector SVG
                  </span>
                </div>

                <div
                  style={{
                    background: '#f8fafc',
                    borderRadius: '8px',
                    padding: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid #f1f5f9',
                    marginBottom: '1rem',
                  }}
                  dangerouslySetInnerHTML={{ __html: logo.svg }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    onSelectLogo(logo.svg, logo.dataUri);
                    onClose();
                  }}
                  style={{
                    flex: 1,
                    padding: '0.5rem 0.75rem',
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  ✨ Apply to Website
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadSvg(logo)}
                  style={{
                    padding: '0.5rem 0.75rem',
                    background: '#f1f5f9',
                    color: '#0f172a',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                  title="Download scalable SVG for trucks, flyers, and uniforms"
                >
                  ⬇️ SVG
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
