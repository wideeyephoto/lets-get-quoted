'use client';

import { useState, useMemo } from 'react';
import { SMART_BUNDLES, getSmartBundle, type SmartBundleId } from '@/lib/multi-channel-ads';
import { generateTradeKeywords } from '@/lib/google-ads-generator';
import styles from './ai-ads.module.css';

const DEMO_TRADES = ['Roofing', 'Plumbing', 'HVAC', 'Electrical', 'Landscaping', 'Painting'];
const DEMO_CITIES = ['Austin, TX', 'Dallas, TX', 'Denver, CO', 'Tampa, FL', 'Phoenix, AZ'];

export default function AiAdsSimulator() {
  const [trade, setTrade] = useState('Roofing');
  const [city, setCity] = useState('Austin, TX');
  const [selectedBundleId, setSelectedBundleId] = useState<SmartBundleId>('growth');
  const [previewTab, setPreviewTab] = useState<'google' | 'social' | 'retargeting' | 'sms' | 'keywords'>('google');

  // ROI Calculator state
  const [avgTicketDollars, setAvgTicketDollars] = useState(6500);
  const [closeRatePct, setCloseRatePct] = useState(25);
  const [weatherSurgeActive, setWeatherSurgeActive] = useState(false);

  const bundle = getSmartBundle(selectedBundleId);

  // Dynamic calculations
  const projectedLeads = useMemo(() => {
    const base = selectedBundleId === 'starter' ? 14 : selectedBundleId === 'growth' ? 20 : 38;
    return weatherSurgeActive ? Math.round(base * 1.25) : base;
  }, [selectedBundleId, weatherSurgeActive]);

  const projectedWonJobs = Math.max(1, Math.round(projectedLeads * (closeRatePct / 100)));
  const projectedRevenueDollars = projectedWonJobs * avgTicketDollars;
  const totalCostDollars = bundle.totalMonthlyDollars;
  const roasMultiplier = Math.round((projectedRevenueDollars / totalCostDollars) * 10) / 10;

  // Keyword extraction for chosen trade
  const { allKeywords, negativeKeywords } = useMemo(() => {
    return generateTradeKeywords(['Emergency Repairs', 'Installation & Replacement', 'Maintenance'], city, trade);
  }, [city, trade]);

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

          <label>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
              Weather Simulation
            </span>
            <button
              type="button"
              onClick={() => setWeatherSurgeActive(!weatherSurgeActive)}
              style={{
                background: weatherSurgeActive ? 'rgba(59, 130, 246, 0.25)' : 'rgba(15, 23, 42, 0.8)',
                border: weatherSurgeActive ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.15)',
                color: weatherSurgeActive ? '#38bdf8' : '#cbd5e1',
                padding: '0.5rem 0.85rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {weatherSurgeActive ? '⛈️ Weather Surge (+25%)' : '☀️ Normal Weather'}
            </button>
          </label>
        </div>

        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>
            Projected Monthly Pipeline
          </span>
          <strong style={{ fontSize: '1.15rem', color: 'var(--accent, #f97316)' }}>
            {projectedLeads} Leads · ~${projectedRevenueDollars.toLocaleString()} Revenue
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
              <div className={styles.bundlePrice}>
                ${b.weeklyAmountDollars}<span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--muted, #94a3b8)' }}>/wk</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '-0.15rem', marginBottom: '0.35rem' }}>
                ~${b.monthlyAverageDollars}/mo avg · ${b.weeklyAdSpendDollars} ads + ${b.weeklyFeeDollars} fee
              </div>
              <p className={styles.bundleChannels}>{b.estimatedLeadsRange} · {b.features[0]}</p>
            </div>
          );
        })}
      </div>

      {/* Navigation Tabs */}
      <div className={styles.previewTabs}>
        <button
          type="button"
          onClick={() => setPreviewTab('google')}
          className={`${styles.tabBtn} ${previewTab === 'google' ? styles.tabBtnActive : ''}`}
        >
          📱 Google Search
        </button>
        <button
          type="button"
          onClick={() => setPreviewTab('social')}
          className={`${styles.tabBtn} ${previewTab === 'social' ? styles.tabBtnActive : ''}`}
        >
          📸 Instagram / Meta
        </button>
        <button
          type="button"
          onClick={() => setPreviewTab('retargeting')}
          className={`${styles.tabBtn} ${previewTab === 'retargeting' ? styles.tabBtnActive : ''}`}
        >
          🎯 Retargeting Banner
        </button>
        <button
          type="button"
          onClick={() => setPreviewTab('sms')}
          className={`${styles.tabBtn} ${previewTab === 'sms' ? styles.tabBtnActive : ''}`}
        >
          ⚡ 60s Speed-to-Lead SMS
        </button>
        <button
          type="button"
          onClick={() => setPreviewTab('keywords')}
          className={`${styles.tabBtn} ${previewTab === 'keywords' ? styles.tabBtnActive : ''}`}
        >
          🔍 Keywords & Waste Filter
        </button>
      </div>

      {/* View 1: Google SERP Preview */}
      {previewTab === 'google' && (
        <div className={styles.serpPreview}>
          <div className={styles.serpUrl}>
            <span className={styles.adPill}>Sponsored</span>
            <span>https://{trade.toLowerCase()}-pro.letsgetquoted.com/{city.split(',')[0].toLowerCase().trim()}</span>
          </div>
          <a href="#demo" onClick={(e) => e.preventDefault()} className={styles.serpTitle}>
            {weatherSurgeActive
              ? `Emergency ${trade} in ${city.split(',')[0]} · Storm & Freeze Dispatch`
              : `Top-Rated ${trade} in ${city.split(',')[0]} · 24/7 Fast Local Dispatch`}
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

      {/* View 2: Social Meta Feed */}
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

      {/* View 3: Retargeting Banner */}
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

      {/* View 4: Speed-to-Lead SMS Chat Animation */}
      {previewTab === 'sms' && (
        <div className={styles.smsDemoFrame}>
          <div className={styles.smsHeader}>
            <span>💬 Live Speed-to-Lead Auto-SMS</span>
            <span style={{ color: '#10b981', fontWeight: 700 }}>⚡ 12s Response Time</span>
          </div>
          <div className={styles.smsBubbleStream}>
            <div className={styles.smsBubbleIn}>
              <em>Homeowner submits web form via Google Search Ad</em>
              <span className={styles.smsTimeTag}>10:14:02 AM</span>
            </div>
            <div className={styles.smsBubbleOut}>
              Hi Sarah, thanks for reaching out to Apex {trade} in {city.split(',')[0]}! We received your estimate request for {trade.toLowerCase()} service. Would tomorrow morning or afternoon work better for our estimator to take a quick look?
              <span className={styles.smsTimeTag}>10:14:14 AM (12s later) · Automated by AI</span>
            </div>
            <div className={styles.smsBubbleIn}>
              Tomorrow at 10:00 AM would be perfect, thank you!
              <span className={styles.smsTimeTag}>10:14:48 AM</span>
            </div>
            <div className={styles.smsBubbleOut}>
              You’re confirmed for 10:00 AM! Our certified estimator will see you then.
              <span className={styles.smsTimeTag}>10:14:55 AM · Lead Booked</span>
            </div>
          </div>
        </div>
      )}

      {/* View 5: Keywords & Negative Waste Explorer */}
      {previewTab === 'keywords' && (
        <div className={styles.keywordExplorer}>
          <h4 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>
            Target Keywords vs. Zero-Waste Negatives ({trade} in {city.split(',')[0]})
          </h4>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: 0 }}>
            Our AI continuously bids on high-intent buyer searches and auto-blocks DIY/salary search terms.
          </p>
          <div className={styles.keywordColumns}>
            <div className={styles.keywordBox}>
              <strong style={{ color: '#34d399', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
                🟢 High-Intent Buyer Keywords Targeted
              </strong>
              <div>
                {allKeywords.slice(0, 8).map((kw) => (
                  <span key={kw} className={styles.keywordPillTarget}>
                    [{kw}]
                  </span>
                ))}
              </div>
            </div>
            <div className={styles.keywordBox}>
              <strong style={{ color: '#f87171', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
                🔴 Wasted Clicks Blocked (Negative Keywords)
              </strong>
              <div>
                {negativeKeywords.slice(0, 10).map((neg) => (
                  <span key={neg} className={styles.keywordPillNegative}>
                    {neg}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Interactive ROI & Revenue Calculator */}
      <div className={styles.roiCalculator}>
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.15rem' }}>
          🧮 Interactive ROI & Revenue Calculator
        </h3>
        <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: '#94a3b8' }}>
          Adjust your average ticket size and closing rate to project your monthly Return on Ad Spend.
        </p>

        <div className={styles.sliderRow}>
          <div className={styles.sliderGroup}>
            <label>
              <span>Average Job Revenue ($)</span>
              <strong>${avgTicketDollars.toLocaleString()}</strong>
            </label>
            <input
              type="range"
              min="1000"
              max="20000"
              step="500"
              value={avgTicketDollars}
              onChange={(e) => setAvgTicketDollars(Number(e.target.value))}
              className={styles.sliderInput}
            />
          </div>

          <div className={styles.sliderGroup}>
            <label>
              <span>Estimate Closing Rate (%)</span>
              <strong>{closeRatePct}%</strong>
            </label>
            <input
              type="range"
              min="10"
              max="50"
              step="5"
              value={closeRatePct}
              onChange={(e) => setCloseRatePct(Number(e.target.value))}
              className={styles.sliderInput}
            />
          </div>
        </div>

        <div className={styles.roiResultsGrid}>
          <div className={styles.roiCard}>
            <div className={styles.roiCardLabel}>Estimated Leads</div>
            <div className={styles.roiCardValue}>{projectedLeads} / mo</div>
          </div>
          <div className={styles.roiCard}>
            <div className={styles.roiCardLabel}>Closed Jobs</div>
            <div className={styles.roiCardValue}>{projectedWonJobs} Jobs</div>
          </div>
          <div className={styles.roiCard}>
            <div className={styles.roiCardLabel}>Gross Revenue</div>
            <div className={styles.roiCardValue}>${projectedRevenueDollars.toLocaleString()}</div>
          </div>
          <div className={styles.roiCard}>
            <div className={styles.roiCardLabel}>Estimated ROAS</div>
            <div className={styles.roiCardValue}>{roasMultiplier}x Return</div>
          </div>
        </div>
      </div>

      {/* AI Smart Shield Live Status */}
      <div className={styles.smartShieldBand}>
        <div className={styles.shieldItem}>
          <span className={styles.shieldDot} />
          <span><strong>Weather Surge:</strong> {weatherSurgeActive ? 'Active (+25% Boost)' : 'Monitoring Weather'}</span>
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
      <table className={styles.comparisonTable}>
        <thead>
          <tr>
            <th>Feature / Cost Component</th>
            <th>Traditional Marketing Agency</th>
            <th style={{ color: 'var(--accent, #f97316)' }}>Let’s Get Quoted Autopilot</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Monthly Management Fee</strong></td>
            <td style={{ color: '#f87171' }}>$2,000 – $3,500/mo Retainer</td>
            <td style={{ color: '#34d399', fontWeight: 700 }}>Flat 15% Platform Fee (${bundle.platformFeeDollars}/mo)</td>
          </tr>
          <tr>
            <td><strong>Direct Click Ad Spend</strong></td>
            <td>Only 25%–35% reaches Google</td>
            <td style={{ color: '#34d399', fontWeight: 700 }}>100% of nominal budget goes to clicks</td>
          </tr>
          <tr>
            <td><strong>Long-Term Commitment</strong></td>
            <td style={{ color: '#f87171' }}>6–12 Month Lock-In Contract</td>
            <td style={{ color: '#34d399', fontWeight: 700 }}>Cancel, pause, or adjust anytime</td>
          </tr>
          <tr>
            <td><strong>Speed-to-Lead AI Response</strong></td>
            <td>Manual contractor follow-up</td>
            <td style={{ color: '#34d399', fontWeight: 700 }}>⚡ Auto-texts lead in under 60 seconds</td>
          </tr>
          <tr>
            <td><strong>Closed-Loop Won Revenue Sync</strong></td>
            <td>Basic click-tracking only</td>
            <td style={{ color: '#34d399', fontWeight: 700 }}>Syncs signed quote $$$ to Google Smart Bidding</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
