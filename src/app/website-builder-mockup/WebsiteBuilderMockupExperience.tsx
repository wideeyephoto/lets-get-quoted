'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import SiteCustomizerSandbox from '@/components/marketing/SiteCustomizerSandbox';
import WebsiteMediaStudioShowcase from '@/components/marketing/WebsiteMediaStudioShowcase';
import WebsiteCapabilityMatrix from '@/components/marketing/WebsiteCapabilityMatrix';
import styles from './website-builder-mockup.module.css';

interface TradeData {
  id: string;
  name: string;
  shortName: string;
  icon: string;
  title: string;
  subtitle: string;
  services: string[];
  unitName: string;
  minUnits: number;
  maxUnits: number;
  defaultUnits: number;
  unitStep: number;
  baseRatePerUnit: number;
  multiplierLow: number;
  multiplierHigh: number;
}

const TRADES: TradeData[] = [
  {
    id: 'roofing',
    name: 'Roofing & Gutters',
    shortName: 'Roofing',
    icon: '🏠',
    title: 'Certified Roofing Experts in Fairview',
    subtitle: 'From emergency leak repairs to architectural shingle installations. Get an instant quote in 60 seconds.',
    services: ['Architectural Shingles', 'Emergency Leak Repair', 'Seamless Gutters', 'Storm Damage Assessment'],
    unitName: 'Roof Size (Sq Ft)',
    minUnits: 1000,
    maxUnits: 4500,
    defaultUnits: 2200,
    unitStep: 100,
    baseRatePerUnit: 4.8,
    multiplierLow: 0.9,
    multiplierHigh: 1.25,
  },
  {
    id: 'plumbing',
    name: 'Plumbing & Drains',
    shortName: 'Plumbing',
    icon: '🔧',
    title: 'Precision Plumbing & Water Solutions',
    subtitle: 'Fast dispatch for leak emergencies, water heater replacements, and whole-home repiping.',
    services: ['Tankless Water Heaters', 'Hydro-Jetting Drain Clean', 'Whole-Home Repiping', 'Bathroom Rough-Ins'],
    unitName: 'Fixtures & Work Scope',
    minUnits: 1,
    maxUnits: 12,
    defaultUnits: 3,
    unitStep: 1,
    baseRatePerUnit: 450,
    multiplierLow: 0.85,
    multiplierHigh: 1.3,
  },
  {
    id: 'hvac',
    name: 'Heating & Cooling (HVAC)',
    shortName: 'HVAC',
    icon: '❄️',
    title: 'High-Efficiency Climate Control',
    subtitle: 'Stay comfortable year-round with heat pump retrofits, AC maintenance, and furnace installs.',
    services: ['Heat Pump Retrofits', 'AC System Replacement', 'Furnace Tune-Ups', 'Ductless Mini-Splits'],
    unitName: 'Home Size (Sq Ft)',
    minUnits: 800,
    maxUnits: 4000,
    defaultUnits: 2000,
    unitStep: 100,
    baseRatePerUnit: 3.8,
    multiplierLow: 0.9,
    multiplierHigh: 1.35,
  },
  {
    id: 'electrical',
    name: 'Electrical & Solar',
    shortName: 'Electrical',
    icon: '⚡',
    title: 'Licensed Master Electricians',
    subtitle: 'Safe, code-compliant panel upgrades, EV fast charger setups, and smart home wiring.',
    services: ['200A Panel Upgrades', 'Level 2 EV Chargers', 'Whole-Home Rewiring', 'Generator Interlocks'],
    unitName: 'Service Capacity / Circuits',
    minUnits: 1,
    maxUnits: 20,
    defaultUnits: 4,
    unitStep: 1,
    baseRatePerUnit: 380,
    multiplierLow: 0.9,
    multiplierHigh: 1.25,
  },
  {
    id: 'landscaping',
    name: 'Landscaping & Hardscape',
    shortName: 'Landscaping',
    icon: '🌿',
    title: 'Custom Hardscapes & Outdoor Living',
    subtitle: 'Transform your outdoor property with custom stone pavers, retaining walls, and sod installation.',
    services: ['Paver Patios & Walkways', 'Stone Retaining Walls', 'Sod & Irrigation Systems', 'Outdoor Kitchens'],
    unitName: 'Coverage Area (Sq Ft)',
    minUnits: 200,
    maxUnits: 2500,
    defaultUnits: 800,
    unitStep: 50,
    baseRatePerUnit: 14.5,
    multiplierLow: 0.88,
    multiplierHigh: 1.3,
  },
  {
    id: 'remodeling',
    name: 'Kitchen & Bath Remodeling',
    shortName: 'Remodeling',
    icon: '🔨',
    title: 'Luxury Kitchen & Bath Renovations',
    subtitle: 'Full-service design and build remodeling with transparent milestone pricing and 3D previews.',
    services: ['Custom Kitchens', 'Master Bath Ensuites', 'Finished Basements', 'Custom Cabinetry'],
    unitName: 'Room Footprint (Sq Ft)',
    minUnits: 80,
    maxUnits: 600,
    defaultUnits: 220,
    unitStep: 20,
    baseRatePerUnit: 95,
    multiplierLow: 0.85,
    multiplierHigh: 1.4,
  },
];

