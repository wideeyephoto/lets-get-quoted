'use client';

import { useState } from 'react';
import styles from './neighborhood-halo-hero.module.css';

interface TradeHeroData {
  trade: string;
  streetName: string;
  city: string;
  clusterDiscount: number;
  beforePhoto: string;
  afterPhoto: string;
  adCopy: string;
  scopeSummary: string;
}

const HERO_TRADES: Record<string, TradeHeroData> = {
  Roofing: {
    trade: 'Roofing',
    streetName: 'Maple Ave',
    city: 'Rochester, MI',
    clusterDiscount: 250,
    beforePhoto: 'Worn, Curling 3-Tab Shingles',
    afterPhoto: '50-Yr Architectural Shingles & Ridge Venting',
    adCopy: 'We just wrapped a complete roof replacement on Maple Ave! Because our work trucks and crews are active in your neighborhood this week, neighbors qualify for our $250 street cluster discount.',
    scopeSummary: 'Architectural Shingle Replacement',
  },
  HVAC: {
    trade: 'HVAC',
    streetName: 'Highland Park Blvd',
    city: 'Denver, CO',
    clusterDiscount: 350,
    beforePhoto: 'Short-Cycling 20-Yr R-22 System',
    afterPhoto: 'Inverter Variable-Speed Heat Pump (20 SEER2)',
    adCopy: 'Just installed a high-efficiency heat pump on Highland Park Blvd! Save up to $350 when our installation crew stops at your home this week.',
    scopeSummary: '20 SEER2 Heat Pump Upgrade',
  },
  Plumbing: {
    trade: 'Plumbing',
    streetName: 'Whispering Pines Dr',
    city: 'Austin, TX',
    clusterDiscount: 150,
    beforePhoto: 'Leaking 50-Gal Tank Water Heater',
    afterPhoto: 'Dual Rinnai High-Efficiency Tankless System',
    adCopy: 'Just wrapped a continuous tankless water heater upgrade on Whispering Pines Dr! Neighbors on your block save $150 this week.',
    scopeSummary: 'Whole-Home Tankless System',
  },
  Electrical: {
    trade: 'Electrical',
    streetName: 'Lakewood Terrace',
    city: 'Tampa, FL',
    clusterDiscount: 200,
    beforePhoto: 'Outdated 100A Split-Bus Fuse Box',
    afterPhoto: 'Siemens 200A Surge Panel + Level 2 EV Charger',
    adCopy: 'Upgraded a 200A main service panel on Lakewood Terrace! Get $200 off your home panel or EV charger install during our neighborhood run.',
    scopeSummary: '200A Panel & EV Charger',
  },
};

const NEIGHBOR_PINS = [
  { id: '1436', streetNum: '1436', offset: '2 doors down', status: 'Ad Delivered', distance: '0.1 mi', cx: 180, cy: 180 },
  { id: '1442', streetNum: '1442', offset: '4 doors down', status: '⚡ Lead Clicked', distance: '0.2 mi', cx: 310, cy: 150 },
  { id: '1450', streetNum: '1450', offset: 'Corner house', status: 'Eligible for $250', distance: '0.4 mi', cx: 340, cy: 290 },
];

