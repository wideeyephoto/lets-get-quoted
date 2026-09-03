'use client';

import { useState, useMemo } from 'react';
import {
  extractStreetAndNeighborhood,
  DEFAULT_HALO_CONFIG,
  applyClusterDiscountWithMarginFloor,
} from '@/lib/neighborhood-halo';
import { buildHaloCreativeBundle } from '@/lib/neighborhood-halo-ai';
import HaloRadarMap from './HaloRadarMap';
import styles from './neighborhood-halo.module.css';

const DEMO_TRADES = [
  'Roofing',
  'Plumbing',
  'HVAC',
  'Electrical',
  'Landscaping',
  'Painting',
  'Siding & Gutters',
];

const PRESET_JOBS: Record<string, { address: string; scope: string; city: string; beforeLabel: string; afterLabel: string }> = {
  Roofing: {
    address: '1428 Maple Ave, Rochester, MI 48307',
    scope: 'Complete Architectural Shingle Roof Replacement',
    city: 'Rochester, MI',
    beforeLabel: 'Worn, Curling 3-Tab Shingles with Wind Creasing',
    afterLabel: '50-Yr Architectural Shingles & Ridge Venting',
  },
  Plumbing: {
    address: '382 Whispering Pines Dr, Austin, TX 78704',
    scope: 'Whole-Home Tankless Water Heater Installation',
    city: 'Austin, TX',
    beforeLabel: 'Leaking 50-Gal Tank with Heavy Mineral Corrosion',
    afterLabel: 'Dual Rinnai High-Efficiency Tankless System',
  },
  HVAC: {
    address: '714 Highland Park Blvd, Denver, CO 80202',
    scope: 'High-Efficiency Dual-Zone Heat Pump Upgrade',
    city: 'Denver, CO',
    beforeLabel: '20-Yr R-22 Condenser Short-Cycling in Summer',
    afterLabel: 'Inverter Variable-Speed Heat Pump (20 SEER2)',
  },
  Electrical: {
    address: '220 Lakewood Terrace, Tampa, FL 33602',
    scope: '200A Electrical Service Panel & EV Charger Install',
    city: 'Tampa, FL',
    beforeLabel: 'Outdated 100A Fuse Box with Dangerous Tandem Breakers',
    afterLabel: 'Siemens 200A Whole-Home Surge Panel + Level 2 EV Charger',
  },
  Landscaping: {
    address: '519 Oakridge Way, Phoenix, AZ 85001',
    scope: 'Custom Paver Patio & Drought-Tolerant Xeriscaping',
    city: 'Phoenix, AZ',
    beforeLabel: 'Overgrown Weeds & Sun-Baked Dirt Yard',
    afterLabel: 'Belgard Paver Living Space with Native Desert Flora',
  },
  Painting: {
    address: '890 Crescent Moon Ln, Charlotte, NC 28202',
    scope: 'Exterior Siding Repaint & Trim Restoration',
    city: 'Charlotte, NC',
    beforeLabel: 'Peeling, Chalked Paint & Weathered Fascia',
    afterLabel: 'Sherwin-Williams Emerald Exterior in Modern Charcoal',
  },
  'Siding & Gutters': {
    address: '412 Cedar Brook Rd, Columbus, OH 43215',
    scope: 'Board & Batten Siding with Seamless Black Gutters',
    city: 'Columbus, OH',
    beforeLabel: 'Faded Aluminum Siding with Sagging Seamed Gutters',
    afterLabel: 'James Hardie Board & Batten + 6-Inch Seamless Black Gutters',
  },
};

