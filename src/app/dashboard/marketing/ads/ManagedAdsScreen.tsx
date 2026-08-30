'use client';

import { useState, useMemo } from 'react';
import MarketingNav from '../MarketingNav';
import {
  calculateAdProjections,
  generateTradeKeywords,
  generateResponsiveSearchAd,
  generateGoogleAdsEditorCsv,
  generateSeasonalAdCopy,
  checkCampaignCapacityGuard,
  type SeasonalAdAngle,
} from '@/lib/google-ads-generator';
import type { AdBudgetWalletState } from '@/lib/ad-billing';
import {
  SMART_BUNDLES,
  getSmartBundle,
  generateMetaAdCopy,
  generateRetargetingAdCopy,
  type SmartBundleId,
} from '@/lib/multi-channel-ads';
import { detectWeatherSurgeOpportunity } from '@/lib/weather-ad-surge';
import styles from './ManagedAdsScreen.module.css';

type Props = {
  businessName: string;
  trade: string;
  tradeSlug: string;
  city: string;
  domain: string;
  phone: string;
  availableServices: string[];
  initialWalletState?: AdBudgetWalletState;
  leadFilters?: Record<string, unknown>;
  basePath?: string;
};

export default function ManagedAdsScreen({
  businessName,
  trade,
  tradeSlug,
  city: initialCity,
  domain,
  phone: initialPhone,
  availableServices,
  initialWalletState,
  leadFilters,
  basePath = '/dashboard',
}: Props) {
  // Step 1: Selected Smart Bundle
  const [selectedBundleId, setSelectedBundleId] = useState<SmartBundleId>('growth');
  const [city, setCity] = useState<string>(initialCity || 'Local Area');
  const [phone] = useState<string>(initialPhone || '');
  const [previewPlatform, setPreviewPlatform] = useState<'mobile' | 'desktop' | 'meta' | 'retargeting'>('mobile');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Advanced overrides (available if expanded)
  const [radius, setRadius] = useState<number>(25);
  const [selectedServices, setSelectedServices] = useState<string[]>(
    availableServices.length > 0 ? availableServices.slice(0, 6) : [trade || 'Contractor Services']
  );

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [downloadedCsv, setDownloadedCsv] = useState(false);
  const [copiedBlueprint, setCopiedBlueprint] = useState(false);

  const currentBundle = useMemo(() => getSmartBundle(selectedBundleId), [selectedBundleId]);

  // Projections for Google Search
  const projections = useMemo(
    () => calculateAdProjections(currentBundle.searchSpendDollars, tradeSlug || trade),
    [currentBundle.searchSpendDollars, tradeSlug, trade]
  );

  // Weather Surge Opportunity Detection
  const weatherSurge = useMemo(() => {
    const isStormTrade = (trade || '').toLowerCase().includes('roof') || (trade || '').toLowerCase().includes('gutter');
    return detectWeatherSurgeOpportunity(trade, city, {
      hasStorm: isStormTrade,
      temperatureF: 78,
      alertHeadline: isStormTrade ? 'Severe Weather / High Wind Watch' : undefined,
    });
  }, [trade, city]);

  // Capacity Auto-Pause Check
  const capacityGuard = useMemo(
    () => checkCampaignCapacityGuard(leadFilters),
    [leadFilters]
  );

  // Keywords
  const { allKeywords, negativeKeywords } = useMemo(
    () => generateTradeKeywords(selectedServices, city, trade, ['Rival Home Services', 'Mega Pro Services']),
    [selectedServices, city, trade]
  );

  const landingPageUrl = `https://${domain || 'example.com'}/estimate`;

  // Seasonal angle
  const seasonalAngle: SeasonalAdAngle = weatherSurge.surgeActive
    ? weatherSurge.recommendedAngle
    : 'standard';

  const seasonalHooks = useMemo(
    () => generateSeasonalAdCopy(trade, city, seasonalAngle),
    [trade, city, seasonalAngle]
  );

  // Responsive Search Ad Copy
  const rsa = useMemo(() => {
    const base = generateResponsiveSearchAd({
      businessName,
      trade,
      city,
      services: selectedServices,
      phone: phone || undefined,
      landingPageUrl,
    });

    if (seasonalAngle !== 'standard') {
      return {
        ...base,
        headlines: [...seasonalHooks.headlineHooks, ...base.headlines].slice(0, 15),
        descriptions: [seasonalHooks.descriptionHook, ...base.descriptions].slice(0, 4),
      };
    }
    return base;
  }, [businessName, trade, city, selectedServices, phone, landingPageUrl, seasonalAngle, seasonalHooks]);

  // Meta Social Ad Copy
  const metaAd = useMemo(
    () =>
      generateMetaAdCopy({
        businessName,
        trade,
        city,
        services: selectedServices,
        seasonalAngle,
      }),
    [businessName, trade, city, selectedServices, seasonalAngle]
  );

  // Retargeting Banner Ad Copy
  const retargetingAd = useMemo(
    () =>
      generateRetargetingAdCopy({
        businessName,
        trade,
        city,
      }),
    [businessName, trade, city]
  );

  const handleLaunchAutopilot = async () => {
    setCheckoutLoading(true);
    try {
      const res = await fetch('/api/stripe/ad-budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthlyBudgetDollars: currentBundle.adSpendDollars,
          platformFeeDollars: currentBundle.platformFeeDollars,
          trade,
          city,
          returnUrl: window.location.href,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to initiate billing session.');
      }
    } catch (err) {
      alert('Unable to connect to billing. Please try again.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleDownloadCsv = () => {
    const csvContent = generateGoogleAdsEditorCsv({
      campaignName: `${city} ${trade} - Google Search Ads`,
      monthlyBudget: currentBundle.searchSpendDollars,
      dailyBudget: projections.dailyBudget,
      targetCity: city,
      targetRadiusMiles: radius,
      rsa,
      keywords: allKeywords,
      negativeKeywords,
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `google-ads-${trade.toLowerCase()}-${city.toLowerCase().replace(/[^a-z0-9]/g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    setDownloadedCsv(true);
    setTimeout(() => setDownloadedCsv(false), 3000);
  };

  const handleCopyBlueprint = () => {
    const blueprint = [
      `=== AI ADVERTISING AUTOPILOT BLUEPRINT ===`,
      `Plan: ${currentBundle.name} ($${currentBundle.totalMonthlyDollars}/mo total)`,
      `Business: ${businessName} (${trade} in ${city})`,
      `Target Leads: ${currentBundle.estimatedLeadsRange}`,
      `Active Channels: ${currentBundle.channels.join(', ')}`,
      ``,
      `--- GOOGLE SEARCH ADS ---`,
      `Daily Pace: ~$${projections.dailyBudget}/day`,
      ...rsa.headlines.slice(0, 5).map((h, i) => `H${i + 1}: ${h}`),
      ``,
      `--- META (INSTAGRAM / FB) FEED ---`,
      `Headline: ${metaAd.headline}`,
      `Text: ${metaAd.primaryText}`,
    ].join('\n');

    navigator.clipboard.writeText(blueprint);
    setCopiedBlueprint(true);
    setTimeout(() => setCopiedBlueprint(false), 2500);
  };

  const toggleService = (service: string) => {
    setSelectedServices((prev) =>
      prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]
    );
  };

  const isLiveActive = initialWalletState?.status === 'active';

  return (
    <main className="dashboard-page workspace-page mkt-page">
      <div className="section-heading workspace-section-heading">
        <div>
          <h1 className="page-title">AI Advertising Autopilot</h1>
          <p className="page-intro">
            Get more high-intent local homeowners calling for estimates across Google, Facebook, and Instagram.
          </p>
        </div>
      </div>

      <MarketingNav basePath={basePath} />

      {/* AI Recommendation Hero Banner */}
      <div className={styles.aiRecCard}>
        <span className={styles.aiRecIcon}>🤖</span>
        <div>
          <div className={styles.aiRecTitle}>
            AI Growth Plan for {trade} in {city}
          </div>
          <p className={styles.aiRecBody}>
            We pre-built your Google Search and Social Retargeting campaigns. All safety shields (weather demand surges, capacity pause, and competitor blocking) are active. Pick your growth speed below to turn on client traffic.
          </p>
        </div>
      </div>

      {capacityGuard.shouldPauseBidding ? (
        <div
          style={{
            background: 'rgba(234, 179, 8, 0.12)',
            border: '1px solid rgba(234, 179, 8, 0.35)',
            borderRadius: '10px',
            padding: '0.85rem 1.15rem',
            margin: '0.75rem 0 1.25rem',
            color: '#facc15',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            fontSize: '0.88rem',
            fontWeight: 600,
          }}
        >
          <span>🛡️</span>
          <span>{capacityGuard.reason} Ads are automatically paused while your team is fully booked.</span>
        </div>
      ) : null}

      <div className={styles.cockpitLayout}>
        {/* Left Column: 1-Click Bundle Selector & Smart Shield */}
        <div className="panel workspace-section-card">
          {/* Step 1: Pick Your Growth Speed */}
          <div>
            <div className="section-heading workspace-section-heading compact-heading">
              <div>
                <p className="eyebrow">Step 1</p>
                <h2>Pick Your Growth Speed</h2>
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '0.2rem 0.55rem',
                  borderRadius: '20px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  background: isLiveActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                  color: isLiveActive ? '#10b981' : 'var(--muted)',
                  border: isLiveActive ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.15)',
                }}
              >
                {isLiveActive ? '● Autopilot Active' : '○ Ready to Launch'}
              </span>
            </div>

            <div className={styles.bundleGrid}>
              {SMART_BUNDLES.map((bundle) => {
                const isSelected = selectedBundleId === bundle.id;
                return (
                  <button
                    key={bundle.id}
                    type="button"
                    className={`${styles.bundleCard} ${isSelected ? styles.selected : ''}`}
                    onClick={() => setSelectedBundleId(bundle.id)}
                  >
                    {bundle.badge ? <span className={styles.popularBadge}>{bundle.badge}</span> : null}
                    <span className={styles.bundleName}>{bundle.name}</span>
                    <strong className={styles.bundlePrice}>${bundle.totalMonthlyDollars}</strong>
                    <span className={styles.bundleLeads}>~{bundle.estimatedLeadsRange}</span>

                    <ul className={styles.bundleFeatures}>
                      {bundle.features.map((feat) => (
                        <li key={feat} className={styles.bundleCheckItem}>
                          <span style={{ color: '#10b981', fontWeight: 800 }}>✓</span>
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>

            {/* Smart Shield Bar */}
            <div className={styles.smartShieldBar}>
              <div className={styles.smartShieldHeader}>
                <span>🛡️</span>
                <span>AI Smart Shield Active &amp; Protecting Your Budget</span>
              </div>
              <p className={styles.smartShieldDesc}>
                Includes automatic Weather Surge Boosts (+25% during storms/freezes), Fully-Booked Auto-Pause Guard, and Competitor Search Exclusion filters.
              </p>
            </div>

            {/* Transparent Cost Breakdown */}
            <div className={styles.costBreakdown}>
              <div className={styles.breakdownRow}>
                <span>Ad Network Spend (100% applied to clicks)</span>
                <strong>${currentBundle.adSpendDollars} / mo</strong>
              </div>
              <div className={styles.breakdownRow}>
                <span>AI Campaign Autopilot &amp; Smart Bidding (15%)</span>
                <span>${currentBundle.platformFeeDollars} / mo</span>
              </div>
              <div className={styles.breakdownTotal}>
                <span>Total Monthly Plan</span>
                <span style={{ color: 'var(--accent, #f97316)' }}>${currentBundle.totalMonthlyDollars} / mo</span>
              </div>
            </div>
          </div>

          {/* Advanced Drawer */}
          <div className={styles.advancedDrawer}>
            <button
              type="button"
              className={styles.advancedToggleBtn}
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <span>{showAdvanced ? '▲' : '▼'}</span>
              <span>Advanced Options &amp; Export Blueprint ({showAdvanced ? 'Hide' : 'Show'})</span>
            </button>

            {showAdvanced ? (
              <div className={styles.advancedContent}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.85rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '0.2rem' }}>
                      Target City
                    </label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      style={{ width: '100%', fontSize: '0.82rem', padding: '0.4rem 0.6rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '0.2rem' }}>
                      Service Radius: {radius} miles
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={60}
                      step={5}
                      value={radius}
                      onChange={(e) => setRadius(Number(e.target.value))}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '0.85rem' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
                    Active Services ({selectedServices.length})
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {availableServices.map((service) => {
                      const isSel = selectedServices.includes(service);
                      return (
                        <button
                          key={service}
                          type="button"
                          onClick={() => toggleService(service)}
                          style={{
                            fontSize: '0.72rem',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            background: isSel ? 'var(--accent, #f97316)' : 'rgba(255,255,255,0.06)',
                            color: isSel ? '#ffffff' : 'var(--foreground)',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          {isSel ? '✓ ' : '+ '}
                          {service}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={handleDownloadCsv}
                    style={{ flex: 1, fontSize: '0.78rem', padding: '0.4rem' }}
                  >
                    {downloadedCsv ? '✓ CSV Ready' : 'Download Google Ads CSV'}
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={handleCopyBlueprint}
                    style={{ flex: 1, fontSize: '0.78rem', padding: '0.4rem' }}
                  >
                    {copiedBlueprint ? '✓ Copied' : 'Copy Full Blueprint'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Right Column: Live Previews & 1-Click Launch */}
        <div style={{ position: 'sticky', top: '1rem' }}>
          {/* Multi-Channel Preview Switcher */}
          <div className={styles.deviceSwitcher}>
            <button
              type="button"
              className={`${styles.deviceBtn} ${previewPlatform === 'mobile' ? styles.active : ''}`}
              onClick={() => setPreviewPlatform('mobile')}
            >
              <span>📱 Google</span>
            </button>
            <button
              type="button"
              className={`${styles.deviceBtn} ${previewPlatform === 'desktop' ? styles.active : ''}`}
              onClick={() => setPreviewPlatform('desktop')}
            >
              <span>💻 Desktop</span>
            </button>
            <button
              type="button"
              className={`${styles.deviceBtn} ${previewPlatform === 'meta' ? styles.active : ''}`}
              onClick={() => setPreviewPlatform('meta')}
            >
              <span>📸 Instagram</span>
            </button>
            <button
              type="button"
              className={`${styles.deviceBtn} ${previewPlatform === 'retargeting' ? styles.active : ''}`}
              onClick={() => setPreviewPlatform('retargeting')}
            >
              <span>🎯 Retargeting</span>
            </button>
          </div>

          {/* 1. Google Search Previews */}
          {(previewPlatform === 'mobile' || previewPlatform === 'desktop') && (
            <div className={styles.serpContainer}>
              {previewPlatform === 'mobile' ? (
                <div className={styles.mobileSearchBar}>
                  <span className={styles.googleG}>G</span>
                  <span className={styles.searchQueryMock}>
                    {trade.toLowerCase()} near me
                  </span>
                  <span className={styles.micIcon}>🎙️</span>
                </div>
              ) : null}

              <div className={styles.serpCard}>
                <div className={styles.serpHeader}>
                  <span className={styles.sponsoredBadge}>Sponsored</span>
                  <span className={styles.serpDomain}>{domain || 'yourbusiness.com'}</span>
                </div>

                <div className={styles.serpTitle}>
                  {rsa.headlines.slice(0, previewPlatform === 'mobile' ? 2 : 3).join(' | ')}
                </div>

                <div className={styles.serpRating}>
                  <span className={styles.stars}>★★★★★</span>
                  <span>4.9 · 85+ verified local reviews</span>
                </div>

                <div className={styles.serpDesc}>
                  {rsa.descriptions[0]} {previewPlatform === 'desktop' ? rsa.descriptions[1] : ''}
                </div>

                <div className={styles.sitelinksGrid}>
                  {rsa.sitelinks.slice(0, previewPlatform === 'mobile' ? 2 : 4).map((sitelink) => (
                    <div key={sitelink.title}>
                      <span className={styles.sitelinkTitle}>{sitelink.title}</span>
                      <span className={styles.sitelinkDesc}>{sitelink.desc}</span>
                    </div>
                  ))}
                </div>

                {phone ? (
                  previewPlatform === 'mobile' ? (
                    <div className={styles.mobileCallCta}>
                      <span>📞 Call {phone}</span>
                    </div>
                  ) : (
                    <div className={styles.desktopCallRow}>
                      <span>📞 Call now: {phone}</span>
                    </div>
                  )
                ) : null}
              </div>
            </div>
          )}

          {/* 2. Meta Post Preview */}
          {previewPlatform === 'meta' && (
            <div className={styles.metaCard}>
              <div className={styles.metaHeader}>
                <div className={styles.metaAvatar}>
                  {businessName.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div className={styles.metaBusiness}>{businessName}</div>
                  <div className={styles.metaSub}>Sponsored · 🌐 {city}</div>
                </div>
              </div>

              <div className={styles.metaBody}>
                {metaAd.primaryText}
              </div>

              <div className={styles.metaMediaBox}>
                <span style={{ fontSize: '1.8rem', marginBottom: '0.4rem' }}>🏠✨</span>
                <strong style={{ fontSize: '0.9rem' }}>{metaAd.visualHook}</strong>
                <span style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.2rem' }}>
                  Auto-synced from your completed jobs
                </span>
              </div>

              <div className={styles.metaFooter}>
                <div>
                  <div className={styles.metaHeadline}>{metaAd.headline}</div>
                  <div className={styles.metaDesc}>{metaAd.description}</div>
                </div>
                <button type="button" className={styles.metaCtaBtn}>
                  {metaAd.callToAction}
                </button>
              </div>
            </div>
          )}

          {/* 3. Retargeting Banner Preview */}
          {previewPlatform === 'retargeting' && (
            <div className={styles.bannerCard}>
              <span className={styles.bannerBadge}>{retargetingAd.offerBadge}</span>
              <div className={styles.bannerTitle}>{retargetingAd.headline}</div>
              <div className={styles.bannerDesc}>{retargetingAd.description}</div>
              <span className={styles.bannerCta}>
                {retargetingAd.cta} →
              </span>
            </div>
          )}

          {/* Primary 1-Click Launch Button */}
          <button
            type="button"
            className={styles.launchButton}
            onClick={handleLaunchAutopilot}
            disabled={checkoutLoading}
          >
            {checkoutLoading
              ? 'Connecting to Stripe...'
              : `🚀 Start Getting Leads ($${currentBundle.totalMonthlyDollars}/mo)`}
          </button>

          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textAlign: 'center', margin: 0 }}>
            100% ad budget applied to ad clicks. 15% software management fee. Cancel anytime.
          </p>
        </div>
      </div>
    </main>
  );
}
