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
    body: 'Service and local town pages built around the exact trade and services you sell in your area.',
  },
  {
    n: '02',
    title: 'Qualify',
    body: 'Smart Intake asks the follow-up questions your trade needs before booking or quoting.',
  },
  {
    n: '03',
    title: 'Estimate',
    body: 'Give the homeowner a useful instant price range while interest and urgency are highest.',
  },
  {
    n: '04',
    title: 'Win the job',
    body: 'Quote, schedule, text, and collect deposit payment from the exact same connected job record.',
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
                Other builders end at a contact form. <em>This one hands you a job you can quote.</em>
              </h2>
              <p className={styles.sectionSubtitle}>
                A standard template sits isolated from your business. Let&rsquo;s Get Quoted connects your website directly to your estimate ranges, dispatch schedule, client texting, and payment processing.
              </p>
            </div>

            <div className={styles.journeyPipeline}>
              {JOURNEY_STEPS.map((step) => (
                <div key={step.n} className={styles.journeyStepCard}>
                  <div className={styles.stepNumber}>{step.n}</div>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <p className={styles.stepBody}>{step.body}</p>
                </div>
              ))}
            </div>

            <div className={styles.compareRow}>
              <div className={styles.compareBad}>
                <span className={styles.compareTagBad}>Generic Website Builders</span>
                <h4 className={styles.compareTitleBad}>Dead-end &ldquo;Contact Us&rdquo; Forms</h4>
                <p className={styles.compareDescBad}>
                  You get an unvetted email with no project scope, no photos, no budget expectations, and no connection to your schedule or invoicing.
                </p>
              </div>

              <div className={styles.compareArrow}>&rarr;</div>

              <div className={styles.compareGood}>
                <span className={styles.compareTagGood}>Let&rsquo;s Get Quoted AI Builder</span>
                <h4 className={styles.compareTitleGood}>Direct-to-Quote Job Intake</h4>
                <p className={styles.compareDescGood}>
                  Homeowners complete trade-specific intake questions, view an instant price bracket, and land in your system ready for instant proposal and e-signature.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------
            TWO-PANEL VERIFICATION: DOMAIN + FIRST LEAD INTAKE
            ------------------------------------------------------------- */}
        <section className={styles.sectionBlock} aria-labelledby="verification-title">
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <div className={styles.sectionEyebrow}>
                <span>✦</span> Instant Publishing &amp; Live Intake
              </div>
              <h2 id="verification-title" className={styles.sectionTitle}>
                Connect your domain. <em>Watch real estimate requests arrive.</em>
              </h2>
              <p className={styles.sectionSubtitle}>
                Point your existing domain in 60 seconds or use your free included subdomain. Every intake submission arrives organized with trade specs and estimated pricing.
              </p>
            </div>

            <div className={styles.publishGrid}>
              {/* Panel 1: Domain Setup */}
              <div className={styles.panelGlassCard}>
                <div className={styles.panelHeader}>
                  <div className={styles.panelTitle}>
                    <span>🌐</span> Custom Domain &amp; SSL Routing
                  </div>
                  <span className={styles.statusPillLive}>● Connected &amp; Secure</span>
                </div>

                <p style={{ fontSize: '0.88rem', color: '#94a3b8', margin: '0 0 16px', lineHeight: 1.5 }}>
                  Add your custom CNAME record to point your domain. We handle automatic SSL certificate renewal and edge caching worldwide.
                </p>

                <div className={styles.dnsTargetBox}>
                  <span>CNAME Record Target</span>
                  <strong>domains.letsgetquoted.com</strong>
                </div>

                <ul className={styles.addrList}>
                  <li className={styles.addrItem}>
                    <span className={styles.addrDomain}>cedarcreekroofing.com</span>
                    <span className={styles.addrStatus}>Primary Domain (Live)</span>
                  </li>
                  <li className={styles.addrItem}>
                    <span className={styles.addrDomain}>cedarcreekroofing.letsgetquoted.com</span>
                    <span className={styles.addrStatus}>Included Subdomain</span>
                  </li>
                </ul>

                <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0 }}>
                  Need help? DNS instructions for GoDaddy, Namecheap, Google Domains, and Cloudflare are generated automatically.
                </p>
              </div>

              {/* Panel 2: Live Intake Landing */}
              <div className={styles.panelGlassCard}>
                <div className={styles.panelHeader}>
                  <div className={styles.panelTitle}>
                    <span>📥</span> New Job Request from Website
                  </div>
                  <span className={styles.statusPillUnread}>New Lead &middot; 4m ago</span>
                </div>

                <div className={styles.requestQuoteText}>
                  &ldquo;Need architectural shingles replaced after recent wind damage. 2,400 sq ft two-story home in Fairview.&rdquo;
                </div>

                <div className={styles.requestDataGrid}>
                  <span className={styles.dataLabel}>Customer</span>
                  <span className={styles.dataValue}>David &amp; Sarah Miller</span>

                  <span className={styles.dataLabel}>Location</span>
                  <span className={styles.dataValue}>Fairview, Northgate (Zone A)</span>

                  <span className={styles.dataLabel}>Selected Service</span>
                  <span className={styles.dataValue}>Full Roof Replacement (Architectural)</span>

                  <span className={styles.dataLabel}>Calculated Estimate</span>
                  <span className={styles.dataMoney}>$9,400 &ndash; $13,200</span>
                </div>

                <div className={styles.btnActionRow}>
                  <button type="button" className={`${styles.btnSmall} ${styles.btnSmallPrimary}`}>
                    Generate Quote &rarr;
                  </button>
                  <button type="button" className={styles.btnSmall}>
                    Schedule On-Site Inspection
                  </button>
                  <button type="button" className={styles.btnSmall}>
                    Send Text
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------
            BUILT-IN VIDEO STUDIO: 6 VIDEO LAYOUTS
            ------------------------------------------------------------- */}
        <section id="video-studio" className={styles.sectionBlock} aria-labelledby="video-studio-title">
          <div className={styles.container}>
            <WebsiteMediaStudioShowcase />
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
