'use client';

import { useState, useMemo } from 'react';
import styles from './site-customizer-sandbox.module.css';

const TRADES = [
  { id: 'roofing', name: 'Roofing & Gutters', service1: 'Roof Replacement', service2: 'Emergency Leak Repair', service3: 'Gutter Guard Install' },
  { id: 'plumbing', name: 'Plumbing & Drains', service1: 'Water Heater Replacement', service2: 'Emergency Drain Clearing', service3: 'Repipe & Fixtures' },
  { id: 'electrical', name: 'Electrical & Panels', service1: 'Panel Upgrades (200A)', service2: 'EV Charger Installation', service3: 'Whole-Home Rewiring' },
  { id: 'hvac', name: 'Heating & Cooling (HVAC)', service1: 'Heat Pump & AC Install', service2: 'Furnace Diagnostics', service3: 'Seasonal Tune-Up' },
  { id: 'landscaping', name: 'Landscaping & Hardscape', service1: 'Patio & Paver Design', service2: 'Tree & Sod Installation', service3: 'Retaining Walls' },
  { id: 'painting', name: 'Painting & Staining', service1: 'Exterior House Painting', service2: 'Interior Cabinet Spraying', service3: 'Deck Staining' },
  { id: 'carpentry', name: 'Carpentry & Decks', service1: 'Composite Deck Building', service2: 'Custom Framing & Trim', service3: 'Pergola Construction' },
  { id: 'remodeling', name: 'Kitchen & Bath Remodeling', service1: 'Master Bath Renovation', service2: 'Custom Kitchen Remodel', service3: 'Basement Finishing' },
];

const THEMES = [
  { id: 'forge', name: 'Forge', vibe: 'Industrial High-Contrast' },
  { id: 'modern', name: 'Modern', vibe: 'Clean Architectural' },
  { id: 'coat', name: 'Coat', vibe: 'Bold & Punchy' },
  { id: 'fixit', name: 'Fixit', vibe: 'Fast Service & Direct' },
  { id: 'handy', name: 'Handy', vibe: 'Warm & Friendly' },
  { id: 'professional', name: 'Professional', vibe: 'Corporate & Trusted' },
  { id: 'reno', name: 'Reno', vibe: 'Visual Showcase' },
  { id: 'shine', name: 'Shine', vibe: 'Premium Sleek' },
];

const PALETTES = [
  { id: 'ember', name: 'Ember Orange', hex: '#ff6a24' },
  { id: 'emerald', name: 'Electric Emerald', hex: '#50e3bd' },
  { id: 'ocean', name: 'Pacific Ocean', hex: '#0ea5e9' },
  { id: 'amber', name: 'Bold Gold', hex: '#f59e0b' },
  { id: 'slate', name: 'Steel Slate', hex: '#94a3b8' },
];

