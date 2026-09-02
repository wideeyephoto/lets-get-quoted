'use client';

import Link from 'next/link';
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
  },
  {
    n: '02',
    title: 'Qualify',
    badge: '📋 2,400 sqft · 3 Photos Attached',
    badgeTone: 'yellow',
    body: 'Smart intake asks trade-specific questions and collects project photos upfront.',
  },
  {
    n: '03',
    title: 'Estimate',
    badge: '💰 Instant Range: $9.4k–$13.2k',
    badgeTone: 'mint',
    body: 'Homeowners see an instant ballpark price range while interest and urgency peak.',
  },
  {
    n: '04',
    title: 'Win the job',
    badge: '⚡ 1-Click Proposal & SMS',
    badgeTone: 'orange',
    body: 'Quote, schedule, text, and collect deposit payment from one connected record.',
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
                <span>✦</span> AI Website Builder for Contractors
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

            <div className={styles.journeyPipeline}>
              {JOURNEY_STEPS.map((step) => {
                const toneClass =
                  step.badgeTone === 'blue'
                    ? styles.microBadgeBlue
                    : step.badgeTone === 'yellow'
                    ? styles.microBadgeYellow
                    : step.badgeTone === 'mint'
                    ? styles.microBadgeMint
                    : styles.microBadgeOrange;

                return (
                  <div key={step.n} className={styles.journeyStepCard}>
                    <div className={styles.stepHeaderRow}>
                      <div className={styles.stepNumber}>{step.n}</div>
                      <span className={`${styles.microBadge} ${toneClass}`}>{step.badge}</span>
                    </div>
                    <h3 className={styles.stepTitle}>{step.title}</h3>
                    <p className={styles.stepBody}>{step.body}</p>
                  </div>
                );
              })}
            </div>

            <div className={styles.compareRow}>
              <div className={styles.compareBad}>
                <span className={styles.compareTagBad}>Generic Website Builders</span>
                <h4 className={styles.compareTitleBad}>Dead-end &ldquo;Contact Us&rdquo; Forms</h4>
                <ul className={styles.compareListBad}>
                  <li>
                    <span className={styles.compareCross}>✕</span> Unvetted email with zero scope or specs
                  </li>
                  <li>
                    <span className={styles.compareCross}>✕</span> No photos, measurements, or budget context
                  </li>
                  <li>
                    <span className={styles.compareCross}>✕</span> Endless phone tag chasing lukewarm leads
                  </li>
                  <li>
                    <span className={styles.compareCross}>✕</span> Disconnected from schedule, texting &amp; invoices
                  </li>
                </ul>
              </div>

              <div className={styles.compareArrow}>&rarr;</div>

              <div className={styles.compareGood}>
                <span className={styles.compareTagGood}>Let&rsquo;s Get Quoted AI Builder</span>
                <h4 className={styles.compareTitleGood}>Direct-to-Quote Job Intake</h4>
                <ul className={styles.compareListGood}>
                  <li>
                    <span className={styles.compareCheck}>✓</span> Trade-specific intake questions with photo uploads
                  </li>
                  <li>
                    <span className={styles.compareCheck}>✓</span> Instant calculated price range bracket on the spot
                  </li>
                  <li>
                    <span className={styles.compareCheck}>✓</span> Pre-qualified scope ready for 1-click proposal
                  </li>
                  <li>
                    <span className={styles.compareCheck}>✓</span> Direct sync to dispatch calendar, SMS, &amp; Stripe
                  </li>
                </ul>
              </div>
            </div>
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
