'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { TRADES } from '@/lib/trades';
import { buildStartUrl } from '@/lib/signup-intent';
import styles from './trade-website-generator.module.css';

const POPULAR_TRADE_SLUGS = [
  'electricians',
  'plumbers',
  'roofers',
  'landscapers',
  'painters',
  'hvac',
  'remodelers',
  'handyman',
  'flooring',
  'concrete',
];

const SAMPLE_CITIES = ['Austin, TX', 'Denver, CO', 'Miami, FL', 'Chicago, IL', 'Phoenix, AZ', 'Charlotte, NC'];

const TRADE_SAMPLE_PROJECTS: Record<string, { jobType: string; timeline: string; est: string }> = {
  electricians: { jobType: '200A Electrical Panel Upgrade + EV Charger', timeline: 'Next 2 Weeks', est: '$2,800–$3,500' },
  plumbers: { jobType: 'Tankless Water Heater Installation & Flush', timeline: 'Urgent (1–2 Days)', est: '$2,200–$3,100' },
  roofers: { jobType: 'Architectural Shingle Replacement (Storm Damage)', timeline: 'Within 30 Days', est: '$9,500–$14,000' },
  landscapers: { jobType: 'Full Sod Installation & Drip Irrigation Zone', timeline: 'This Month', est: '$4,200–$6,000' },
  painters: { jobType: 'Interior Whole-Home Repaint (4 Bed / 2.5 Bath)', timeline: 'Within 3 Weeks', est: '$5,000–$7,500' },
  hvac: { jobType: 'High-Efficiency Heat Pump & Ductwork Upgrade', timeline: 'Next Week', est: '$8,000–$11,500' },
  handyman: { jobType: 'Drywall Patching, Fixtures & Exterior Door Install', timeline: 'This Weekend', est: '$850–$1,400' },
  remodelers: { jobType: 'Custom Kitchen Cabinetry & Quartz Countertops', timeline: 'Flexible', est: '$18,000–$28,000' },
  flooring: { jobType: 'Hardwood Installation & Subfloor Prep', timeline: 'Next 2 Weeks', est: '$6,500–$9,800' },
  concrete: { jobType: 'Stamped Concrete Patio & Driveway Extension', timeline: 'This Month', est: '$7,200–$11,000' },
};

