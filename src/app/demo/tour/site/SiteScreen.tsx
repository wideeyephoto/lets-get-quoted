'use client';

import { useState } from 'react';
import Link from 'next/link';
import DemoTourFrame from '@/components/demo/DemoTourFrame';
import {
  TOUR_STEPS,
  DEMO_TOUR_CONTRACTOR,
  DEMO_TOUR_JOB,
} from '@/lib/demo-tour-data';
import styles from '../tour.module.css';

type ProjectOption = {
  id: string;
  name: string;
  icon: string;
  range: string;
  scopeSummary: string;
  badge: string;
  features: string[];
};

const PROJECT_OPTIONS: ProjectOption[] = [
  {
    id: 'patio',
    name: 'Paver Patio (380 sq ft)',
    icon: '🧱',
    range: '$12,000 – $16,000',
    scopeSummary: '380 sq ft Unilock Pavers · Commercial Base Compaction · Fire Pit & Seat Wall',
    badge: '★ Taylor Brooks Scope Match',
    features: [
      'Excavation & 6" compacted aggregate base with geotextile fabric',
      'Premium Unilock / Belgard pavers with polymeric sand jointing',
      'Integrated curved seat wall & natural stone fire pit unit',
      '10-Year structural base & settling warranty',
    ],
  },
  {
    id: 'firepit',
    name: 'Fire Pit & Seat Wall',
    icon: '🔥',
    range: '$3,200 – $4,800',
    scopeSummary: '24 LF Curved Seat Wall · Commercial Stone Coping · Heavy Fire Ring',
    badge: 'Fast 2-Day Installation',
    features: [
      'Commercial retaining block enclosure with smooth capstone',
      'Heavy-gauge steel insert with integrated draft vents (wood or gas)',
      'Precision joint adhesive & structural tie-ins to patio',
      'Matches existing stone or landscape color palette',
    ],
  },
  {
    id: 'lighting',
    name: 'Architectural LED Lighting',
    icon: '✨',
    range: '$750 – $1,850',
    scopeSummary: '6 Flush Under-Cap Step & Hardscape Fixtures · Smart Dusk-to-Dawn Timer',
    badge: 'Popular Add-On Upgrade',
    features: [
      '6+ Flush-mount warm LED step, wall, and path fixtures',
      'Commercial waterproof direct-burial wiring & conduit',
      'Smart dusk-to-dawn astronomical timer transformer',
      'Low-voltage high-efficiency nighttime curb appeal',
    ],
  },
  {
    id: 'drainage',
    name: 'Sub-Base & Drainage',
    icon: '💧',
    range: '$1,100 – $2,500',
    scopeSummary: 'Laser Slope Grading · Geotextile Fabric · Downspout Tie-In',
    badge: 'Foundation Protection',
    features: [
      'Laser-graded sub-base pitching water away from foundation',
      'Heavy-duty geotextile sub-base separation fabric',
      'Downspout underground discharge tie-in',
      'Commercial snap edging with 10" steel spikes',
    ],
  },
];

type ServiceArea = {
  city: string;
  status: string;
  distance: string;
  leadTime: string;
  badge: string;
};

const SERVICE_AREAS: ServiceArea[] = [
  { city: 'Royal Oak, MI', status: 'Primary Route · Active Crew', distance: '2.1 mi away', leadTime: 'Thursday arrival windows open', badge: 'Active Route Match' },
  { city: 'Ferndale, MI', status: 'Daily Service Route', distance: '3.4 mi away', leadTime: 'Tuesday & Friday crews scheduled', badge: 'Daily Service' },
  { city: 'Berkley, MI', status: 'Daily Service Route', distance: '2.8 mi away', leadTime: 'Wednesday availability', badge: 'Daily Service' },
  { city: 'Clawson, MI', status: 'Active Crew Route', distance: '4.1 mi away', leadTime: 'Fast next-day estimates', badge: 'Fast Estimates' },
  { city: 'Troy, MI', status: 'Commercial & Residential', distance: '6.5 mi away', leadTime: 'Weekly scheduled routes', badge: 'Weekly Route' },
  { city: 'Birmingham, MI', status: 'Premium Territory', distance: '5.2 mi away', leadTime: 'Priority scheduling available', badge: 'Priority Area' },
];