const COLOR_PALETTES = [
  { id: 'ember', name: 'Ember Orange', hex: '#ff7137' },
  { id: 'mint', name: 'Electric Emerald', hex: '#4ee0bc' },
  { id: 'blue', name: 'Pacific Blue', hex: '#67b7ff' },
  { id: 'gold', name: 'Bold Gold', hex: '#ffc44d' },
  { id: 'purple', name: 'Royal Violet', hex: '#b388ff' },
];

const FAQS = [
  {
    q: 'How much do I need to have ready to launch?',
    a: 'Just your business name, your trade, and the towns you cover. Our AI generates your initial service pages, local SEO copy, project gallery placeholders, and trade-specific instant quote forms immediately.',
  },
  {
    q: 'Can I edit the generated content and design?',
    a: 'Yes, 100% of the content is yours to modify. You can rewrite text, upload real job photos or video clips, adjust service lists, tweak pricing formulas, and change color schemes at any time before or after publishing.',
  },
  {
    q: 'Can I connect a domain I already own?',
    a: 'Absolutely. Every site is published instantly on a fast, free letsgetquoted.com subdomain. Whenever you are ready, you can connect your existing custom domain (e.g. yourcompany.com) with automated SSL encryption.',
  },
  {
    q: 'What happens when a customer requests an estimate?',
    a: 'The inquiry does not get lost in email. It lands in your dashboard with the job description, homeowner contact info, uploaded photos, and calculated price range—ready to send a formal quote or schedule.',
  },
  {
    q: 'What video layouts are included?',
    a: 'You get 6 modern video layouts: full-bleed background hero loop, split copy player, project story case studies, vertical smartphone reels (9:16), on-camera customer testimonials, and process explainers.',
  },
  {
    q: 'What is the pricing model for the website builder?',
    a: 'The website builder and custom domain hosting are included on every Let’s Get Quoted plan, starting at $0/month on the Flex plan with no monthly subscription fee.',
  },
];

