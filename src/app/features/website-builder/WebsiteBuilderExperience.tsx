'use client';

import Link from 'next/link';
import { useState } from 'react';
import HeroThemeCycler from './HeroThemeCycler';
import WebsiteMediaStudioShowcase from '@/components/marketing/WebsiteMediaStudioShowcase';
import WebsiteCapabilityMatrix from '@/components/marketing/WebsiteCapabilityMatrix';
import { TRADES } from '@/lib/trades';
import { PUBLIC_PRICING_SUMMARY } from '@/lib/pricing';
import styles from './website-builder-theme.module.css';

const HERO_SIGNUP_URL = 'https://app.letsgetquoted.com/start?goal=build_site&source=website_builder_hero';
const FOOTER_SIGNUP_URL = 'https://app.letsgetquoted.com/start?goal=build_site&source=website_builder_footer';

const PROOF_METRICS = [
  {
    number: '60s',
    title: 'Instant Generation',
    desc: 'Name your business, pick your trade, and get a complete multi-page website ready to publish.',
  },
  {
    number: `${TRADES.length}+`,
    title: 'Contractor Trades',
    desc: 'Tailored intake questionnaires, realistic service menus, and trade-specific copy out of the box.',
  },
  {
    number: '$0/mo',
    title: 'Flex Plan Hosting',
    desc: 'Launch without a monthly fee. Free SSL, instant subdomains, and custom domain connection included.',
  },
  {
    number: '100%',
    title: 'Editable & Owned',
    desc: 'You control every photo, color, rate range, and paragraph. Your domain and brand stay yours.',
  },
];