export default function NeighborhoodHaloHeroVisual() {
  const [selectedTrade, setSelectedTrade] = useState<string>('Roofing');
  const [activePin, setActivePin] = useState<string>('1442');
  const [photoMode, setPhotoMode] = useState<'after' | 'before'>('after');

  const currentData = HERO_TRADES[selectedTrade] || HERO_TRADES.Roofing;
  const activePinObj = NEIGHBOR_PINS.find((p) => p.id === activePin) || NEIGHBOR_PINS[1];

  return (
    <div className={styles.heroContainer} aria-label="Interactive 1-Mile Geofence Halo Visual">
      {/* Top Command Center Bar */}
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <span className={styles.liveBeaconDot} />
          <span className={styles.topBarTitle}>
            1.0-Mile Geofence Active: <strong>{currentData.streetName}, {currentData.city}</strong>
          </span>
        </div>

        <div className={styles.topBarPills}>
          <div className={styles.tradeSelectBar} role="tablist" aria-label="Switch trade demo">
            {Object.keys(HERO_TRADES).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={selectedTrade === t}
                onClick={() => setSelectedTrade(t)}
                className={`${styles.tradePillBtn} ${selectedTrade === t ? styles.tradePillBtnActive : ''}`}
              >
                {t}
              </button>
            ))}
          </div>

          <span className={styles.budgetPill}>$25 / 5-Day Cap</span>
        </div>
      </div>

      {/* Main Dual-Pane Stage: Tactical Map + Floating Phone */}
      <div className={styles.stageGrid}>
        {/* PANE 1: Tactical 1-Mile Geofence Map */}
        <div className={styles.mapCanvasWrapper}>
          <svg viewBox="0 0 500 500" className={styles.mapSvg} aria-label="Tactical neighborhood geofence radar">
            <defs>
              <radialGradient id="mapRadarBg" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#0a2032" stopOpacity="0.95" />
                <stop offset="65%" stopColor="#04121d" stopOpacity="0.98" />
                <stop offset="100%" stopColor="#02080e" stopOpacity="1" />
              </radialGradient>

              <filter id="haloGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="4.5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Map Canvas Background */}
            <rect width="500" height="500" rx="18" fill="url(#mapRadarBg)" stroke="rgba(56, 189, 248, 0.25)" strokeWidth="1.5" />

            {/* Concentric Distance Rings */}
            <circle cx="250" cy="250" r="55" fill="none" stroke="rgba(56, 189, 248, 0.15)" strokeWidth="1" strokeDasharray="4 4" />
            <text x="255" y="193" fill="#64748b" fontSize="11" fontWeight="600">0.25 mi</text>

            <circle cx="250" cy="250" r="110" fill="none" stroke="rgba(56, 189, 248, 0.18)" strokeWidth="1" strokeDasharray="4 4" />
            <text x="255" y="138" fill="#64748b" fontSize="11" fontWeight="600">0.50 mi</text>

            <circle cx="250" cy="250" r="165" fill="none" stroke="rgba(56, 189, 248, 0.22)" strokeWidth="1.2" strokeDasharray="4 4" />
            <text x="255" y="83" fill="#64748b" fontSize="11" fontWeight="600">0.75 mi</text>

            {/* Pulsing 1-Mile Outer Perimeter */}
            <circle
              cx="250"
              cy="250"
              r="220"
              fill="rgba(56, 189, 248, 0.04)"
              stroke="#38bdf8"
              strokeWidth="2"
              filter="url(#haloGlow)"
            />
            <text x="250" y="26" textAnchor="middle" fill="#38bdf8" fontSize="13" fontWeight="800" letterSpacing="0.06em">
              1.0 MILE GEOFENCE BOUNDARY
            </text>

            {/* Pulsing Radar Expansion Wave */}
            <circle cx="250" cy="250" r="120" fill="none" stroke="rgba(56, 189, 248, 0.4)" strokeWidth="2" className={styles.haloBeamPulse} />

            {/* Crosshairs & Tactical Grid */}
            <line x1="25" y1="250" x2="475" y2="250" stroke="rgba(56, 189, 248, 0.12)" strokeWidth="1.2" />
            <line x1="250" y1="25" x2="250" y2="475" stroke="rgba(56, 189, 248, 0.12)" strokeWidth="1.2" />

            {/* Simulated Street Grid Paths */}
            <path d="M 60 160 Q 250 250 440 340" fill="none" stroke="rgba(148, 163, 184, 0.3)" strokeWidth="5" />
            <path d="M 140 410 L 360 90" fill="none" stroke="rgba(148, 163, 184, 0.22)" strokeWidth="3.5" />

            {/* Street Label */}
            <text x="75" y="148" fill="#94a3b8" fontSize="12" fontWeight="800" letterSpacing="0.05em">
              {currentData.streetName.toUpperCase()}
            </text>

            {/* Rotating Radar Sweep Sector */}
            <g className={styles.radarSweepSector}>
              <line x1="250" y1="250" x2="250" y2="30" stroke="rgba(56, 189, 248, 0.75)" strokeWidth="1.8" />
              <polygon points="250,250 210,30 250,30" fill="rgba(56, 189, 248, 0.14)" />
            </g>

            {/* Central Work Truck Beacon (Completed Job) */}
            <circle cx="250" cy="250" r="22" fill="rgba(249, 115, 22, 0.3)" stroke="var(--accent, #f97316)" strokeWidth="2.5" filter="url(#haloGlow)" />
            <text x="250" y="257" textAnchor="middle" fontSize="18">🚛</text>
            <text x="250" y="287" textAnchor="middle" fill="#f8fafc" fontSize="12" fontWeight="800">
              Completed Jobsite
            </text>
            <text x="250" y="302" textAnchor="middle" fill="#fdba74" fontSize="10.5" fontWeight="600">
              1428 {currentData.streetName}
            </text>

            {/* Dynamic Connecting Beam from Active Pin to Right Edge */}
            <line
              x1={activePinObj.cx}
              y1={activePinObj.cy}
              x2="485"
              y2={activePinObj.cy}
              stroke="#38bdf8"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
            <circle cx="485" cy={activePinObj.cy} r="4.5" fill="#38bdf8" />

            {/* Interactive Neighbor Pins */}
            {NEIGHBOR_PINS.map((pin) => {
              const isSelected = activePin === pin.id;
              return (
                <g
                  key={pin.id}
                  className={`${styles.interactivePin} ${isSelected ? styles.interactivePinActive : ''}`}
                  onClick={() => setActivePin(pin.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Neighbor at ${pin.streetNum} ${currentData.streetName}`}
                >
                  <circle
                    cx={pin.cx}
                    cy={pin.cy}
                    r={isSelected ? 16 : 13}
                    fill={isSelected ? '#0284c7' : '#1e293b'}
                    stroke={isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.4)'}
                    strokeWidth={isSelected ? 2.8 : 1.5}
                    filter={isSelected ? 'url(#haloGlow)' : undefined}
                  />
                  <text x={pin.cx} y={pin.cy + 5} textAnchor="middle" fontSize="12">
                    🏠
                  </text>
                  <rect
                    x={pin.cx - 20}
                    y={pin.cy - 26}
                    width="40"
                    height="16"
                    rx="4"
                    fill={isSelected ? '#0369a1' : 'rgba(15, 23, 42, 0.85)'}
                    stroke={isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.15)'}
                    strokeWidth="1"
                  />
                  <text
                    x={pin.cx}
                    y={pin.cy - 14}
                    textAnchor="middle"
                    fill={isSelected ? '#ffffff' : '#cbd5e1'}
                    fontSize="10"
                    fontWeight={800}
                  >
                    {pin.streetNum}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Interactive Legend & Prompt */}
          <div className={styles.mapLegend}>
            <div className={styles.legendItem}>
              <span style={{ color: 'var(--accent, #f97316)', fontSize: '1.1rem' }}>●</span>
              <strong>Completed Jobsite</strong>
            </div>
            <div className={styles.legendItem}>
              <span style={{ color: '#38bdf8', fontSize: '1.1rem' }}>●</span>
              <strong>Target Neighbors (Click Pins to Preview)</strong>
            </div>
          </div>
        </div>

        {/* PANE 2: Floating Smartphone Ad Mockup */}
        <div className={styles.phoneCardWrapper}>
          <div className={styles.phoneFrame}>
            <div className={styles.phoneHeader}>
              <span>9:41</span>
              <div className={styles.dynamicIsland} />
              <span>5G 􀋦</span>
            </div>

            <div className={styles.adCard}>
              <div className={styles.adHeader}>
                <div className={styles.adAvatar}>{selectedTrade.charAt(0)}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong style={{ fontSize: '1.02rem', color: '#f8fafc', display: 'block' }}>
                    Apex {selectedTrade} Co.
                  </strong>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block' }}>
                    Sponsored &middot; 1-Mile Radius of {currentData.streetName}
                  </span>
                </div>
                <span style={{ color: '#64748b', fontSize: '1.2rem' }}>•••</span>
              </div>

              <p className={styles.adBodyText}>
                📍 Just finished on <strong>{currentData.streetName}</strong>! Save <strong>${currentData.clusterDiscount}</strong> with our street cluster discount when our crews are on your block this week.
              </p>

              {/* Craftsmanship Before/After Card */}
              <div className={styles.craftVisualBox}>
                <div className={styles.photoToggle}>
                  <button
                    type="button"
                    className={`${styles.photoBtn} ${photoMode === 'after' ? styles.photoBtnActive : ''}`}
                    onClick={() => setPhotoMode('after')}
                  >
                    ✨ After (Completed)
                  </button>
                  <button
                    type="button"
                    className={`${styles.photoBtn} ${photoMode === 'before' ? styles.photoBtnActive : ''}`}
                    onClick={() => setPhotoMode('before')}
                  >
                    📸 Before (Initial)
                  </button>
                </div>

                <strong className={styles.craftTitle}>
                  {photoMode === 'after' ? currentData.afterPhoto : currentData.beforePhoto}
                </strong>
                <span className={styles.craftSub}>
                  Verified on {currentData.streetName} &middot; 100% Privacy Redacted
                </span>
              </div>

              <div className={styles.adFooter}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    LETSGETQUOTED.COM
                  </span>
                  <strong style={{ fontSize: '0.88rem', display: 'block', color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {currentData.scopeSummary}
                  </strong>
                </div>
                <button type="button" className={styles.adCtaBtn}>
                  Claim Discount &rarr;
                </button>
              </div>
            </div>

            {/* Target Neighbor Inbound Status Indicator */}
            <div className={styles.phoneNotificationTag}>
              <span style={{ fontSize: '1rem' }}>⚡</span>
              <span>
                <strong>Targeting {activePinObj.streetNum} {currentData.streetName}</strong> &middot; {activePinObj.offset}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Telemetry Bar */}
      <div className={styles.bottomTelemetryBar}>
        <div className={styles.telemetryCell}>
          <span>📍</span>
          <span>Targeting: <strong>1,840 Homeowners</strong></span>
        </div>
        <div className={styles.telemetryCell}>
          <span>🛡️</span>
          <span>Privacy: <strong>House # Redacted</strong></span>
        </div>
        <div className={styles.telemetryCell}>
          <span>💰</span>
          <span>Budget: <strong>$5.00/day ($25 cap)</strong></span>
        </div>
        <div className={styles.telemetryCell}>
          <span>⚡</span>
          <span>Detour: <strong>0.0 mi Drive Time</strong></span>
        </div>
      </div>
    </div>
  );
}
