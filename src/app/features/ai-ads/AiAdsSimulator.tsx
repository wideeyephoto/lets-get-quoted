'use client';

import { useState } from 'react';
import { SMART_BUNDLES, getSmartBundle, type SmartBundleId } from '@/lib/multi-channel-ads';
import styles from './ai-ads.module.css';

const DEMO_TRADES = ['Roofing', 'Plumbing', 'HVAC', 'Electrical', 'Landscaping', 'Painting'];
const DEMO_CITIES = ['Austin, TX', 'Dallas, TX', 'Denver, CO', 'Tampa, FL', 'Phoenix, AZ'];

export default function AiAdsSimulator() {
  const [trade, setTrade] = useState('Roofing');
  const [city, setCity] = useState('Austin, TX');
  const [selectedBundleId, setSelectedBundleId] = useState<SmartBundleId>('growth');
  const [previewTab, setPreviewTab] = useState<'google' | 'social' | 'retargeting'>('google');

  const bundle = getSmartBundle(selectedBundleId);

  return (
    <div className={styles.simulatorContainer}>
      {/* Controls */}
      <div className={styles.controlsBar}>
        <div className={styles.selectGroup}>
          <label>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
              Your Trade
            </span>
            <select
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              className={styles.customSelect}
            >
              {DEMO_TRADES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
              Your Service City
            </span>
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={styles.customSelect}
            >
              {DEMO_CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>
            Estimated Monthly Reach
          </span>
          <strong style={{ fontSize: '1.1rem', color: 'var(--accent, #f97316)' }}>
            {selectedBundleId === 'starter' ? '35–55 Clicks · 6–10 Leads' : selectedBundleId === 'growth' ? '80–120 Clicks · 14–22 Leads' : '180–260 Clicks · 30–45 Leads'}
          </strong>
        </div>
      </div>

      {/* Smart Bundle Cards */}
      <div className={styles.bundleGrid}>
        {SMART_BUNDLES.map((b) => {
          const isActive = b.id === selectedBundleId;
          return (
            <div
              key={b.id}
              onClick={() => setSelectedBundleId(b.id)}
              className={`${styles.bundleCard} ${isActive ? styles.bundleCardActive : ''}`}
            >
              {b.badge && <span className={styles.popularBadge}>{b.badge}</span>}
              <h4 className={styles.bundleTitle}>{b.name}</h4>
              <div className={styles.bundlePrice}>${b.totalMonthlyDollars}/mo</div>
              <p className={styles.bundleChannels}>{b.estimatedLeadsRange} · {b.features[0]}</p>
            </div>
          );
        })}
      </div>

      {/* Preview Tabs */}
      <div className={styles.previewTabs}>
        <button
          type="button"
          onClick={() => setPreviewTab('google')}
          className={`${styles.tabBtn} ${previewTab === 'google' ? styles.tabBtnActive : ''}`}
        >
          📱 Google Search Ad
        </button>
        <button
          type="button"
          onClick={() => setPreviewTab('social')}
          className={`${styles.tabBtn} ${previewTab === 'social' ? styles.tabBtnActive : ''}`}
        >
          📸 Instagram & Facebook
        </button>
        <button
          type="button"
          onClick={() => setPreviewTab('retargeting')}
          className={`${styles.tabBtn} ${previewTab === 'retargeting' ? styles.tabBtnActive : ''}`}
        >
          🎯 Display Retargeting
        </button>
      </div>

      {/* Previews */}
      {previewTab === 'google' && (
        <div className={styles.serpPreview}>
          <div className={styles.serpUrl}>
            <span className={styles.adPill}>Sponsored</span>
            <span>https://{trade.toLowerCase()}-pro.letsgetquoted.com/{city.split(',')[0].toLowerCase().trim()}</span>
          </div>
          <a href="#demo" onClick={(e) => e.preventDefault()} className={styles.serpTitle}>
            Top-Rated {trade} in {city.split(',')[0]} · 24/7 Fast Local Dispatch
          </a>
          <p className={styles.serpSnippet}>
            Licensed, Insured & 5-Star Rated. Upfront pricing with free estimates and 0% financing available. Call now or book online in 60 seconds.
          </p>
          <div className={styles.serpSitelinks}>
            <div>
              <div className={styles.sitelinkTitle}>Free Estimate</div>
              <div className={styles.sitelinkDesc}>Fast written quote in 15 mins</div>
            </div>
            <div>
              <div className={styles.sitelinkTitle}>Emergency Service</div>
              <div className={styles.sitelinkDesc}>Immediate local crew dispatch</div>
            </div>
            <div>
              <div className={styles.sitelinkTitle}>Customer Reviews</div>
              <div className={styles.sitelinkDesc}>4.9★ rating from 140+ locals</div>
            </div>
          </div>
        </div>
      )}

      {previewTab === 'social' && (
        <div className={styles.socialMockup}>
          <div className={styles.socialHeader}>
            <div className={styles.socialAvatar}>{trade.charAt(0)}</div>
            <div>
              <strong style={{ fontSize: '0.85rem', display: 'block' }}>Apex {trade} of {city.split(',')[0]}</strong>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Sponsored · Paid Social Feed</span>
            </div>
          </div>
          <div className={styles.socialBody}>
            🏠 Planning a {trade.toLowerCase()} project in {city.split(',')[0]}? Get an honest, accurate price before you commit. Upfront pricing, 0% financing, and 100% satisfaction guarantee.
          </div>
          <div className={styles.socialImagePlaceholder}>
            ✨ Premium {trade} Transformation
          </div>
          <div className={styles.socialFooter}>
            <div>
              <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>letsgetquoted.com</span>
              <strong style={{ fontSize: '0.85rem', display: 'block' }}>Get a Fast Written Estimate</strong>
            </div>
            <button type="button" className={styles.socialCtaBtn}>
              Get Quote
            </button>
          </div>
        </div>
      )}

      {previewTab === 'retargeting' && (
        <div className={styles.bannerMockup}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent, #f97316)', fontWeight: 800 }}>
            Homeowner Retargeting Banner · Google Display Network
          </span>
          <h3 style={{ fontSize: '1.25rem', margin: '0.5rem 0' }}>
            Still Need {trade} in {city.split(',')[0]}?
          </h3>
          <p style={{ fontSize: '0.88rem', color: '#cbd5e1', maxWidth: '480px', margin: '0 auto 1rem' }}>
            We saved your estimate request! Take an extra <strong>$100 OFF</strong> when you schedule this week.
          </p>
          <button
            type="button"
            style={{
              background: 'var(--accent, #f97316)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '0.5rem 1.25rem',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            Claim $100 Off Estimate
          </button>
        </div>
      )}

      {/* AI Smart Shield Live Status */}
      <div className={styles.smartShieldBand}>
        <div className={styles.shieldItem}>
          <span className={styles.shieldDot} />
          <span><strong>Weather Surge:</strong> Auto +25% in storms/freezes</span>
        </div>
        <div className={styles.shieldItem}>
          <span className={styles.shieldDot} />
          <span><strong>Capacity Guard:</strong> Auto-pauses if fully booked</span>
        </div>
        <div className={styles.shieldItem}>
          <span className={styles.shieldDot} />
          <span><strong>Speed-to-Lead:</strong> Sub-60s auto-SMS response</span>
        </div>
      </div>

      {/* Agency Comparison */}
      <div className={styles.feeComparison}>
        <div>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'block' }}>Typical Marketing Agency</span>
          <span className={styles.feeOld}>$2,500/mo Retainer + Markup</span>
        </div>
        <div>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'block' }}>Let’s Get Quoted Autopilot</span>
          <span className={styles.feeNew}>15% Transparent Fee (${bundle.platformFeeDollars}/mo)</span>
        </div>
      </div>
    </div>
  );
}