export default function SiteScreen() {
  const currentStep = TOUR_STEPS[0];
  const [selectedProjectId, setSelectedProjectId] = useState<string>('patio');
  const [selectedCityName, setSelectedCityName] = useState<string>('Royal Oak, MI');
  const [zipInput, setZipInput] = useState<string>('48067');
  const [zipMessage, setZipMessage] = useState<string>('✅ 48067 is in our primary service route (Royal Oak). Instant estimate available!');

  const activeProject = PROJECT_OPTIONS.find((p) => p.id === selectedProjectId) ?? PROJECT_OPTIONS[0];
  const activeArea = SERVICE_AREAS.find((a) => a.city === selectedCityName) ?? SERVICE_AREAS[0];

  const handleZipCheck = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanZip = zipInput.trim();
    if (/^480[0-9]{2}$/.test(cleanZip)) {
      setZipMessage(`✅ ${cleanZip} is in our active Oakland County service area! Crews available this week.`);
    } else if (cleanZip.length >= 5) {
      setZipMessage(`✅ ${cleanZip} verified — We provide custom estimates across Metro Detroit.`);
    } else {
      setZipMessage('Please enter a valid 5-digit ZIP code.');
    }
  };

  return (
    <DemoTourFrame currentStep={currentStep}>
      <div className={styles.siteWrapper}>
        {/* Realistic Fixture-Backed Browser Bar */}
        <div className={styles.siteBrowserBar} aria-label="Contractor website preview browser chrome">
          <div className={styles.siteBrowserDots} aria-hidden="true">
            <i />
            <i />
            <i />
          </div>

          <div className={styles.siteBrowserAddress}>
            <span className={styles.siteBrowserLock} aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
              </svg>
            </span>
            <span>https://evergreenlawn.letsgetquoted.com</span>
            <span className={styles.siteBrowserSslBadge}>Verified SSL</span>
          </div>

          <div className={styles.siteBrowserLive}>
            <i aria-hidden="true" />
            <span>Live Site &middot; Homeowner View</span>
          </div>
        </div>

        {/* Top Header & Navigation */}
        <header className={styles.siteNav}>
          <div className={styles.siteBrandGroup}>
            <div className={styles.siteBrandLogo} aria-hidden="true">🌿</div>
            <div>
              <div className={styles.siteBrand}>
                {DEMO_TOUR_CONTRACTOR.name.split(' ')[0]} <span>{DEMO_TOUR_CONTRACTOR.name.split(' ').slice(1).join(' ')}</span>
              </div>
              <span className={styles.siteBrandSub}>MI Lic #24VH09842100 &middot; Royal Oak, MI</span>
            </div>
          </div>

          <div className={styles.siteNavLinks}>
            <div className={styles.siteNavPill} aria-hidden="true">
              <span>★</span> 4.9 (128 Reviews)
            </div>
            <a
              href={`tel:${DEMO_TOUR_CONTRACTOR.phone.replace(/[^0-9]/g, '')}`}
              className={styles.sitePhone}
              aria-label={`Call Evergreen Lawn & Landscape at ${DEMO_TOUR_CONTRACTOR.phone}`}
            >
              <span aria-hidden="true">📞</span> {DEMO_TOUR_CONTRACTOR.phone}
            </a>
            <Link
              href="/demo/tour/intake"
              className={styles.siteEstimateBtn}
              aria-label="Get Instant Estimate on Evergreen website"
            >
              Get Instant Estimate &rarr;
            </Link>
          </div>
        </header>

        {/* High-Converting Hero Section */}
        <section className={styles.siteHero}>
          <div className={styles.siteHeroInner}>
            <div className={styles.siteHeroCopy}>
              <div className={styles.siteHeroBadgeStrip}>
                <span className={styles.siteHeroBadge}>🌿 {DEMO_TOUR_CONTRACTOR.badge}</span>
                <span className={styles.siteHeroBadgeGold}>★ 4.9 Rated (128 Google Reviews)</span>
              </div>

              <h2 className={styles.siteHeroTitle}>
                Outdoor living spaces built to endure.<br />
                <em>Custom patios, walls &amp; plantings.</em>
              </h2>

              <p className={styles.siteHeroSub}>
                Serving {DEMO_TOUR_CONTRACTOR.serviceArea}. Transparent line-item pricing, ICPI certified master craftsmen, and preliminary estimates in 30 seconds.
              </p>

              <div className={styles.siteHeroPills}>
                <span className={styles.siteHeroPillItem}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                  <span>10-Yr Base Warranty</span>
                </span>
                <span className={styles.siteHeroPillItem}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                  <span>$2M Fully Insured</span>
                </span>
                <span className={styles.siteHeroPillItem}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                  <span>24/7 AI Estimate Engine</span>
                </span>
              </div>
            </div>

            {/* Interactive Instant Estimate Calculator Widget */}
            <div className={styles.siteHeroCtaBox}>
              <div className={styles.siteCtaHeader}>
                <div className={styles.siteCtaHeaderTitle}>
                  <span aria-hidden="true">⚡</span>
                  <span>Instant Estimate Calculator</span>
                </div>
                <span className={styles.siteCtaLiveBadge}>30s AI Pricing</span>
              </div>

              <p className={styles.siteOptionPrompt}>
                Select a project type to preview typical preliminary ranges:
              </p>

              <div className={styles.siteProjectTabs} role="tablist" aria-label="Project type selection">
                {PROJECT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={selectedProjectId === opt.id}
                    className={`${styles.siteProjectTabBtn} ${selectedProjectId === opt.id ? styles.siteProjectTabActive : ''}`}
                    onClick={() => setSelectedProjectId(opt.id)}
                    aria-label={`Select ${opt.name} project type`}
                  >
                    <span aria-hidden="true">{opt.icon}</span>
                    <span>{opt.name}</span>
                  </button>
                ))}
              </div>

              {/* Dynamic Scope & Range Preview */}
              <div className={styles.siteProjectPreviewBox}>
                <div className={styles.siteProjectPreviewTop}>
                  <span className={styles.siteProjectRangeLabel}>Typical Range</span>
                  <span className={styles.siteProjectRangeValue}>{activeProject.range}</span>
                </div>

                <div className={styles.siteProjectScopeSummary}>
                  {activeProject.scopeSummary}
                </div>

                <ul className={styles.siteProjectFeatureList}>
                  {activeProject.features.map((feat) => (
                    <li key={feat} className={styles.siteProjectFeatureItem}>
                      <i aria-hidden="true">✓</i>
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Link
                href="/demo/tour/intake"
                className={styles.sitePulseBtn}
                aria-label="Get My Instant Estimate on Evergreen website"
              >
                <span>Get My Instant Estimate &rarr;</span>
              </Link>

              <div className={styles.siteCtaMicroTrust}>
                <span>✓ Zero sales pressure</span>
                <span>&middot;</span>
                <span>✓ 100% Free</span>
                <span>&middot;</span>
                <span>✓ Instant SMS delivery</span>
              </div>
            </div>
          </div>
        </section>

        {/* Credentials & Trust Bar */}
        <section className={styles.siteTrustBanner} aria-label="Contractor credentials">
          <div className={styles.siteTrustGrid}>
            <div className={styles.siteTrustItem}>
              <span className={styles.siteTrustIcon} aria-hidden="true">🛡️</span>
              <div>
                <strong>Licensed &amp; Insured</strong>
                <small>MI Lic #24VH09842100 &middot; $2M Liability</small>
              </div>
            </div>

            <div className={styles.siteTrustItem}>
              <span className={styles.siteTrustIcon} aria-hidden="true">🏆</span>
              <div>
                <strong>ICPI Certified Installers</strong>
                <small>Commercial sub-base &amp; compaction standards</small>
              </div>
            </div>

            <div className={styles.siteTrustItem}>
              <span className={styles.siteTrustIcon} aria-hidden="true">⏳</span>
              <div>
                <strong>10-Year Structural Guarantee</strong>
                <small>Zero settling &middot; Polymeric joint integrity</small>
              </div>
            </div>

            <div className={styles.siteTrustItem}>
              <span className={styles.siteTrustIcon} aria-hidden="true">⚡</span>
              <div>
                <strong>24/7 Instant Estimates</strong>
                <small>Powered by LetsGetQuoted AI intake</small>
              </div>
            </div>
          </div>
        </section>

        {/* Featured Services Grid with Photos & Specs */}
        <section className={styles.siteServicesSection} aria-labelledby="services-heading">
          <div className={styles.siteSectionHeader}>
            <span className={styles.siteSectionEyebrow}>What We Build</span>
            <h3 id="services-heading" className={styles.siteSectionTitle}>
              Hardscape &amp; Landscape Construction Services
            </h3>
            <p className={styles.siteSectionSub}>
              Engineered for Michigan freeze-thaw cycles. Premium Unilock, Belgard, and natural stone installations.
            </p>
          </div>

          <div className={styles.siteServicesGrid}>
            {/* Service 1: Paver Patios */}
            <article className={styles.siteServiceCard}>
              <div className={styles.siteServiceImageWrapper}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?auto=format&fit=crop&w=800&q=80"
                  alt="Custom paver patio installation with outdoor dining set"
                  className={styles.siteServiceImage}
                  loading="lazy"
                />
                <span className={styles.siteServicePriceBadge}>From $28 / sq ft</span>
              </div>
              <div className={styles.siteServiceBody}>
                <h4>🧱 Custom Paver Patios &amp; Walkways</h4>
                <p>
                  Premium Unilock and Belgard pavers with commercial aggregate base compaction, precision jointing, and lifetime structural integrity.
                </p>
                <ul className={styles.siteServiceSpecs}>
                  <li className={styles.siteServiceSpecItem}>
                    <i aria-hidden="true">✓</i> 6&quot; Compacted crushed base
                  </li>
                  <li className={styles.siteServiceSpecItem}>
                    <i aria-hidden="true">✓</i> Polymeric joint sand
                  </li>
                  <li className={styles.siteServiceSpecItem}>
                    <i aria-hidden="true">✓</i> Heavy-duty edge restraint
                  </li>
                </ul>
                <Link
                  href="/demo/tour/intake"
                  className={styles.siteServiceLink}
                  aria-label="Get instant quote for Custom Paver Patios & Walkways"
                >
                  <span>Get Instant Quote</span>
                  <span>&rarr;</span>
                </Link>
              </div>
            </article>

            {/* Service 2: Fire Pits & Walls */}
            <article className={styles.siteServiceCard}>
              <div className={styles.siteServiceImageWrapper}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://images.unsplash.com/photo-1510312305653-8ed496efae75?auto=format&fit=crop&w=800&q=80"
                  alt="Built-in stone fire pit and curved seating wall"
                  className={styles.siteServiceImage}
                  loading="lazy"
                />
                <span className={styles.siteServicePriceBadge}>From $1,500</span>
              </div>
              <div className={styles.siteServiceBody}>
                <h4>🔥 Built-in Fire Pits &amp; Seat Walls</h4>
                <p>
                  Integrated curved seating walls, wood or gas stone fire pits, and outdoor entertainment focal points designed for Michigan seasons.
                </p>
                <ul className={styles.siteServiceSpecs}>
                  <li className={styles.siteServiceSpecItem}>
                    <i aria-hidden="true">✓</i> Heavy-gauge steel fire ring
                  </li>
                  <li className={styles.siteServiceSpecItem}>
                    <i aria-hidden="true">✓</i> Smooth coping capstones
                  </li>
                  <li className={styles.siteServiceSpecItem}>
                    <i aria-hidden="true">✓</i> Gas or wood burning options
                  </li>
                </ul>
                <Link
                  href="/demo/tour/intake"
                  className={styles.siteServiceLink}
                  aria-label="Get instant quote for Built-in Fire Pits & Seat Walls"
                >
                  <span>Get Instant Quote</span>
                  <span>&rarr;</span>
                </Link>
              </div>
            </article>

            {/* Service 3: Low-Voltage Lighting */}
            <article className={styles.siteServiceCard}>
              <div className={styles.siteServiceImageWrapper}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80"
                  alt="Low-voltage landscape and step lighting on outdoor patio"
                  className={styles.siteServiceImage}
                  loading="lazy"
                />
                <span className={styles.siteServicePriceBadge}>From $750</span>
              </div>
              <div className={styles.siteServiceBody}>
                <h4>✨ Low-Voltage Hardscape Lighting</h4>
                <p>
                  Architectural step, wall, and path lighting with smart dusk-to-dawn controls for warmth, safety, and nighttime curb appeal.
                </p>
                <ul className={styles.siteServiceSpecs}>
                  <li className={styles.siteServiceSpecItem}>
                    <i aria-hidden="true">✓</i> Flush under-cap LED fixtures
                  </li>
                  <li className={styles.siteServiceSpecItem}>
                    <i aria-hidden="true">✓</i> Smart astronomical timer
                  </li>
                  <li className={styles.siteServiceSpecItem}>
                    <i aria-hidden="true">✓</i> Waterproof direct-burial wiring
                  </li>
                </ul>
                <Link
                  href="/demo/tour/intake"
                  className={styles.siteServiceLink}
                  aria-label="Get instant quote for Low-Voltage Landscape Lighting"
                >
                  <span>Get Instant Quote</span>
                  <span>&rarr;</span>
                </Link>
              </div>
            </article>

            {/* Service 4: Drainage & Sub-Base */}
            <article className={styles.siteServiceCard}>
              <div className={styles.siteServiceImageWrapper}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://images.unsplash.com/photo-1629575063988-881596e38d31?auto=format&fit=crop&w=800&q=80"
                  alt="Laser graded backyard sub-base prep and edging"
                  className={styles.siteServiceImage}
                  loading="lazy"
                />
                <span className={styles.siteServicePriceBadge}>From $1,100</span>
              </div>
              <div className={styles.siteServiceBody}>
                <h4>💧 Sub-Base Drainage &amp; Restraints</h4>
                <p>
                  Laser slope grading away from foundation, geotextile separation fabric, downspout tie-ins, and heavy-duty edge restraints.
                </p>
                <ul className={styles.siteServiceSpecs}>
                  <li className={styles.siteServiceSpecItem}>
                    <i aria-hidden="true">✓</i> Geotextile base separation
                  </li>
                  <li className={styles.siteServiceSpecItem}>
                    <i aria-hidden="true">✓</i> Underground downspout routing
                  </li>
                  <li className={styles.siteServiceSpecItem}>
                    <i aria-hidden="true">✓</i> 10&quot; Steel spike edge anchors
                  </li>
                </ul>
                <Link
                  href="/demo/tour/intake"
                  className={styles.siteServiceLink}
                  aria-label="Get instant quote for Sub-base Drainage & Edge Restraints"
                >
                  <span>Get Instant Quote</span>
                  <span>&rarr;</span>
                </Link>
              </div>
            </article>
          </div>
        </section>

        {/* Interactive Service Area & Route Fit Checker */}
        <section className={styles.siteAreaSection} aria-labelledby="area-heading">
          <div className={styles.siteAreaInner}>
            <div className={styles.siteSectionHeader} style={{ marginBottom: '20px' }}>
              <span className={styles.siteSectionEyebrow}>Local Availability</span>
              <h3 id="area-heading" className={styles.siteSectionTitle}>
                Service Areas &amp; Crew Schedule
              </h3>
              <p className={styles.siteSectionSub}>
                We operate active routes throughout Oakland County. Tap your city to check scheduling:
              </p>
            </div>

            <div className={styles.siteAreaGrid}>
              <div className={styles.siteCityList} role="tablist" aria-label="Service area cities">
                {SERVICE_AREAS.map((area) => (
                  <button
                    key={area.city}
                    type="button"
                    role="tab"
                    aria-selected={selectedCityName === area.city}
                    className={`${styles.siteCityBtn} ${selectedCityName === area.city ? styles.siteCityActive : ''}`}
                    onClick={() => setSelectedCityName(area.city)}
                    aria-label={`Check availability in ${area.city}`}
                  >
                    <span>{area.city}</span>
                    <span style={{ fontSize: '11px', opacity: 0.8 }}>{area.distance}</span>
                  </button>
                ))}
              </div>

              <div className={styles.siteAreaStatusCard}>
                <div className={styles.siteAreaStatusHeader}>
                  <span className={styles.siteAreaCityTitle}>{activeArea.city}</span>
                  <span className={styles.siteAreaDistanceBadge}>{activeArea.badge}</span>
                </div>

                <div className={styles.siteAreaStatusRoute}>
                  📍 {activeArea.status} &middot; {activeArea.distance}
                </div>

                <p className={styles.siteAreaStatusDetail}>
                  <strong>Schedule Status:</strong> {activeArea.leadTime}. Our estimator AI calculates precise travel time and route density automatically.
                </p>

                <form onSubmit={handleZipCheck} style={{ marginTop: '16px' }}>
                  <label htmlFor="zipInput" style={{ display: 'block', fontSize: '11.5px', color: '#94a3b8', marginBottom: '6px', fontWeight: 600 }}>
                    Check Your Exact ZIP Code:
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      id="zipInput"
                      type="text"
                      value={zipInput}
                      onChange={(e) => setZipInput(e.target.value)}
                      placeholder="Enter 5-digit ZIP (e.g. 48067)"
                      style={{
                        background: 'rgba(0, 0, 0, 0.4)',
                        border: '1px solid rgba(255, 255, 255, 0.18)',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        color: '#ffffff',
                        fontSize: '13px',
                        flexGrow: 1,
                        minHeight: '44px',
                      }}
                      aria-label="Enter 5-digit ZIP Code"
                    />
                    <button
                      type="submit"
                      style={{
                        background: '#50e3bd',
                        color: '#071a26',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '8px 16px',
                        fontSize: '13px',
                        fontWeight: 750,
                        cursor: 'pointer',
                        minHeight: '44px',
                        whiteSpace: 'nowrap',
                      }}
                      aria-label="Check ZIP Code availability"
                    >
                      Check ZIP
                    </button>
                  </div>
                  {zipMessage && (
                    <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#50e3bd', fontWeight: 600 }}>
                      {zipMessage}
                    </p>
                  )}
                </form>
              </div>
            </div>
          </div>
        </section>

        {/* 3-Step Process Section */}
        <section className={styles.siteProcessSection} aria-labelledby="process-heading">
          <div className={styles.siteSectionHeader}>
            <span className={styles.siteSectionEyebrow}>How It Works</span>
            <h3 id="process-heading" className={styles.siteSectionTitle}>
              Transparent Estimates &amp; Booking
            </h3>
            <p className={styles.siteSectionSub}>
              From first click to completed project — zero sales games, zero phone tag.
            </p>
          </div>

          <div className={styles.siteProcessGrid}>
            <div className={styles.siteProcessCard}>
              <span className={styles.siteProcessNumber}>1</span>
              <h4>Request Online in 30 Seconds</h4>
              <p>
                Describe your project scope or outdoor goals. Our AI calculates preliminary pricing instantly based on local Oakland County catalog rates.
              </p>
            </div>

            <div className={styles.siteProcessCard}>
              <span className={styles.siteProcessNumber}>2</span>
              <h4>Itemized Proposal by SMS</h4>
              <p>
                Receive an itemized digital quote with clear line items, optional lighting upgrades, and transparent milestone schedules sent right to your phone.
              </p>
            </div>

            <div className={styles.siteProcessCard}>
              <span className={styles.siteProcessNumber}>3</span>
              <h4>Approve, E-Sign &amp; Book Arrival</h4>
              <p>
                Approve upgrades, sign digitally, and secure your crew arrival window with Apple Pay or credit card in under 60 seconds.
              </p>
            </div>
          </div>
        </section>

        {/* Verified Social Proof & Customer Reviews */}
        <section className={styles.siteReviews} aria-labelledby="reviews-heading">
          <div className={styles.siteReviewsInner}>
            <span className={styles.siteSectionEyebrow}>Verified Feedback</span>
            <h3 id="reviews-heading" className={styles.siteSectionTitle} style={{ marginBottom: '6px' }}>
              What Your Neighbors Say
            </h3>

            <div className={styles.siteReviewScoreHeader}>
              <span className={styles.siteReviewBigStars} aria-hidden="true">★★★★★</span>
              <span className={styles.siteReviewScoreText}>
                {DEMO_TOUR_CONTRACTOR.rating}
              </span>
            </div>

            <span className={styles.siteReviewDisclaimer}>
              Illustrative demo reviews &middot; Evergreen Lawn &amp; Landscape (fictional sample)
            </span>

            <div className={styles.siteReviewMetrics}>
              <span className={styles.siteReviewMetricPill}>★ 5.0 Workmanship</span>
              <span className={styles.siteReviewMetricPill}>★ 4.9 On-Time Arrival</span>
              <span className={styles.siteReviewMetricPill}>★ 5.0 Communication</span>
              <span className={styles.siteReviewMetricPill}>★ 4.9 Clean Jobsite</span>
            </div>

            <div className={styles.siteReviewGrid}>
              <div className={styles.siteReviewCard}>
                <div className={styles.siteReviewCardHeader}>
                  <div className={styles.siteReviewStars}>★★★★★</div>
                  <span className={styles.siteReviewTag}>Paver Patio + Walkway</span>
                </div>
                <p className={styles.siteReviewText}>
                  &ldquo;Got an instant quote on Thursday night, patio installation completed the following week. Clean crew, zero mess, exact price as quoted.&rdquo;
                </p>
                <div className={styles.siteReviewAuthorRow}>
                  <span className={styles.siteReviewAvatar}>DM</span>
                  <div>
                    <span className={styles.siteReviewAuthor}>David M.</span>
                    <span className={styles.siteReviewLoc}>Royal Oak, MI</span>
                  </div>
                </div>
              </div>

              <div className={styles.siteReviewCard}>
                <div className={styles.siteReviewCardHeader}>
                  <div className={styles.siteReviewStars}>★★★★★</div>
                  <span className={styles.siteReviewTag}>Fire Pit &amp; Seat Wall</span>
                </div>
                <p className={styles.siteReviewText}>
                  &ldquo;The built-in fire pit and seat wall are incredible. Mike and Jamal were on time every morning and handled everything seamlessly.&rdquo;
                </p>
                <div className={styles.siteReviewAuthorRow}>
                  <span className={styles.siteReviewAvatar}>ER</span>
                  <div>
                    <span className={styles.siteReviewAuthor}>Elena R.</span>
                    <span className={styles.siteReviewLoc}>Ferndale, MI</span>
                  </div>
                </div>
              </div>

              <div className={styles.siteReviewCard}>
                <div className={styles.siteReviewCardHeader}>
                  <div className={styles.siteReviewStars}>★★★★★</div>
                  <span className={styles.siteReviewTag}>Full Patio Renovation</span>
                </div>
                <p className={styles.siteReviewText}>
                  &ldquo;Loved seeing the itemized options and approving the lighting upgrade right on our phones without 5 phone calls back and forth.&rdquo;
                </p>
                <div className={styles.siteReviewAuthorRow}>
                  <span className={styles.siteReviewAvatar}>TB</span>
                  <div>
                    <span className={styles.siteReviewAuthor}>Taylor B.</span>
                    <span className={styles.siteReviewLoc}>Royal Oak, MI</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Bottom Tour Evaluation Callout Dock */}
        <section className={styles.siteEvaluationDock} aria-label="Evaluation tour guidance">
          <div className={styles.siteEvaluationDockInner}>
            <div className={styles.siteEvaluationCopy}>
              <h4>🌿 Step 1: Attract Phase — Homeowner Experience</h4>
              <p>
                You are experiencing the prospective customer&apos;s journey. When Taylor Brooks requests an instant estimate, LetsGetQuoted qualifies the scope and distance 24/7.
              </p>
            </div>

            <Link
              href="/demo/tour/intake"
              className={styles.siteEvaluationContinueBtn}
              aria-label="Continue to Step 2: Instant AI Intake"
            >
              <span>Continue to Step 2: AI Intake &rarr;</span>
            </Link>
          </div>
        </section>
      </div>

      {/* Mobile Sticky Action Dock */}
      <div className={styles.mobileStickyActionDock} aria-label="Mobile quick actions">
        <div>
          <span style={{ fontSize: '11px', color: '#50e3bd', fontWeight: 800, textTransform: 'uppercase', display: 'block' }}>
            Step 1 of 6 &middot; Attract
          </span>
          <strong style={{ fontSize: '13px', color: '#ffffff' }}>Taylor Brooks Website Flow</strong>
        </div>
        <Link
          href="/demo/tour/intake"
          className={styles.tourNextActionBtn}
          style={{ padding: '8px 14px', fontSize: '13px' }}
          aria-label="Start instant estimate"
        >
          Start Estimate &rarr;
        </Link>
      </div>
    </DemoTourFrame>
  );
}