const JOURNEY_STEPS = [
  {
    n: '01',
    title: 'Visit',
    badge: '📍 Fairview Roofing · Local SEO',
    badgeTone: 'blue',
    body: 'Trade-tailored SEO town pages bring local homeowners directly to your site.',
    headline: 'Rank #1 on Google Maps for every town in your service area.',
    oldWay: 'Bland 1-page template · Invisible on Google Maps · $0 organic visits',
    newWay: '18 Auto-generated town pages · Rich contractor schema · Instant local rankings',
    bullets: [
      'Automatic landing pages for every suburb and neighborhood you service',
      'Structured local schema for instant Google Maps Pack placement',
      'High-intent homeowners land directly on your trade estimator',
    ],
    mockup: {
      tag: '✦ SEO Town Engine',
      searchQuery: 'roof repair near me',
      searchRank: 'Map Pack #1',
      service: '📍 Fairview Roofing',
      serviceSub: 'Fairview, NJ · Licensed Roofing Contractor',
      status: 'Live in Local Pack',
      chips: ['⭐ 4.9 (48 Reviews)', '🗺️ 18 Town Pages Active', '⚡ Rich Schema Verified'],
      label: 'Local Organic Traffic:',
      highlight: '#1 Rank · 380+ visits/mo',
      btnPrimary: 'View Town Landing Page →',
      btnSecondary: '📍 18 Towns',
    },
  },
  {
    n: '02',
    title: 'Qualify',
    badge: '📋 2,400 sqft · 3 Photos Attached',
    badgeTone: 'yellow',
    body: 'Smart intake asks trade-specific questions and collects project photos upfront.',
    headline: 'Turn vague emails into complete, photo-verified job tickets.',
    oldWay: 'Dead-end "Contact Us" message · 0 photos · 0 scope · $0 budget context',
    newWay: 'Interactive scope selector · 3 Photos attached · Verified sqft dimensions',
    bullets: [
      'Trade-specific questionnaires collect square footage, materials & pitch',
      'Homeowners snap and upload high-res job photos directly from mobile',
      'Replaces blind phone tag with actionable, ready-to-quote job tickets',
    ],
    mockup: {
      tag: '✦ Direct-to-Quote',
      service: '🏠 Full Roof Replacement (Architectural)',
      status: '● Ready to Quote',
      chips: ['📐 2,400 sq ft', '📸 3 Photos Attached', '📍 Fairview, NJ (Zone A)'],
      label: 'Material & Pitch:',
      highlight: '30-Yr GAF Timberline HDZ · 6/12 Pitch',
      btnPrimary: '⚡ 1-Click Quote',
      btnSecondary: '📸 View Photos (3)',
    },
  },
  {
    n: '03',
    title: 'Estimate',
    badge: '💰 Instant Range: $9.4k–$13.2k',
    badgeTone: 'mint',
    body: 'Homeowners see an instant ballpark price range while interest and urgency peak.',
    headline: 'Lock in homeowner commitment with instant ballpark pricing.',
    oldWay: '"We\'ll call you in 48 hours" · Homeowner leaves and books a competitor',
    newWay: 'Instant $9.4k–$13.2k ballpark · 45s confirmation · Pre-qualified budget',
    bullets: [
      'Automated ballpark price brackets calculated using your trade formulas',
      'Homeowners confirm budget alignment before you spend time driving on-site',
      'You retain 100% pricing control and final quote approval from your phone',
    ],
    mockup: {
      tag: '✦ Smart Pricing',
      service: '💰 Instant Estimated Price Bracket',
      status: '● Homeowner Confirmed',
      chips: ['Range: $9,400 – $13,200', '45s Budget Alignment', 'Tear-off Included'],
      label: 'Calculated Ballpark:',
      highlight: '$9,400 – $13,200',
      btnPrimary: '⚡ 1-Click Proposal',
      btnSecondary: 'Adjust Margin (20%)',
    },
  },
  {
    n: '04',
    title: 'Win the job',
    badge: '⚡ 1-Click Proposal & SMS',
    badgeTone: 'orange',
    body: 'Quote, schedule, text, and collect deposit payment from one connected record.',
    headline: 'Send proposals in 1 tap, collect Stripe deposits, and auto-book crews.',
    oldWay: 'Paper quotes · Mailed checks · Copying notes across 4 separate apps',
    newWay: '1-Tap SMS quote · Instant $2,500 Stripe deposit · Auto-synced dispatch',
    bullets: [
      'Send professional SMS proposals directly from your couch in seconds',
      'Homeowners approve and pay deposit via Apple Pay / credit card',
      'Automatically syncs to your dispatch calendar, SMS thread & QuickBooks',
    ],
    mockup: {
      tag: '✦ Win & Dispatch',
      service: '💳 $2,500.00 Deposit Received',
      status: '● Paid via Stripe',
      chips: ['📅 Tuesday 8:00 AM Crew A', '⚡ QuickBooks Synced', '📱 SMS Link Sent'],
      label: 'Deposit Status:',
      highlight: '$2,500.00 Received (Tuesday 8 AM Booked)',
      btnPrimary: '📅 View in Calendar',
      btnSecondary: '💬 Text Customer',
    },
  },
];

const FAQ_ITEMS = [
  {
    q: 'How much do I need to have ready?',
    a: 'Your business name is enough to begin. Choose your trade and service area, then review everything we generate before publishing.',
  },
  {
    q: 'Can I change the generated content?',
    a: 'Yes. You can edit every service, page, FAQ, service area, color and visual detail before publishing and at any time afterward.',
  },
  {
    q: 'Do I need to own a domain already?',
    a: 'No. Publish immediately on the included letsgetquoted.com subdomain, then connect a domain you own whenever you are ready.',
  },
  {
    q: 'What happens when somebody requests an estimate?',
    a: 'The job description, intake answers, location, photos and estimate range arrive together in your inbox and dashboard—ready for you to quote, schedule or text.',
  },
  {
    q: 'What kind of video can I add?',
    a: 'Upload an MP4 or MOV, or add a YouTube link. Choose from six layouts, including hero backgrounds, project stories and vertical-video reels.',
  },
  {
    q: 'What does it cost?',
    a: `The website builder is included on every base plan. ${PUBLIC_PRICING_SUMMARY} Stripe costs are separate.`,
  },
];

