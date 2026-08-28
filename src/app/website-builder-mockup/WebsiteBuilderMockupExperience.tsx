'use client';

import Link from 'next/link';
import WebsiteMediaStudioShowcase from '@/components/marketing/WebsiteMediaStudioShowcase';
import WebsiteCapabilityMatrix from '@/components/marketing/WebsiteCapabilityMatrix';
import HeroThemeCyclerDark from './HeroThemeCyclerDark';
import styles from './website-builder-mockup.module.css';

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

export default function WebsiteBuilderMockupExperience() {
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
                <a href="#video-studio" className={styles.btnSecondary}>
                  Explore Video Studio ↓
                </a>
              </div>

              <div className={styles.heroGuarantee}>
                <span />
                Free on letsgetquoted.com subdomain · Connect your custom domain anytime
              </div>
            </div>

            {/* Right: Live Authentic Theme Cycler inside Dark Luxury Glass Frame */}
            <HeroThemeCyclerDark />
          </section>

          {/* =================================================================
              PROOF METRICS STRIP
              ================================================================= */}
          <section className={styles.proofStrip} aria-label="Key Platform Proof Points">
            <div className={styles.proofCard}>
              <div className={styles.proofNumber}>60s</div>
              <div className={styles.proofLabel}>Instant Generation</div>
              <div className={styles.proofDetail}>Ready to review and publish in one sitting</div>
            </div>

            <div className={styles.proofCard}>
              <div className={styles.proofNumber}>18+</div>
              <div className={styles.proofLabel}>Contractor Trades</div>
              <div className={styles.proofDetail}>Pre-built service packages &amp; trade intake formulas</div>
            </div>

            <div className={styles.proofCard}>
              <div className={styles.proofNumber}>$0/mo</div>
              <div className={styles.proofLabel}>Flex Plan Hosting</div>
              <div className={styles.proofDetail}>Website builder &amp; domain hosting included free</div>
            </div>

            <div className={styles.proofCard}>
              <div className={styles.proofNumber}>100%</div>
              <div className={styles.proofLabel}>Editable &amp; Owned</div>
              <div className={styles.proofDetail}>Your domain, your brand, your customer data</div>
            </div>
          </section>

          {/* =================================================================
              CONNECTED CUSTOMER JOURNEY (5 STAGES)
              ================================================================= */}
          <section className={`${styles.sectionBlock} ${styles.journeySection}`} aria-labelledby="journey-heading">
            <div className={styles.sectionHead}>
              <div className={styles.sectionEyebrow}>
                <span>✦</span> The Connected Contractor Engine
              </div>
              <h2 id="journey-heading" className={styles.sectionTitle}>
                More than a static website. <em>A complete intake pipeline.</em>
              </h2>
              <p className={styles.sectionSubtitle}>
                Generic website builders give you an empty contact form. Let’s Get Quoted turns
                every visitor into a structured, quote-ready job record with trade specifics.
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
              MEDIA STUDIO SHOWCASE (6 VIDEO LAYOUTS)
              ================================================================= */}
          <section id="video-studio" className={styles.sectionBlock} aria-labelledby="video-heading">
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