export default function TradeWebsiteGenerator() {
  const [selectedSlug, setSelectedSlug] = useState('electricians');
  const [city, setCity] = useState('Austin, TX');

  const selectedTrade = useMemo(() => {
    return TRADES.find((t) => t.slug === selectedSlug) ?? TRADES[0];
  }, [selectedSlug]);

  const cityNameClean = city.split(',')[0].trim() || 'Local';
  const businessName = `${cityNameClean} ${selectedTrade.name.replace(/s$/, '')} Co.`;
  const subdomain = `${cityNameClean.toLowerCase().replace(/[^a-z0-9]/g, '')}-${selectedTrade.slug}.letsgetquoted.com`;

  const sampleProject = TRADE_SAMPLE_PROJECTS[selectedTrade.slug] ?? {
    jobType: `Professional ${selectedTrade.work} project`,
    timeline: 'Within 2 Weeks',
    est: '$1,500–$4,000',
  };

  const signupUrl = buildStartUrl({
    goal: 'build_site',
    trade: selectedTrade.slug,
    city,
    businessName,
    source: 'site_generator',
  });

  return (
    <section className={styles.container} id="trade-preview-generator" aria-label="Interactive Contractor Website Generator">
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.kicker}>Interactive Preview</div>
          <h2 className={styles.title}>
            See what your website looks like in <em>seconds</em>.
          </h2>
          <p className={styles.subtitle}>
            Choose your trade and location. We build your complete contractor website with AI intake, verified reviews,
            and instant booking—ready to publish for $0/month.
          </p>
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          <div className={styles.controlGroup}>
            <label htmlFor="trade-select" className={styles.controlLabel}>
              Select Trade:
            </label>
            <select
              id="trade-select"
              className={styles.select}
              value={selectedSlug}
              onChange={(e) => setSelectedSlug(e.target.value)}
              aria-label="Select contractor trade vertical"
            >
              {TRADES.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.controlGroup}>
            <label htmlFor="city-input" className={styles.controlLabel}>
              Your City / Area:
            </label>
            <input
              id="city-input"
              type="text"
              className={styles.input}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Austin, TX"
              aria-label="Contractor city and state"
            />
          </div>
        </div>

        {/* Quick Sample Cities */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '20px', fontSize: '12px', color: '#8fa6b5' }}>
          <span style={{ fontWeight: 700, alignSelf: 'center' }}>Popular areas:</span>
          {SAMPLE_CITIES.map((sampleCity) => (
            <button
              key={sampleCity}
              type="button"
              onClick={() => setCity(sampleCity)}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: city === sampleCity ? '#ff6a24' : '#b0c2ce',
                borderRadius: '4px',
                padding: '2px 8px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: city === sampleCity ? 800 : 600,
              }}
            >
              {sampleCity}
            </button>
          ))}
        </div>

        {/* Quick Trade Filter Chips */}
        <div className={styles.chipRow} role="tablist" aria-label="Popular trades quick selector">
          {POPULAR_TRADE_SLUGS.map((slug) => {
            const trade = TRADES.find((t) => t.slug === slug);
            if (!trade) return null;
            const isActive = selectedSlug === slug;
            return (
              <button
                key={slug}
                type="button"
                className={`${styles.chip} ${isActive ? styles.chipActive : ''}`}
                onClick={() => setSelectedSlug(slug)}
                role="tab"
                aria-selected={isActive}
              >
                {trade.name}
              </button>
            );
          })}
        </div>

        {/* Live Device Preview Frame */}
        <div className={styles.browserFrame} aria-live="polite">
          <div className={styles.browserTopBar}>
            <div className={styles.dots} aria-hidden="true">
              <div className={`${styles.dot} ${styles.dotRed}`} />
              <div className={`${styles.dot} ${styles.dotYellow}`} />
              <div className={`${styles.dot} ${styles.dotGreen}`} />
            </div>
            <div className={styles.urlBar}>https://{subdomain}</div>
          </div>

          <div className={styles.siteViewport}>
            {/* Top Bar / Nav */}
            <div className={styles.siteNav}>
              <div className={styles.siteBrand}>
                <div className={styles.siteLogoIcon} aria-hidden="true">
                  {selectedTrade.name.charAt(0)}
                </div>
                <div className={styles.siteBrandName}>{businessName}</div>
              </div>
              <div className={styles.siteBadge}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                5.0 Google Verified · Licensed &amp; Insured
              </div>
            </div>

            {/* Simulated Hero Section */}
            <div className={styles.siteHero}>
              <div className={styles.siteHeroContent}>
                <h3>{selectedTrade.headline}</h3>
                <p>
                  Serving homeowners in {city} and surrounding areas. Transparent pricing, itemized quotes, and licensed
                  workmanship.
                </p>

                <div className={styles.serviceList} aria-label="Offered contractor services">
                  {selectedTrade.services.slice(0, 5).map((service) => (
                    <span key={service} className={styles.serviceTag}>
                      ✓ {service}
                    </span>
                  ))}
                </div>
              </div>

              {/* Simulated Smart AI Quote Form */}
              <div className={styles.intakeBox}>
                <div className={styles.intakeHeader}>
                  <div className={styles.intakeTitle}>
                    <span>⚡</span> Request a Fast Quote
                  </div>
                  <span className={styles.intakeTag}>AI Powered</span>
                </div>

                <div className={styles.intakeField}>
                  <span className={styles.intakeLabel}>Project Description</span>
                  <div className={styles.intakeInputMock}>{sampleProject.jobType}</div>
                </div>

                <div className={styles.intakeField}>
                  <span className={styles.intakeLabel}>Preferred Timeline</span>
                  <div className={styles.intakeInputMock}>{sampleProject.timeline}</div>
                </div>

                <div className={styles.intakeButtonMock}>
                  <span>Get My Instant Estimate &rarr;</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer & Conversion Bar */}
        <div className={styles.footerCta}>
          <div className={styles.footerNotes}>
            <div className={styles.footerNoteItem}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Custom domain + SEO included
            </div>
            <div className={styles.footerNoteItem}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              AI Intake &amp; Lead Scoring included
            </div>
            <div className={styles.footerNoteItem}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              $0/mo on Flex · No credit card required
            </div>
          </div>

          <Link href={signupUrl} className={styles.ctaButton}>
            Launch Your {selectedTrade.name} Site Free &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}