export default function SiteCustomizerSandbox() {
  const [businessName, setBusinessName] = useState('Apex Pro Contracting');
  const [selectedTrade, setSelectedTrade] = useState(TRADES[0].id);
  const [selectedTheme, setSelectedTheme] = useState(THEMES[0].id);
  const [selectedPalette, setSelectedPalette] = useState(PALETTES[0].hex);
  const [deviceView, setDeviceView] = useState<'desktop' | 'mobile'>('desktop');

  const tradeData = useMemo(() => {
    return TRADES.find((t) => t.id === selectedTrade) || TRADES[0];
  }, [selectedTrade]);

  const slug = useMemo(() => {
    return businessName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 18) || 'mybrand';
  }, [businessName]);

  const claimUrl = useMemo(() => {
    const params = new URLSearchParams({
      intent: 'signup',
      name: businessName,
      trade: selectedTrade,
      theme: selectedTheme,
    });
    return `https://app.letsgetquoted.com/login?${params.toString()}`;
  }, [businessName, selectedTrade, selectedTheme]);

  return (
    <div className={styles.sandboxContainer}>
      <div className={styles.card}>
        {/* Controls Column */}
        <div className={styles.controlsPanel}>
          <div>
            <h3 className={styles.panelTitle}>
              <span>🎨</span> Instant Site Builder Sandbox
            </h3>
            <p className={styles.panelSubtitle}>
              Customize your branding below. Your live website mock updates instantaneously.
            </p>
          </div>

          {/* Business Name */}
          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="sandbox-biz-name">
              Business Name
            </label>
            <input
              id="sandbox-biz-name"
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Mountain View Plumbing"
              className={styles.textInput}
            />
          </div>

          {/* Trade Selector */}
          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="sandbox-trade">
              Trade Vertical
            </label>
            <select
              id="sandbox-trade"
              value={selectedTrade}
              onChange={(e) => setSelectedTrade(e.target.value)}
              className={styles.selectInput}
            >
              {TRADES.map((trade) => (
                <option key={trade.id} value={trade.id}>
                  {trade.name}
                </option>
              ))}
            </select>
          </div>

          {/* Theme Style */}
          <div className={styles.inputGroup}>
            <label className={styles.label}>Template Theme</label>
            <div className={styles.themeChips}>
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => setSelectedTheme(theme.id)}
                  className={`${styles.themeChip} ${selectedTheme === theme.id ? styles.themeChipActive : ''}`}
                >
                  {theme.name}
                </button>
              ))}
            </div>
          </div>

          {/* Color Palette */}
          <div className={styles.inputGroup}>
            <label className={styles.label}>Accent Color</label>
            <div className={styles.paletteGrid}>
              {PALETTES.map((pal) => (
                <button
                  key={pal.id}
                  type="button"
                  onClick={() => setSelectedPalette(pal.hex)}
                  className={`${styles.paletteBtn} ${selectedPalette === pal.hex ? styles.paletteActive : ''}`}
                  style={{ background: pal.hex }}
                  aria-label={pal.name}
                  title={pal.name}
                />
              ))}
            </div>
          </div>

          {/* Claim Button */}
          <div>
            <a href={claimUrl} className={styles.claimCta} style={{ background: selectedPalette }}>
              Claim & Publish This Site ($0/mo Flex) &rarr;
            </a>
            <div className={styles.ctaMicro}>
              ✓ Includes custom domain · ✓ 24/7 AI quoting · ✓ No credit card required
            </div>
          </div>
        </div>

        {/* Live Preview Viewport */}
        <div className={styles.previewPanel}>
          {/* Toolbar */}
          <div className={styles.viewportToolbar}>
            <div className={styles.urlBar}>
              <span>🔒</span>
              <span>https://{slug}.letsgetquoted.com</span>
            </div>
            <div className={styles.deviceToggles}>
              <button
                type="button"
                onClick={() => setDeviceView('desktop')}
                className={`${styles.deviceBtn} ${deviceView === 'desktop' ? styles.deviceBtnActive : ''}`}
              >
                🖥️ Desktop
              </button>
              <button
                type="button"
                onClick={() => setDeviceView('mobile')}
                className={`${styles.deviceBtn} ${deviceView === 'mobile' ? styles.deviceBtnActive : ''}`}
              >
                📱 Mobile
              </button>
            </div>
          </div>

          {/* Rendered Mock Viewport */}
          <div className={styles.mockSiteWrapper}>
            <div className={deviceView === 'desktop' ? styles.mockDesktop : styles.mockMobile}>
              {/* Site Nav */}
              <div className={styles.siteNav}>
                <div className={styles.brandTitle} style={{ color: selectedPalette }}>
                  {businessName || 'Your Business'}
                </div>
                <span className={styles.siteNavBtn} style={{ background: selectedPalette }}>
                  Get Instant Quote
                </span>
              </div>

              {/* Site Hero */}
              <div className={styles.siteHero}>
                <div className={styles.badgeReview}>
                  <span style={{ color: '#f59e0b' }}>★★★★★</span> 5.0 Rating · Licensed & Insured
                </div>
                <h4 className={styles.heroHeading}>
                  Top-Rated {tradeData.name} in Your Area.
                </h4>
                <p className={styles.heroTagline}>
                  Fast quotes, upfront pricing, and expert craftsmanship for residential & commercial properties.
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <span
                    className={styles.siteNavBtn}
                    style={{ background: selectedPalette, padding: '8px 16px', fontSize: 12 }}
                  >
                    Request 24/7 Estimate &rarr;
                  </span>
                </div>
              </div>

              {/* Services Grid */}
              <div className={styles.siteServicesGrid}>
                <div className={styles.serviceCard}>
                  <div className={styles.serviceCardHead}>
                    <span style={{ color: selectedPalette }}>✦</span> {tradeData.service1}
                  </div>
                  <span>Expert installation with guaranteed lifetime craftsmanship warranty.</span>
                </div>
                <div className={styles.serviceCard}>
                  <div className={styles.serviceCardHead}>
                    <span style={{ color: selectedPalette }}>✦</span> {tradeData.service2}
                  </div>
                  <span>Rapid response, honest diagnostics, and fixed upfront pricing.</span>
                </div>
                <div className={styles.serviceCard}>
                  <div className={styles.serviceCardHead}>
                    <span style={{ color: selectedPalette }}>✦</span> {tradeData.service3}
                  </div>
                  <span>Comprehensive upgrades using commercial-grade materials.</span>
                </div>
              </div>

              {/* Instant Quote Band */}
              <div className={styles.siteQuoteBand}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#f5f0e7' }}>
                  Need an estimate today? We respond in under 3 minutes.
                </div>
                <div style={{ fontSize: 11, color: '#8fa6b5' }}>
                  Pay online with Apple Pay, Google Pay, or direct card with zero hidden fees.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