const money = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export default function WebsiteBuilderMockupExperience() {
  const [selectedTradeId, setSelectedTradeId] = useState('roofing');
  const [selectedPaletteHex, setSelectedPaletteHex] = useState('#ff7137');
  const [viewportMode, setViewportMode] = useState<'desktop' | 'mobile'>('desktop');
  const [calcUnits, setCalcUnits] = useState<number>(2200);

  const currentTrade = useMemo(() => {
    return TRADES.find((t) => t.id === selectedTradeId) || TRADES[0];
  }, [selectedTradeId]);

  const handleTradeChange = (trade: TradeData) => {
    setSelectedTradeId(trade.id);
    setCalcUnits(trade.defaultUnits);
  };

  const estimatePriceRange = useMemo(() => {
    const rawTotal = calcUnits * currentTrade.baseRatePerUnit;
    const low = Math.round((rawTotal * currentTrade.multiplierLow) / 50) * 50;
    const high = Math.round((rawTotal * currentTrade.multiplierHigh) / 50) * 50;
    return {
      low: `$${money.format(low)}`,
      high: `$${money.format(high)}`,
    };
  }, [calcUnits, currentTrade]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.siteShell}>
        {/* Ambient floating glows */}
        <div className={`${styles.ambient} ${styles.ambientOne}`} />
        <div className={`${styles.ambient} ${styles.ambientTwo}`} />
        <div className={`${styles.ambient} ${styles.ambientThree}`} />

        {/* Top Navigation */}
        <nav className={styles.siteNav} aria-label="Main Navigation">
          <div className={styles.brandArea}>
            <Link href="/" className={styles.brandStamp}>
              LET&apos;S GET <strong>QUOTED</strong>
            </Link>
            <span className={styles.navMockupBadge}>Theme Preview · Website Builder</span>
          </div>

          <div className={styles.navLinks}>
            <Link href="/features">Product</Link>
            <Link href="/website-builder-mockup" className={styles.active}>
              Website
            </Link>
            <Link href="/how-it-works">How it works</Link>
            <Link href="/for">For your trade</Link>
            <Link href="/pricing">Pricing</Link>
          </div>

          <div className={styles.navActions}>
            <Link href="https://app.letsgetquoted.com/login" className={styles.navSignIn}>
              Sign in
            </Link>
            <Link
              href="https://app.letsgetquoted.com/start?goal=build_site&source=website_builder_mockup"
              className={styles.navCta}
            >
              Create Free Account →
            </Link>
          </div>
        </nav>

        <main className={styles.container}>
          {/* =================================================================
              HERO SECTION WITH SPLIT LAYOUT & LIVE INTERACTIVE SIMULATOR
              ================================================================= */}
          <section className={styles.hero} aria-labelledby="hero-title">
            <div className={styles.heroContent}>
              <div className={styles.eyebrowChip}>
                <span>✦</span> AI Contractor Website Builder
              </div>

              <h1 id="hero-title" className={styles.heroTitle}>
                The contractor website that turns clicks into <em>ready-to-quote jobs.</em>
              </h1>

              <p className={styles.heroLede}>
                Tell us your business name, trade and service area. We’ll generate a high-converting
                contractor website with service pages, local SEO, trust signals, and an instant
                estimate intake—connected straight to your back office.
              </p>

              <div className={styles.heroChipsRow}>
                <div className={styles.heroChip}>
                  <span className={styles.heroChipCheck}>✓</span> Every word editable
                </div>
                <div className={styles.heroChip}>
                  <span className={styles.heroChipCheck}>✓</span> Your own domain
                </div>
                <div className={styles.heroChip}>
                  <span className={styles.heroChipCheck}>✓</span> Instant estimate included
                </div>
                <div className={styles.heroChip}>
                  <span className={styles.heroChipCheck}>✓</span> 18+ Contractor trades
                </div>
              </div>

              <div className={styles.heroActions}>
                <Link
                  href="https://app.letsgetquoted.com/start?goal=build_site&source=website_builder_mockup"
                  className={styles.btnPrimary}
                >
                  Build My Free Site <span>→</span>
                </Link>
                <a href="#interactive-sandbox" className={styles.btnSecondary}>
                  Test Interactive Sandbox ↓
                </a>
              </div>

              <div className={styles.heroGuarantee}>
                <span />
                Free on letsgetquoted.com subdomain · Connect your custom domain anytime
              </div>
            </div>

            {/* Right: Live Interactive Website Simulator */}
            <div className={styles.simulatorCard}>
              <div className={styles.simHeader}>
                <div className={styles.simDots}>
                  <span className={`${styles.simDot} ${styles.simDotRed}`} />
                  <span className={`${styles.simDot} ${styles.simDotYellow}`} />
                  <span className={`${styles.simDot} ${styles.simDotGreen}`} />
                </div>

                <div className={styles.simDomainBar}>
                  <span className={styles.simSslBadge}>🔒 SSL</span>
                  <span>cedarcreekroofing.com</span>
                </div>

                <div className={styles.simViewportToggle}>
                  <button
                    type="button"
                    onClick={() => setViewportMode('desktop')}
                    className={`${styles.simViewportBtn} ${viewportMode === 'desktop' ? styles.active : ''}`}
                    title="Desktop Preview"
                  >
                    🖥️ Desktop
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewportMode('mobile')}
                    className={`${styles.simViewportBtn} ${viewportMode === 'mobile' ? styles.active : ''}`}
                    title="Mobile Preview"
                  >
                    📱 Mobile
                  </button>
                </div>
              </div>

              {/* Controls Bar: Trade Switcher & Palette Picker */}
              <div className={styles.simControlsBar}>
                <div className={styles.tradeTabGroup}>
                  {TRADES.map((trade) => (
                    <button
                      key={trade.id}
                      type="button"
                      onClick={() => handleTradeChange(trade)}
                      className={`${styles.tradeTabBtn} ${selectedTradeId === trade.id ? styles.active : ''}`}
                    >
                      <span>{trade.icon}</span> {trade.shortName}
                    </button>
                  ))}
                </div>

                <div className={styles.paletteSelector}>
                  <span className={styles.paletteLabel}>Accent:</span>
                  {COLOR_PALETTES.map((palette) => (
                    <button
                      key={palette.id}
                      type="button"
                      onClick={() => setSelectedPaletteHex(palette.hex)}
                      className={`${styles.paletteDot} ${selectedPaletteHex === palette.hex ? styles.active : ''}`}
                      style={{ backgroundColor: palette.hex }}
                      title={palette.name}
                    />
                  ))}
                </div>
              </div>

              {/* Simulated Website Canvas */}
              <div
                className={`${styles.simSiteStage} ${viewportMode === 'mobile' ? styles.mobileView : ''}`}
              >
                {/* Simulated Header */}
                <div className={styles.mockHeader}>
                  <div className={styles.mockBrand}>
                    <div
                      className={styles.mockLogoIcon}
                      style={{ backgroundColor: selectedPaletteHex }}
                    >
                      {currentTrade.icon}
                    </div>
                    <span className={styles.mockBrandText}>Cedar Creek {currentTrade.shortName}</span>
                  </div>

                  {viewportMode === 'desktop' && (
                    <div className={styles.mockNavPills}>
                      <span>Services</span>
                      <span>About</span>
                      <span>Reviews</span>
                      <span>Area</span>
                    </div>
                  )}

                  <button
                    type="button"
                    className={styles.mockQuoteBtn}
                    style={{ backgroundColor: selectedPaletteHex }}
                  >
                    Instant Estimate
                  </button>
                </div>

                {/* Simulated Hero Grid */}
                <div className={styles.mockHeroGrid}>
                  <div>
                    <span
                      className={styles.mockBadge}
                      style={{ color: selectedPaletteHex, borderColor: selectedPaletteHex }}
                    >
                      ✦ Licensed & Insured Contractor
                    </span>
                    <h2 className={styles.mockTitle}>{currentTrade.title}</h2>
                    <p className={styles.mockSubtitle}>{currentTrade.subtitle}</p>

                    <div className={styles.mockServicesList}>
                      {currentTrade.services.map((srv) => (
                        <span key={srv} className={styles.mockServiceTag}>
                          ✓ {srv}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Simulated Instant Estimator Widget */}
                  <div className={styles.mockEstimatorBox}>
                    <div className={styles.estimatorHeader}>
                      <span className={styles.estimatorTitle}>
                        <span>⚡</span> Instant Project Calculator
                      </span>
                      <span className={styles.estimatorLivePill}>Live Widget</span>
                    </div>

                    <div className={styles.sliderRow}>
                      <div className={styles.sliderLabelRow}>
                        <span>{currentTrade.unitName}</span>
                        <strong style={{ color: selectedPaletteHex }}>
                          {money.format(calcUnits)}
                        </strong>
                      </div>
                      <input
                        type="range"
                        min={currentTrade.minUnits}
                        max={currentTrade.maxUnits}
                        step={currentTrade.unitStep}
                        value={calcUnits}
                        onChange={(e) => setCalcUnits(Number(e.target.value))}
                        className={styles.calcSlider}
                        style={{ accentColor: selectedPaletteHex }}
                      />
                    </div>

                    <div className={styles.estimatePriceResult}>
                      <span className={styles.estimateLabel}>Estimated Range:</span>
                      <span className={styles.estimateRange}>
                        {estimatePriceRange.low} – {estimatePriceRange.high}
                      </span>
                    </div>

                    <button
                      type="button"
                      className={styles.mockIntakeBtn}
                      style={{ backgroundColor: selectedPaletteHex }}
                    >
                      Lock In Estimate &amp; Book Visit →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* =================================================================
              PROOF METRICS STRIP
              ================================================================= */}
          <section className={styles.proofStrip} aria-label="Key Platform Proof Points">
            <div className={styles.proofCard}>
              <div className={styles.proofNumber}>60s</div>
              <h3 className={styles.proofTitle}>Instant AI Generation</h3>
              <p className={styles.proofDesc}>
                Answer 3 simple questions to generate a complete, high-converting 5-page site.
              </p>
            </div>

            <div className={styles.proofCard}>
              <div className={styles.proofNumber}>18+</div>
              <h3 className={styles.proofTitle}>Contractor Trade Profiles</h3>
              <p className={styles.proofDesc}>
                Tailored service checklists, intake logic, and terminology for your specialty.
              </p>
            </div>

            <div className={styles.proofCard}>
              <div className={styles.proofNumber}>$0/mo</div>
              <h3 className={styles.proofTitle}>Included On Flex Plan</h3>
              <p className={styles.proofDesc}>
                Full website builder, domain hosting, and intake forms with zero monthly fee.
              </p>
            </div>

            <div className={styles.proofCard}>
              <div className={styles.proofNumber}>100%</div>
              <h3 className={styles.proofTitle}>Editable &amp; Owned by You</h3>
              <p className={styles.proofDesc}>
                Bring your own domain, edit every word, and retain complete control of your brand.
              </p>
            </div>
          </section>

          {/* =================================================================
              CONNECTED CUSTOMER JOURNEY (5 STAGES)
              ================================================================= */}
          <section className={`${styles.sectionBlock} ${styles.journeySection}`} aria-labelledby="journey-heading">
            <div className={styles.sectionHead}>
              <div className={styles.sectionEyebrow}>
                <span>✦</span> One Connected System
              </div>
              <h2 id="journey-heading" className={styles.sectionTitle}>
                Other builders stop at &ldquo;submit.&rdquo; <em>Yours keeps the job moving.</em>
              </h2>
              <p className={styles.sectionSubtitle}>
                The details a homeowner enters on your website stay with the job record—flowing
                seamlessly into your quotes, dispatch schedule, client portal, and Stripe invoices.
              </p>
            </div>

            <div className={styles.journeyPipeline}>
              <div className={styles.journeyStepCard}>
                <div className={styles.stepNumber}>01</div>
                <h3 className={styles.stepTitle}>Homeowner Visit</h3>
                <p className={styles.stepBody}>
                  Local service pages and trade trust signals answer their questions and build
                  immediate credibility.
                </p>
              </div>

              <div className={styles.journeyStepCard}>
                <div className={styles.stepNumber}>02</div>
                <h3 className={styles.stepTitle}>Smart AI Intake</h3>
                <p className={styles.stepBody}>
                  Intake questions ask for square footage, photos, and trade specifics before you
                  ever pick up the phone.
                </p>
              </div>

              <div className={styles.journeyStepCard}>
                <div className={styles.stepNumber}>03</div>
                <h3 className={styles.stepTitle}>Instant Estimate</h3>
                <p className={styles.stepBody}>
                  Give visitors a realistic price range on the spot while interest is at its peak.
                </p>
              </div>

              <div className={styles.journeyStepCard}>
                <div className={styles.stepNumber}>04</div>
                <h3 className={styles.stepTitle}>Quote &amp; Win</h3>
                <p className={styles.stepBody}>
                  Convert the intake into an itemized proposal with online e-signatures and deposit
                  collection.
                </p>
              </div>
            </div>

            {/* Contrast Bar */}
            <div className={styles.compareRow}>
              <div className={styles.compareBad}>
                <span className={styles.compareTagBad}>Typical Website Builder</span>
                <span className={styles.compareTitleBad}>Static Contact Form Submitted</span>
                <span className={styles.compareDescBad}>
                  Unqualified emails land in your inbox. You have to call back, re-ask basic questions,
                  and manually retype everything.
                </span>
              </div>

              <div className={styles.compareArrow} aria-hidden="true">
                →
              </div>

              <div className={styles.compareGood}>
                <span className={styles.compareTagGood}>Let&apos;s Get Quoted</span>
                <span className={styles.compareTitleGood}>Quote-Ready Job Record Generated</span>
                <span className={styles.compareDescGood}>
                  Full scope, homeowner photos, address verification, and estimate range flow directly
                  into your quote and calendar.
                </span>
              </div>
            </div>
          </section>

          {/* =================================================================
              TWO-PANEL VERIFICATION: PUBLISHING & FIRST REQUEST
              ================================================================= */}
          <section className={styles.sectionBlock} aria-labelledby="publish-heading">
            <div className={styles.sectionHead}>
              <div className={styles.sectionEyebrow}>
                <span>✦</span> Instant Go-Live
              </div>
              <h2 id="publish-heading" className={styles.sectionTitle}>
                Publish your site in one click. <em>Receive quote-ready jobs.</em>
              </h2>
              <p className={styles.sectionSubtitle}>
                Go live immediately on a free letsgetquoted.com address, or connect your custom
                domain. When requests arrive, they carry full project context.
              </p>
            </div>

            <div className={styles.publishGrid}>
              {/* Left Panel: Domain & Publishing Status */}
              <div className={styles.panelGlassCard}>
                <div className={styles.panelHeader}>
                  <div className={styles.panelTitle}>
                    <span>🌐</span> Publishing &amp; Domain Control
                  </div>
                  <span className={styles.statusPillLive}>● Live &amp; Secure</span>
                </div>

                <ul className={styles.addrList}>
                  <li className={styles.addrItem}>
                    <span className={styles.addrDomain}>cedarcreekroofing.letsgetquoted.com</span>
                    <span className={styles.addrStatus}>✓ Included Subdomain</span>
                  </li>
                  <li className={styles.addrItem}>
                    <span className={styles.addrDomain}>cedarcreekroofing.com</span>
                    <span className={styles.addrStatus}>✓ Custom Domain Connected</span>
                  </li>
                </ul>

                <div className={styles.dnsTargetBox}>
                  <span>CNAME Record:</span>
                  <strong>www → domains.letsgetquoted.com</strong>
                </div>

                <div className={styles.btnActionRow}>
                  <button type="button" className={`${styles.btnSmall} ${styles.btnSmallPrimary}`}>
                    Publish Changes
                  </button>
                  <button type="button" className={styles.btnSmall}>
                    Preview Live Site ↗
                  </button>
                </div>
              </div>

              {/* Right Panel: First Incoming Request Mock */}
              <div className={styles.panelGlassCard}>
                <div className={styles.panelHeader}>
                  <div className={styles.panelTitle}>
                    <span>📥</span> New Inbound Lead · 5:48 PM
                  </div>
                  <span className={styles.statusPillUnread}>● New Request</span>
                </div>

                <p className={styles.requestQuoteText}>
                  &ldquo;Shingles blew off during yesterday’s high winds and we noticed a damp spot
                  on the master bedroom ceiling. Single-story ranch, approx 2,200 sq ft. Looking for
                  an inspection this week.&rdquo;
                </p>

                <div className={styles.requestDataGrid}>
                  <span className={styles.dataLabel}>Service Scope:</span>
                  <span className={styles.dataValue}>Storm Damage Roof Repair</span>

                  <span className={styles.dataLabel}>Service Area:</span>
                  <span className={styles.dataValue}>Fairview (Inside Coverage Zone)</span>

                  <span className={styles.dataLabel}>Homeowner Photos:</span>
                  <span className={styles.dataValue}>3 photos attached (Roofline &amp; Attic)</span>

                  <span className={styles.dataLabel}>Instant Range:</span>
                  <span className={styles.dataMoney}>$9,400 – $13,200</span>
                </div>

                <div className={styles.btnActionRow}>
                  <button type="button" className={`${styles.btnSmall} ${styles.btnSmallPrimary}`}>
                    Convert to Official Quote
                  </button>
                  <button type="button" className={styles.btnSmall}>
                    Text Homeowner
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* =================================================================
              INTERACTIVE SANDBOX SECTION
              ================================================================= */}
          <section id="interactive-sandbox" className={styles.sectionBlock} aria-labelledby="sandbox-heading">
            <div className={styles.sectionHead}>
              <div className={styles.sectionEyebrow}>
                <span>✦</span> Interactive Builder Sandbox
              </div>
              <h2 id="sandbox-heading" className={styles.sectionTitle}>
                Test drive the customizer right now.
              </h2>
              <p className={styles.sectionSubtitle}>
                Type your company name, select your trade, pick an archetype theme, and watch the
                design re-render live in real time.
              </p>
            </div>

            <SiteCustomizerSandbox />
          </section>

          {/* =================================================================
              MEDIA STUDIO SHOWCASE (6 VIDEO LAYOUTS)
              ================================================================= */}
          <section className={styles.sectionBlock} aria-labelledby="video-heading">
            <div className={styles.sectionHead}>
              <div className={styles.sectionEyebrow}>
                <span>✦</span> 6 Video Layout Archetypes
              </div>
              <h2 id="video-heading" className={styles.sectionTitle}>
                Contractor video that converts without slowing down page loads.
              </h2>
              <p className={styles.sectionSubtitle}>
                From full-bleed background hero loops to vertical jobsite reels, choose the exact
                video layout that highlights your craftsmanship.
              </p>
            </div>

            <WebsiteMediaStudioShowcase />
          </section>

          {/* =================================================================
              WEBSITE CAPABILITY MATRIX
              ================================================================= */}
          <section className={styles.sectionBlock} aria-labelledby="matrix-heading">
            <div className={styles.sectionHead}>
              <div className={styles.sectionEyebrow}>
                <span>✦</span> Complete Capabilities
              </div>
              <h2 id="matrix-heading" className={styles.sectionTitle}>
                Every feature built for contractor growth.
              </h2>
              <p className={styles.sectionSubtitle}>
                Explore all design archetypes, video options, AI intake configurations, local SEO
                features, and back-office integrations.
              </p>
            </div>

            <WebsiteCapabilityMatrix />
          </section>

          {/* =================================================================
              PRACTICAL FAQ SECTION
              ================================================================= */}
          <section className={styles.sectionBlock} aria-labelledby="faq-heading">
            <div className={styles.sectionHead}>
              <div className={styles.sectionEyebrow}>
                <span>✦</span> Common Questions
              </div>
              <h2 id="faq-heading" className={styles.sectionTitle}>
                Everything you need to know before building.
              </h2>
              <p className={styles.sectionSubtitle}>
                Clear, straightforward answers about domains, content ownership, and pricing.
              </p>
            </div>

            <div className={styles.faqGrid}>
              {FAQS.map((faq) => (
                <details key={faq.q} className={styles.faqItem}>
                  <summary className={styles.faqSummary}>
                    <span>{faq.q}</span>
                    <span className={styles.faqIcon}>+</span>
                  </summary>
                  <p className={styles.faqAnswer}>{faq.a}</p>
                </details>
              ))}
            </div>
          </section>

          {/* =================================================================
              CLOSING HIGH-IMPACT CTA BANNER
              ================================================================= */}
          <section className={styles.closingCtaCard} aria-labelledby="cta-heading">
            <h2 id="cta-heading" className={styles.ctaTitle}>
              Launch a contractor website built to bring you <em>quote-ready jobs.</em>
            </h2>
            <p className={styles.ctaSubtitle}>
              Start with three simple answers. Customize your design, services, and pricing formulas.
              Publish when you’re ready—all included from $0/month.
            </p>

            <div className={styles.ctaButtons}>
              <Link
                href="https://app.letsgetquoted.com/start?goal=build_site&source=website_builder_mockup_cta"
                className={styles.btnPrimary}
              >
                Build My Free Website Now →
              </Link>
              <Link href="/pricing" className={styles.btnSecondary}>
                Compare All Plans &amp; Pricing
              </Link>
            </div>

            <div className={styles.ctaPillsRow}>
              <div className={styles.ctaPillItem}>
                <span>✓</span> $0 Upfront Cost
              </div>
              <div className={styles.ctaPillItem}>
                <span>✓</span> No Credit Card Required
              </div>
              <div className={styles.ctaPillItem}>
                <span>✓</span> Launch in Under 5 Minutes
              </div>
              <div className={styles.ctaPillItem}>
                <span>✓</span> Keep Your Custom Domain
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