export default function NeighborhoodHaloSimulator() {
  const [trade, setTrade] = useState('Roofing');
  const [rawAddress, setRawAddress] = useState(PRESET_JOBS.Roofing.address);
  const [scopeSummary, setScopeSummary] = useState(PRESET_JOBS.Roofing.scope);
  const [stormSurgeActive, setStormSurgeActive] = useState(false);
  const [activeTab, setActiveTab] = useState<'meta' | 'radar' | 'google' | 'cluster' | 'sms' | 'budget'>('meta');
  const [selectedClusterTier, setSelectedClusterTier] = useState<number>(2);
  const [photoMode, setPhotoMode] = useState<'after' | 'before'>('after');

  const businessName = `Apex ${trade} Co.`;
  const currentPreset = PRESET_JOBS[trade] || PRESET_JOBS.Roofing;

  // Update presets when trade changes
  const handleTradeChange = (newTrade: string) => {
    setTrade(newTrade);
    const preset = PRESET_JOBS[newTrade] || PRESET_JOBS.Roofing;
    setRawAddress(preset.address);
    setScopeSummary(preset.scope);
  };

  // Address sanitization
  const addressInfo = useMemo(() => {
    return extractStreetAndNeighborhood(rawAddress);
  }, [rawAddress]);

  // Halo AI Creative Generation
  const creativeBundle = useMemo(() => {
    return buildHaloCreativeBundle({
      trade,
      businessName,
      streetName: addressInfo.streetName,
      neighborhoodName: addressInfo.neighborhoodName,
      city: addressInfo.city || 'Local Area',
      state: addressInfo.state,
      scopeSummary,
      weatherSurge: stormSurgeActive
        ? {
            surgeActive: true,
            surgeTitle: 'Severe Weather / Storm Damage Surge',
            recommendedAngle: 'storm_seasonal',
            recommendedBudgetBoostPct: 30,
            rationale: 'High local search volume during storm conditions',
          }
        : null,
    });
  }, [trade, businessName, addressInfo, scopeSummary, stormSurgeActive]);

  // Cluster discount calculation
  const sampleJobPrice = trade === 'Roofing' ? 12500 : trade === 'HVAC' ? 9500 : 4500;
  const clusterDiscountAmount = selectedClusterTier === 1 ? 100 : selectedClusterTier === 2 ? 250 : 500;
  const clusterCalculation = useMemo(() => {
    return applyClusterDiscountWithMarginFloor(sampleJobPrice, clusterDiscountAmount, 10);
  }, [sampleJobPrice, clusterDiscountAmount]);

  const streetNamePreview = addressInfo.streetName;

  return (
    <div className={styles.simulatorContainer}>
      {/* Top Controls Bar */}
      <div className={styles.controlsBar}>
        <div className={styles.inputGroup}>
          <div className={styles.controlField}>
            <label className={styles.controlLabel} htmlFor="halo-trade-select">Contractor Trade</label>
            <select
              id="halo-trade-select"
              value={trade}
              onChange={(e) => handleTradeChange(e.target.value)}
              className={styles.customSelect}
            >
              {DEMO_TRADES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.controlField}>
            <label className={styles.controlLabel} htmlFor="halo-address-input">Completed Jobsite Address</label>
            <input
              id="halo-address-input"
              type="text"
              value={rawAddress}
              onChange={(e) => setRawAddress(e.target.value)}
              className={styles.textInput}
              placeholder="e.g. 1428 Maple Ave, Rochester, MI"
            />
          </div>

          <div className={styles.controlField}>
            <label className={styles.controlLabel}>Surge Intelligence</label>
            <button
              type="button"
              onClick={() => setStormSurgeActive(!stormSurgeActive)}
              className={styles.surgeToggleBtn}
              style={{
                background: stormSurgeActive
                  ? 'rgba(234, 179, 8, 0.25)'
                  : 'rgba(15, 23, 42, 0.9)',
                border: stormSurgeActive
                  ? '1px solid #eab308'
                  : '1px solid rgba(255, 255, 255, 0.16)',
                color: stormSurgeActive ? '#facc15' : '#cbd5e1',
              }}
            >
              {stormSurgeActive ? '⛈️ Storm Surge (+30%)' : '☀️ Normal Pacing'}
            </button>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <span className={styles.controlLabel}>
            Micro-Budget Pacing
          </span>
          <strong style={{ fontSize: '1.25rem', color: 'var(--accent, #f97316)', display: 'block' }}>
            ${stormSurgeActive ? 32.5 : DEFAULT_HALO_CONFIG.defaultBudgetDollars} / 5 Days
          </strong>
        </div>
      </div>

      {/* Sleek Geofence Live Telemetry Strip */}
      <div className={styles.geofenceHud}>
        <div className={styles.hudLeft}>
          <div className={styles.radarPulse} aria-hidden="true">📍</div>
          <div>
            <h4 className={styles.hudTitle}>
              1.0-Mile Geofence Locked &middot; {addressInfo.sanitizedAddress}
            </h4>
            <p className={styles.hudSubtitle}>
              Targeting adjacent homeowners on {streetNamePreview} with privacy protection.
            </p>
          </div>
        </div>

        <div className={styles.hudPills}>
          <span className={`${styles.hudPill} ${styles.hudPillHighlight}`}>
            🛡️ House # Redacted
          </span>
          <span className={styles.hudPill}>
            Radius: 1.0 Mile (5,280 ft)
          </span>
          <span className={styles.hudPill}>
            ${stormSurgeActive ? '6.50' : '5.00'}/day Pacing
          </span>
          <span className={styles.hudPill}>
            72h Auto-Kill Safe
          </span>
        </div>
      </div>

      {/* Preview Tabs Navigation */}
      <div className={styles.previewTabs} role="tablist" aria-label="Halo campaign previews">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'meta'}
          onClick={() => setActiveTab('meta')}
          className={`${styles.tabBtn} ${activeTab === 'meta' ? styles.tabBtnActive : ''}`}
        >
          📸 Meta Ad
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'radar'}
          onClick={() => setActiveTab('radar')}
          className={`${styles.tabBtn} ${activeTab === 'radar' ? styles.tabBtnActive : ''}`}
        >
          📡 1-Mile Radar
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'google'}
          onClick={() => setActiveTab('google')}
          className={`${styles.tabBtn} ${activeTab === 'google' ? styles.tabBtnActive : ''}`}
        >
          🔍 Google Ads
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'cluster'}
          onClick={() => setActiveTab('cluster')}
          className={`${styles.tabBtn} ${activeTab === 'cluster' ? styles.tabBtnActive : ''}`}
        >
          🏘️ Street Cluster
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'sms'}
          onClick={() => setActiveTab('sms')}
          className={`${styles.tabBtn} ${activeTab === 'sms' ? styles.tabBtnActive : ''}`}
        >
          ⚡ Speed-to-Lead
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'budget'}
          onClick={() => setActiveTab('budget')}
          className={`${styles.tabBtn} ${activeTab === 'budget' ? styles.tabBtnActive : ''}`}
        >
          🛡️ $25 Guard
        </button>
      </div>

      {/* TAB 0: Interactive Geofence Radar Map */}
      {activeTab === 'radar' && (
        <HaloRadarMap
          streetName={streetNamePreview}
          trade={trade}
          activeClusterTier={selectedClusterTier}
        />
      )}

      {/* TAB 1: Meta Ad Preview */}
      {activeTab === 'meta' && (
        <div className={styles.socialMockup}>
          <div className={styles.socialHeader}>
            <div className={styles.socialAvatar}>{trade.charAt(0)}</div>
            <div>
              <strong style={{ fontSize: '0.92rem', display: 'block', color: '#f8fafc' }}>{businessName}</strong>
              <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                Sponsored &middot; 1.0-Mile Geofence around {streetNamePreview}
              </span>
            </div>
          </div>

          <div className={styles.socialBody}>
            {creativeBundle.metaAd.primaryText}
          </div>

          <div className={styles.mediaCraftFrame}>
            <div className={styles.photoToggleBar}>
              <button
                type="button"
                className={`${styles.photoToggleBtn} ${photoMode === 'after' ? styles.photoToggleBtnActive : ''}`}
                onClick={() => setPhotoMode('after')}
              >
                ✨ After (Completed Craftsmanship)
              </button>
              <button
                type="button"
                className={`${styles.photoToggleBtn} ${photoMode === 'before' ? styles.photoToggleBtnActive : ''}`}
                onClick={() => setPhotoMode('before')}
              >
                📸 Before (Initial State)
              </button>
            </div>

            <div className={styles.craftsmanshipCard}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>
                {photoMode === 'after' ? '🏡 ✨ 🔨' : '🏚️ ⚠️ 🔍'}
              </div>
              <strong style={{ fontSize: '1.05rem', color: '#f8fafc', display: 'block', marginBottom: '4px' }}>
                {photoMode === 'after' ? currentPreset.afterLabel : currentPreset.beforeLabel}
              </strong>
              <span style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: 600 }}>
                {photoMode === 'after' ? `Verified Project on ${streetNamePreview}` : `Documented Condition on ${streetNamePreview}`}
              </span>
            </div>
          </div>

          <div className={styles.socialFooter}>
            <div>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                letsgetquoted.com/{trade.toLowerCase().replace(/[^a-z]/g, '')}
              </span>
              <strong style={{ fontSize: '0.92rem', display: 'block', color: '#f1f5f9' }}>
                {creativeBundle.metaAd.headline}
              </strong>
            </div>
            <button type="button" className={styles.socialCtaBtn}>
              {creativeBundle.metaAd.callToAction}
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: Google Local RSA Preview */}
      {activeTab === 'google' && (
        <div className={styles.serpPreview}>
          <div className={styles.serpUrl}>
            <span className={styles.adPill}>Sponsored</span>
            <span>https://{trade.toLowerCase().replace(/[^a-z]/g, '')}-pro.letsgetquoted.com/{addressInfo.city ? addressInfo.city.toLowerCase().replace(/[^a-z0-9]/g, '') : 'local'}</span>
          </div>
          <span className={styles.serpTitle}>
            {creativeBundle.googleAd.headlines[0]} &middot; {creativeBundle.googleAd.headlines[1] || businessName}
          </span>
          <p className={styles.serpSnippet}>
            {creativeBundle.googleAd.descriptions[0]}
          </p>
          <div className={styles.serpSitelinks}>
            <div>
              <div className={styles.sitelinkTitle}>{streetNamePreview} Neighbor Discount</div>
              <div className={styles.sitelinkDesc}>$100 to $500 off with street batching</div>
            </div>
            <div>
              <div className={styles.sitelinkTitle}>
                {stormSurgeActive ? 'Free Drone Storm Check' : 'Fast Written Quote'}
              </div>
              <div className={styles.sitelinkDesc}>Verified pricing in 15 minutes</div>
            </div>
            <div>
              <div className={styles.sitelinkTitle}>Verified Local Reviews</div>
              <div className={styles.sitelinkDesc}>4.9★ rating from local homeowners</div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Street Cluster Group Pricing */}
      {activeTab === 'cluster' && (
        <div className={styles.clusterContainer}>
          <h4 style={{ margin: '0 0 0.35rem', fontSize: '1.15rem', color: '#f8fafc' }}>
            🏘️ Active Street Cluster Group Pricing Engine
          </h4>
          <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: '#94a3b8' }}>
            Turn 1 completed job on {streetNamePreview} into 3–5 same-day appointments. Neighbors save together while your estimators eliminate drive time.
          </p>

          <div className={styles.clusterTierGrid}>
            <div
              className={`${styles.clusterCard} ${selectedClusterTier === 1 ? styles.clusterCardActive : ''}`}
              onClick={() => setSelectedClusterTier(1)}
            >
              <span style={{ fontSize: '0.78rem', color: '#cbd5e1', fontWeight: 700 }}>2 Homes on Street</span>
              <div className={styles.clusterDiscount}>$100 OFF</div>
              <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>Per participating home</span>
            </div>

            <div
              className={`${styles.clusterCard} ${selectedClusterTier === 2 ? styles.clusterCardActive : ''}`}
              onClick={() => setSelectedClusterTier(2)}
            >
              <span style={{ fontSize: '0.78rem', color: '#cbd5e1', fontWeight: 700 }}>3+ Homes on Street</span>
              <div className={styles.clusterDiscount}>$250 OFF</div>
              <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>Most Popular Batch</span>
            </div>

            <div
              className={`${styles.clusterCard} ${selectedClusterTier === 3 ? styles.clusterCardActive : ''}`}
              onClick={() => setSelectedClusterTier(3)}
            >
              <span style={{ fontSize: '0.78rem', color: '#cbd5e1', fontWeight: 700 }}>5+ Homes / HOA Rate</span>
              <div className={styles.clusterDiscount}>$500 OFF</div>
              <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>Neighborhood Tier</span>
            </div>
          </div>

          {/* Interactive Route Street Frame */}
          <div className={styles.routeStreetFrame}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Same-Day Route Density Batch ({streetNamePreview})
              </span>
              <span style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 700 }}>
                ⚡ 0 Miles Windshield Time
              </span>
            </div>

            <div className={styles.streetHouseStrip}>
              <div className={`${styles.houseBlock} ${styles.houseBlockCompleted}`}>
                <strong>House #1</strong>
                <div>Completed Today</div>
              </div>
              <div className={`${styles.houseBlock} ${styles.houseBlockBooked}`}>
                <strong>House #2</strong>
                <div>1:00 PM (-${clusterDiscountAmount})</div>
              </div>
              <div className={`${styles.houseBlock} ${selectedClusterTier >= 2 ? styles.houseBlockBooked : ''}`}>
                <strong>House #3</strong>
                <div>{selectedClusterTier >= 2 ? `2:15 PM (-$${clusterDiscountAmount})` : 'Eligible'}</div>
              </div>
              <div className={`${styles.houseBlock} ${selectedClusterTier >= 3 ? styles.houseBlockBooked : ''}`}>
                <strong>House #4</strong>
                <div>{selectedClusterTier >= 3 ? `3:30 PM (-$${clusterDiscountAmount})` : 'Eligible'}</div>
              </div>
              <div className={`${styles.houseBlock} ${selectedClusterTier >= 3 ? styles.houseBlockBooked : ''}`}>
                <strong>House #5</strong>
                <div>{selectedClusterTier >= 3 ? `4:45 PM (-$${clusterDiscountAmount})` : 'Eligible'}</div>
              </div>
            </div>
          </div>

          <div style={{ background: 'rgba(30, 41, 59, 0.6)', padding: '0.95rem 1.15rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '0.88rem' }}>
              <span style={{ color: '#cbd5e1' }}>Representative Job Scope:</span>
              <strong>${sampleJobPrice.toLocaleString()}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '0.88rem' }}>
              <span style={{ color: '#34d399' }}>Applied Cluster Discount:</span>
              <strong style={{ color: '#34d399' }}>-${clusterCalculation.appliedDiscountDollars}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', paddingTop: '5px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ color: '#cbd5e1' }}>Discounted Homeowner Price:</span>
              <strong style={{ color: '#f8fafc' }}>
                ${(sampleJobPrice - clusterCalculation.appliedDiscountDollars).toLocaleString()}
              </strong>
            </div>
          </div>

          <div className={styles.viralLinkBox}>
            <span style={{ fontSize: '0.74rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Generated Viral Neighbor Booking Link:
            </span>
            <div className={styles.viralLinkCode}>
              https://apex-{trade.toLowerCase().replace(/[^a-z]/g, '')}.letsgetquoted.com/street/{streetNamePreview.toLowerCase().replace(/[^a-z0-9]/g, '-')}-discount
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Speed-to-Lead SMS (Phone Frame) */}
      {activeTab === 'sms' && (
        <div className={styles.phoneChrome}>
          <div className={styles.phoneNotchBar}>
            <span>9:41</span>
            <div className={styles.dynamicIsland} />
            <span>5G 􀋦</span>
          </div>

          <div className={styles.smsHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.1rem' }}>💬</span>
              <div>
                <strong style={{ display: 'block', color: '#f8fafc', fontSize: '0.88rem' }}>{streetNamePreview} Lead</strong>
                <span style={{ fontSize: '0.7rem', color: '#38bdf8' }}>Online via Meta Ad</span>
              </div>
            </div>
            <span style={{ color: '#34d399', fontWeight: 800, fontSize: '0.75rem', background: 'rgba(52, 211, 153, 0.15)', padding: '2px 8px', borderRadius: '6px' }}>
              ⚡ 12s AI Auto-Response
            </span>
          </div>

          <div className={styles.smsBubbleStream}>
            <div className={styles.smsBubbleIn}>
              <em>Homeowner clicks Meta Halo Ad from {streetNamePreview}</em>
              <p style={{ margin: '6px 0 0' }}>
                Hi, I live down on {streetNamePreview} and saw your work truck today. Can you give me an estimate for our home?
              </p>
              <span className={styles.smsTimeTag}>10:14:02 AM</span>
            </div>

            <div className={styles.smsBubbleOut}>
              <p style={{ margin: 0 }}>
                Hi John! Thanks for reaching out to {businessName}. We just finished a project on {streetNamePreview}! Because our crews and trucks are already scheduled on your street this week, your home qualifies for our <strong>${clusterDiscountAmount} neighbor cluster discount</strong>.
              </p>
              <p style={{ margin: '6px 0 0' }}>
                Would tomorrow morning (10:00 AM) or afternoon (2:00 PM) work better for our estimator to stop by?
              </p>
              <span className={styles.smsTimeTag}>10:14:14 AM (12s later &middot; Automated by AI)</span>
            </div>

            <div className={styles.smsBubbleIn}>
              <p style={{ margin: 0 }}>
                Tomorrow at 10:00 AM would be great, thanks!
              </p>
              <span className={styles.smsTimeTag}>10:14:48 AM</span>
            </div>

            <div className={styles.smsBubbleOut}>
              <p style={{ margin: 0 }}>
                You’re confirmed for 10:00 AM! Our estimator will see you then on {streetNamePreview}.
              </p>
              <span className={styles.smsTimeTag}>10:14:55 AM &middot; Appointment Booked on Route</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Budget Pacing & Auto-Kill Guard */}
      {activeTab === 'budget' && (
        <div className={styles.budgetCard}>
          <h4 style={{ margin: '0 0 0.35rem', fontSize: '1.15rem', color: '#f8fafc' }}>
            🛡️ $25 / 5-Day Micro-Budget with 72-Hour Auto-Kill
          </h4>
          <p style={{ margin: '0 0 1.25rem', fontSize: '0.85rem', color: '#94a3b8' }}>
            Traditional agencies burn thousands testing cold audiences. Let’s Get Quoted deploys surgical $25 micro-budgets that automatically terminate if neighbors don&apos;t engage.
          </p>

          <div className={styles.budgetTimeline}>
            <div className={styles.timelineConnector} />
            <div className={styles.timelineStep}>
              <div className={styles.timelineStepDot}>D1</div>
              <span style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>Launch</span>
              <strong style={{ display: 'block', fontSize: '0.8rem', color: '#38bdf8' }}>$5/day</strong>
            </div>
            <div className={styles.timelineStep}>
              <div className={styles.timelineStepDot}>D2</div>
              <span style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>Pacing</span>
              <strong style={{ display: 'block', fontSize: '0.8rem', color: '#38bdf8' }}>$5/day</strong>
            </div>
            <div className={styles.timelineStep}>
              <div className={styles.timelineStepDot} style={{ borderColor: '#f87171', color: '#f87171', background: 'rgba(239, 68, 68, 0.2)' }}>72h</div>
              <span style={{ fontSize: '0.78rem', color: '#f87171', fontWeight: 800 }}>Auto-Kill Gate</span>
              <strong style={{ display: 'block', fontSize: '0.78rem', color: '#f87171' }}>Check</strong>
            </div>
            <div className={styles.timelineStep}>
              <div className={styles.timelineStepDot}>D4</div>
              <span style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>Pacing</span>
              <strong style={{ display: 'block', fontSize: '0.8rem', color: '#38bdf8' }}>$5/day</strong>
            </div>
            <div className={styles.timelineStep}>
              <div className={styles.timelineStepDot} style={{ borderColor: '#34d399', color: '#34d399', background: 'rgba(52, 211, 153, 0.2)' }}>D5</div>
              <span style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>Wrap</span>
              <strong style={{ display: 'block', fontSize: '0.8rem', color: '#34d399' }}>Complete</strong>
            </div>
          </div>

          <div className={styles.autoKillCallout}>
            <span style={{ fontSize: '1.4rem' }}>⚡</span>
            <div>
              <strong style={{ color: '#fecaca', fontSize: '0.92rem' }}>72-Hour Auto-Kill Rule:</strong>
              <p style={{ margin: '4px 0 0', color: '#fca5a5' }}>
                If a halo ad accumulates &ge;150 impressions with 0 clicks after 72 hours, the campaign automatically pauses. The remaining unspent balance ($10–$15) is instantly reallocated to your primary Google Search budget so not a single penny is wasted.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