export default function WebsiteBuilderExperience() {
  const [activeStep, setActiveStep] = useState<number>(0);

  return (
    <div className={styles.wrapper}>
      <div className={styles.siteShell}>
        {/* Ambient atmospheric backdrop glows */}
        <div className={`${styles.ambient} ${styles.ambientOne}`} aria-hidden="true" />
        <div className={`${styles.ambient} ${styles.ambientTwo}`} aria-hidden="true" />
        <div className={`${styles.ambient} ${styles.ambientThree}`} aria-hidden="true" />

        {/* -------------------------------------------------------------
            HERO SECTION
            ------------------------------------------------------------- */}
        <div className={styles.container}>
          <section className={styles.hero} aria-labelledby="hero-title">
            <div className={styles.heroContent}>
              <div className={styles.eyebrowChip}>
                <span>✦</span> AI Website Builder Built Specifically for Contractors
              </div>

              <h1 id="hero-title" className={styles.heroTitle}>
                A contractor website that turns visits into <em>ready-to-quote jobs.</em>
              </h1>

              <p className={styles.heroLede}>
                Launch a complete, editable contractor site in minutes—built for your trade, with an instant estimate form wired in from day one. Your domain stays yours.
              </p>

              <div className={styles.heroChipsRow}>
                <div className={styles.heroChip}>
                  <span className={styles.heroChipCheck}>✓</span> Instant Intake &amp; Estimator
                </div>
                <div className={styles.heroChip}>
                  <span className={styles.heroChipCheck}>✓</span> 8 Pro Theme Archetypes
                </div>
                <div className={styles.heroChip}>
                  <span className={styles.heroChipCheck}>✓</span> Custom Domain Connection
                </div>
                <div className={styles.heroChip}>
                  <span className={styles.heroChipCheck}>✓</span> 6 Built-in Video Layouts
                </div>
              </div>

              <div className={styles.heroActions}>
                <a href={HERO_SIGNUP_URL} className={styles.btnPrimary}>
                  Build My Free Site <span>&rarr;</span>
                </a>
                <a href="#video-studio" className={styles.btnSecondary}>
                  Explore Video Studio &darr;
                </a>
              </div>

              <div className={styles.heroGuarantee}>
                <span /> Free subdomain &amp; hosting included &middot; No monthly subscription on Flex
              </div>
            </div>

            {/* Live Theme Cycler Window Frame */}
            <div className={styles.heroCyclerWrapper}>
              <HeroThemeCycler />
            </div>
          </section>
        </div>

        {/* -------------------------------------------------------------
            BUILT-IN VIDEO STUDIO: 6 VIDEO LAYOUTS
            ------------------------------------------------------------- */}
        <section id="video-studio" className={styles.sectionBlock} aria-labelledby="video-studio-title">
          <div className={styles.container}>
            <WebsiteMediaStudioShowcase />
          </div>
        </section>

        {/* -------------------------------------------------------------
            PROOF METRICS STRIP
            ------------------------------------------------------------- */}
        <div className={styles.container}>
          <div className={styles.proofStrip} aria-label="Key Builder Proof Metrics">
            {PROOF_METRICS.map((metric, idx) => (
              <div key={idx} className={styles.proofCard}>
                <span className={styles.proofNumber}>{metric.number}</span>
                <h2 className={styles.proofTitle}>{metric.title}</h2>
                <p className={styles.proofDesc}>{metric.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* -------------------------------------------------------------
            CONNECTED WORKFLOW SECTION (4 STAGES)
            ------------------------------------------------------------- */}
        <section className={`${styles.sectionBlock} ${styles.journeySection}`} aria-labelledby="journey-title">
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <div className={styles.sectionEyebrow}>
                <span>✦</span> The Connected Contractor Engine
              </div>
              <h2 id="journey-title" className={styles.sectionTitle}>
                Other builders end at a contact form. <em>This one hands you a job you can quote from your couch.</em>
              </h2>
              <p className={styles.sectionSubtitle}>
                Turn website visitors into pre-qualified, priced, and ready-to-close jobs without playing phone tag.
              </p>
            </div>

            {/* Linear-Style Unified Interactive Stage (Zero Sprawl) */}
            {(() => {
              const currentStep = JOURNEY_STEPS[activeStep] || JOURNEY_STEPS[0];
              const toneClass =
                currentStep.badgeTone === 'blue'
                  ? styles.microBadgeBlue
                  : currentStep.badgeTone === 'yellow'
                  ? styles.microBadgeYellow
                  : currentStep.badgeTone === 'mint'
                  ? styles.microBadgeMint
                  : styles.microBadgeOrange;

              return (
                <div className={styles.linearStageContainer}>
                  <div className={styles.linearStageGlow} aria-hidden="true" />

                  {/* Top 4-Step Connected Progress Stepper Track */}
                  <div className={styles.linearStepperTrack} role="tablist" aria-label="Journey Stages">
                    {JOURNEY_STEPS.map((step, idx) => {
                      const isSelected = activeStep === idx;
                      return (
                        <button
                          key={step.n}
                          type="button"
                          className={`${styles.linearStepBtn} ${isSelected ? styles.linearStepBtnActive : ''}`}
                          onClick={() => setActiveStep(idx)}
                          role="tab"
                          aria-selected={isSelected}
                          aria-label={`Step ${step.n}: ${step.title}`}
                        >
                          <div className={styles.stepHeaderRow} style={{ marginBottom: 2, width: '100%' }}>
                            <span className={styles.linearStepNumber}>{step.n}</span>
                            <span className={styles.linearStepTitle}>{step.title}</span>
                          </div>
                          <span className={styles.linearStepBadge}>{step.badge}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* 2-Column Stage Body */}
                  <div className={styles.linearStageBody}>
                    {/* Left Column: Story & Contrast */}
                    <div className={styles.linearStoryCol}>
                      <div className={styles.linearEyebrowRow}>
                        <span className={`${styles.microBadge} ${toneClass}`}>{currentStep.badge}</span>
                      </div>

                      <h3 className={styles.linearHeadline}>{currentStep.headline}</h3>

                      <ul className={styles.linearBulletsList}>
                        {currentStep.bullets.map((bullet, bIdx) => (
                          <li key={bIdx}>
                            <span className={styles.linearCheckIcon}>✓</span>
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>

                      {/* Compact Contrast Box */}
                      <div className={styles.linearContrastBox}>
                        <div className={styles.linearContrastRowBad}>
                          <span>⚠️</span>
                          <span><strong>Old Way:</strong> {currentStep.oldWay}</span>
                        </div>
                        <div className={styles.linearContrastRowGood}>
                          <span>⚡</span>
                          <span><strong>With Let&rsquo;s Get Quoted:</strong> {currentStep.newWay}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right Column: High-Craft Interactive Mockup Card */}
                    <div className={styles.linearMockupCol}>
                      <div className={styles.linearMockupCard} key={activeStep}>
                        {'searchQuery' in currentStep.mockup && currentStep.mockup.searchQuery && (
                          <div className={styles.searchSnippet}>
                            <span>🔍</span>
                            <span>Google: <strong className={styles.searchQuery}>&ldquo;{currentStep.mockup.searchQuery}&rdquo;</strong></span>
                            <span className={styles.searchRank}>{'searchRank' in currentStep.mockup ? currentStep.mockup.searchRank : 'Map Pack #1'}</span>
                          </div>
                        )}

                        <div className={styles.ticketTopRow}>
                          <div className={styles.businessInfo}>
                            <span className={styles.ticketService}>{currentStep.mockup.service}</span>
                            {'serviceSub' in currentStep.mockup && currentStep.mockup.serviceSub && (
                              <span className={styles.businessSub}>{currentStep.mockup.serviceSub}</span>
                            )}
                          </div>
                          <span className={styles.ticketStatusPill}>
                            <span className={styles.liveBeacon} aria-hidden="true" />
                            {currentStep.mockup.status.replace(/^●\s*/, '')}
                          </span>
                        </div>

                        <div className={styles.ticketSpecsGrid}>
                          {currentStep.mockup.chips.map((chip, cIdx) => (
                            <div key={cIdx} className={styles.specChip}>{chip}</div>
                          ))}
                        </div>

                        <div className={styles.ticketEstimateRow}>
                          <span className={styles.ticketEstimateLabel}>{currentStep.mockup.label}</span>
                          <span className={styles.ticketEstimatePrice}>{currentStep.mockup.highlight}</span>
                        </div>

                        <div className={styles.ticketActionRow}>
                          <button type="button" className={styles.ticketBtnPrimary}>
                            {currentStep.mockup.btnPrimary}
                          </button>
                          <button type="button" className={styles.ticketBtnSecondary}>
                            {currentStep.mockup.btnSecondary}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Proof Strip */}
                  <div className={styles.linearProofStrip}>
                    <div className={styles.linearProofItem}>
                      <span className={styles.linearProofIcon}>⚡</span>
                      <div className={styles.linearProofText}>
                        <strong>3.8× Higher Conversion</strong>
                        <span>vs standard contact forms</span>
                      </div>
                    </div>
                    <div className={styles.linearProofDivider} />
                    <div className={styles.linearProofItem}>
                      <span className={styles.linearProofIcon}>⏱️</span>
                      <div className={styles.linearProofText}>
                        <strong>0 Hours Wasted</strong>
                        <span>chasing unqualified leads</span>
                      </div>
                    </div>
                    <div className={styles.linearProofDivider} />
                    <div className={styles.linearProofItem}>
                      <span className={styles.linearProofIcon}>📱</span>
                      <div className={styles.linearProofText}>
                        <strong>100% Phone Friendly</strong>
                        <span>quote &amp; close from your couch</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </section>

        {/* -------------------------------------------------------------
            COMPLETE WEBSITE CAPABILITY MATRIX
            ------------------------------------------------------------- */}
        <section className={styles.sectionBlock} aria-labelledby="matrix-title">
          <div className={styles.container}>
            <WebsiteCapabilityMatrix />
          </div>
        </section>

        {/* -------------------------------------------------------------
            PRACTICAL QUESTIONS FAQ ACCORDION
            ------------------------------------------------------------- */}
        <section className={styles.sectionBlock} aria-labelledby="faq-title">
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <div className={styles.sectionEyebrow}>
                <span>✦</span> Clear Answers
              </div>
              <h2 id="faq-title" className={styles.sectionTitle}>
                Everything you need to know about <em>launching your site.</em>
              </h2>
              <p className={styles.sectionSubtitle}>
                No complicated hosting setups, no design fees, and no lock-in.
              </p>
            </div>

            <div className={styles.faqGrid}>
              {FAQ_ITEMS.map((item, idx) => (
                <details key={idx} className={styles.faqItem}>
                  <summary className={styles.faqSummary}>
                    <span>{item.q}</span>
                    <span className={styles.faqIcon}>+</span>
                  </summary>
                  <div className={styles.faqAnswer}>{item.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------
            CLOSING HIGH-IMPACT CTA BANNER
            ------------------------------------------------------------- */}
        <div className={styles.container}>
          <div className={styles.closingCtaCard}>
            <h2 className={styles.ctaTitle}>
              Build your contractor website in 60 seconds. <em>Start getting real quote requests today.</em>
            </h2>
            <p className={styles.ctaSubtitle}>
              Join hundreds of electricians, plumbers, roofers, landscapers, and HVAC contractors who turned their online presence into an automated quoting machine.
            </p>

            <div className={styles.ctaButtons}>
              <a href={FOOTER_SIGNUP_URL} className={styles.btnPrimary} style={{ minHeight: 56, padding: '0 36px', fontSize: 17 }}>
                Build My Free Contractor Site <span>&rarr;</span>
              </a>
              <Link href="/demo/sites" className={styles.btnSecondary} style={{ minHeight: 56, padding: '0 28px', fontSize: 16 }}>
                Browse All 8 Design Archetypes
              </Link>
            </div>

            <div className={styles.ctaPillsRow}>
              <div className={styles.ctaPillItem}>
                <span>✓</span> Instant 60-Second Setup
              </div>
              <div className={styles.ctaPillItem}>
                <span>✓</span> Free Hosting &amp; Subdomain
              </div>
              <div className={styles.ctaPillItem}>
                <span>✓</span> No Credit Card Required
              </div>
              <div className={styles.ctaPillItem}>
                <span>✓</span> 100% Mobile Optimized
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
