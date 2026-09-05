'use client';

import Image from 'next/image';
import { APP_SIGNUP_URL, CtaLink } from '@/components/marketing/links';
import { MARKETING_MAIN_ID, MARKETING_PAGE_CLASS } from '@/components/marketing/marketing-page';
import MarketingCta from '@/components/marketing/marketing-cta';
import SiteFooter from '@/components/site-footer';
import StickyCta from '@/components/sticky-cta';
import styles from './founder.module.css';

/* ---- Data Constants ---- */

const HERO_POINTS = [
  'No credit card required',
  'Start at $0/month (Flex tier)',
  'One single connected product',
] as const;

const FOUNDER_BELIEFS = [
  { num: '01', title: 'Zero software tax', sub: 'Start free at $0/mo' },
  { num: '02', title: 'Single data record', sub: 'No retyping information' },
  { num: '03', title: 'Full feature access', sub: 'No crippled starter tier' },
  { num: '04', title: 'Direct founder line', sub: 'Real humans answer you' },
] as const;

const BROKEN_CARDS = [
  {
    num: '01',
    title: 'The website was a dead end.',
    body: 'A good-looking site that finishes with a generic contact form is just a brochure. It collects a name and a phone number, handing the contractor the same blank start every single time.',
  },
  {
    num: '02',
    title: 'The lead arrived with nothing in it.',
    body: 'No job scope, no jobsite photos, no address, no sense of urgency or budget. Every quote had to begin with an awkward 20-minute phone call to discover what the form should have captured.',
  },
  {
    num: '03',
    title: 'The back office was five tools.',
    body: 'Quoting in one app, scheduling in another, invoices somewhere else, QuickBooks disconnected, and the same job details typed into all of them. Nothing that gets typed twice stays correct.',
  },
] as const;

const PRINCIPLES = [
  {
    num: '01',
    title: 'Design earns trust.',
    body: 'The site and client experience should make a one-truck business feel established, reliable, and top-tier without pretending to be something it is not.',
  },
  {
    num: '02',
    title: 'Context must travel.',
    body: 'Information captured once from the homeowner must flow directly to the truck, crew dispatch, and final invoice without double-entry.',
  },
  {
    num: '03',
    title: 'Built for the field.',
    body: 'High-contrast controls, large tap targets, and streamlined workflows designed for dirty hands on a smartphone screen in bright sunlight.',
  },
  {
    num: '04',
    title: 'Zero enterprise bloat.',
    body: 'No 10-layer menus, no mandatory onboarding calls, and no complex features designed for middle managers instead of the trade.',
  },
] as const;

const PLEDGES = [
  { num: '01', text: 'Beautiful enough to build trust with high-value clients' },
  { num: '02', text: 'Useful enough to run the job from first click to final payout' },
  { num: '03', text: 'Accessible at $0 before the business has grown big' },
] as const;

export default function FounderExperience() {
  return (
    <main className={`${MARKETING_PAGE_CLASS} ${styles.page}`} id={MARKETING_MAIN_ID}>
      <div className={styles.ambientOne} aria-hidden="true" />
      <div className={styles.ambientTwo} aria-hidden="true" />
      <div className={styles.ambientThree} aria-hidden="true" />

      <div className="marketing-shell">
        {/* ========================================================================= */}
        {/* HERO LETTERHEAD SECTION                                                   */}
        {/* ========================================================================= */}
        <section className={styles.heroGrid} aria-labelledby="founder-title">
          {/* Left Column: Headline, Subtitle & Assurances */}
          <div className={styles.heroLeft}>
            <div className={styles.founderEyebrowRow}>
              <div className={styles.miniAvatarBadge}>
                <Image
                  src="/founder/brett-workshop.jpg"
                  alt="Brett"
                  width={84}
                  height={84}
                  className={styles.miniAvatarImg}
                  priority
                />
              </div>
              <p className="eyebrow" style={{ margin: 0 }}>
                <span className={styles.pulseDot} aria-hidden="true" />
                A NOTE FROM BRETT · FOUNDER &amp; BUILDER
              </p>
            </div>

            <h1 id="founder-title" className={styles.heroTitle}>
              Great craftsmanship shouldn’t lose jobs to mediocre competitors with a{' '}
              <em>better website and faster follow-up.</em>
            </h1>

            <p className={styles.heroLede}>
              I built Let’s Get Quoted so a one-truck contracting business can look—and run—like a much bigger company, with cleaner intake, faster quotes, and professional client communication from the first click.
            </p>

            <div className={styles.heroActions}>
              <CtaLink spec={{ label: 'Build my free site' }} className="btn primary" arrow />
              <a className={styles.storyLinkBtn} href="#story">
                Read the letter <span aria-hidden="true">↓</span>
              </a>
            </div>

            <ul className={styles.assurancesList} aria-label="Founder assurances">
              {HERO_POINTS.map((pt) => (
                <li key={pt} className={styles.assuranceItem}>
                  <span className={styles.assuranceTick} aria-hidden="true">✓</span>
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right Visual: Founder Portrait Card with Glassmorphic Elements */}
          <div className={styles.heroVisual}>
            <div className={styles.visualOrbitOne} aria-hidden="true" />
            <div className={styles.visualOrbitTwo} aria-hidden="true" />
            <div className={styles.portraitGlowBack} aria-hidden="true" />

            <div className={styles.portraitEnclosure}>
              <div className={styles.cornerBracketTopLeft} aria-hidden="true" />
              <div className={styles.cornerBracketBottomRight} aria-hidden="true" />

              <div className={styles.portraitTag}>
                <span className={styles.statusLiveDot} aria-hidden="true" />
                <span>BUILDER · FOUNDER</span>
              </div>

              <Image
                src="/founder/brett-workshop.jpg"
                alt="Brett, founder of Let's Get Quoted, working at a workshop workbench"
                width={1122}
                height={1402}
                className={styles.portraitImg}
                priority
              />

              <div className={styles.portraitOverlayCaption}>
                <span className={styles.portraitName}>Brett</span>
                <span className={styles.portraitSub}>FOUNDER · LET&apos;S GET QUOTED</span>
              </div>
            </div>

            {/* Floating Metric Toasts */}
            <div className={styles.floatingToast1} aria-hidden="true">
              <span className={styles.toastIconOrange}>⚡</span>
              <div className={styles.toastContent}>
                <span className={styles.toastKicker}>INSTANT LAUNCH</span>
                <span className={styles.toastValue}>Live Website in 5 Mins</span>
              </div>
            </div>

            <div className={styles.floatingToast2} aria-hidden="true">
              <span className={styles.toastIconMint}>100%</span>
              <div className={styles.toastContent}>
                <span className={styles.toastKicker}>FEATURE ACCESS</span>
                <span className={styles.toastValue}>Full Toolkit on Day 1</span>
              </div>
            </div>
          </div>
        </section>

        {/* Full-width Founder Commitments Banner */}
        <section className={styles.founderBeliefsStrip} aria-label="Founder core commitments">
          {FOUNDER_BELIEFS.map((b) => (
            <div key={b.num} className={styles.beliefCell}>
              <strong>{b.num}</strong>
              <span>
                {b.title}<br />
                <b>{b.sub}</b>
              </span>
            </div>
          ))}
        </section>

        {/* ========================================================================= */}
        {/* SECTION 1: WHERE IT STARTED & WHAT WAS BROKEN                             */}
        {/* ========================================================================= */}
        <section id="story" className={styles.sectionWrap} aria-labelledby="story-title">
          <div className={styles.sectionHeading}>
            <p className="eyebrow">01 · WHERE IT STARTED</p>
            <h2 id="story-title">Good contractors were losing work before the first phone call.</h2>
          </div>

          <div className={styles.originStoryGrid}>
            <div className={styles.originStoryText}>
              <p>
                I kept seeing talented, hard-working trade contractors finish an 11-hour day on the tools, only to spend their evenings typing addresses into invoices, texting photos back and forth, and chasing signatures.
              </p>
              <p>
                The breakdown wasn’t their craftsmanship. The breakdown was that traditional software companies sold them <strong>five separate apps that never spoke to each other</strong>: a generic brochure website, a standalone quoting app, an unintegrated calendar, a separate invoicing tool, and an accounting plugin.
              </p>
              <p>
                Let’s Get Quoted is my attempt to fix the entire chain—not just redesign the front page. I did not start with a website builder. I started with what happens on the jobsite after a homeowner requests a quote, and worked backwards until the front page and the back office became one continuous record.
              </p>
            </div>

            <div className={styles.originManifestoCard}>
              <div>
                <p className={styles.manifestoCardKicker}>THE BUILDER&apos;S APPROACH</p>
                <p className={styles.manifestoCardQuote}>
                  “I started with what happens after somebody fills out a request, and worked backwards until the <em>front page and the back office became one continuous pipeline.</em>”
                </p>
              </div>

              <div className={styles.manifestoCardFooter}>
                <Image
                  src="/founder/brett-workshop.jpg"
                  alt="Brett"
                  width={76}
                  height={76}
                  className={styles.manifestoAvatar}
                />
                <div className={styles.manifestoAuthorInfo}>
                  <strong>Brett</strong>
                  <span>FOUNDER · LET&apos;S GET QUOTED</span>
                </div>
              </div>
            </div>
          </div>

          {/* The 3 Core Frustrations */}
          <div className={styles.brokenGrid}>
            {BROKEN_CARDS.map((card) => (
              <article key={card.num} className={styles.brokenCard}>
                <span className={styles.brokenCardNum}>{card.num}</span>
                <h3 className={styles.brokenCardTitle}>{card.title}</h3>
                <p className={styles.brokenCardBody}>{card.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SECTION 2: FOUR PRINCIPLES FOR THE TRADE                                  */}
        {/* ========================================================================= */}
        <section id="principles" className={styles.sectionWrap} aria-labelledby="principles-title">
          <div className={styles.sectionHeading}>
            <p className="eyebrow">02 · WHO I AM BUILDING FOR</p>
            <h2 id="principles-title">The contractor who has not hired an office yet.</h2>
          </div>

          <blockquote className={styles.manifestoQuote}>
            “A contractor starting with one truck should be able to look professional, respond intelligently, and run the work with the exact same confidence as a much larger company.”
          </blockquote>

          <div className={styles.principlesGrid}>
            {PRINCIPLES.map((item) => (
              <article key={item.num} className={styles.principleCard}>
                <span className={styles.principleNum}>{item.num}</span>
                <h3 className={styles.principleTitle}>{item.title}</h3>
                <p className={styles.principleBody}>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SECTION 3: MY PROMISE & SIGNATURE                                         */}
        {/* ========================================================================= */}
        <section id="promise" className={styles.sectionWrap} aria-labelledby="promise-title">
          <div className={styles.sectionHeading}>
            <p className="eyebrow">03 · WHAT I AM HOLDING THIS PRODUCT TO</p>
            <h2 id="promise-title">My promise to every contractor who signs up.</h2>
            <p className={styles.sectionLede}>
              I will keep the free account complete rather than crippled, I will not add a monthly bill to a business that has not been paid yet, and I will never describe something as finished before it is.
            </p>
          </div>

          <div className={styles.promiseCard}>
            <p style={{ color: '#dbe7f3', fontSize: '17px', lineHeight: '1.6', margin: 0 }}>
              Software should not charge you when you have no work on the books. Our Flex model gives every contractor a <strong>$0 monthly base price</strong> with full quoting, scheduling, Stripe deposits, and client intake unlocked. We earn our keep when you get paid.
            </p>

            <ul className={styles.pledgeList} aria-label="Founder pledges">
              {PLEDGES.map((p) => (
                <li key={p.num} className={styles.pledgeBox}>
                  <span className={styles.pledgeBoxNum}>{p.num}</span>
                  <span className={styles.pledgeBoxText}>{p.text}</span>
                </li>
              ))}
            </ul>

            <div className={styles.directionNote}>
              <strong>Where this goes next:</strong> more of the thinking and less of the typing—intake that gets better at reading a job, and quotes that start themselves from what the homeowner already described. That is the direction I am building in. I would rather say when each piece lands than sell it in advance.
            </div>

            <div className={styles.signatureRow}>
              <div className={styles.founderSig}>
                <div className={styles.founderMonogram} aria-hidden="true">B</div>
                <div className={styles.founderSigText}>
                  <strong>Brett</strong>
                  <span>FOUNDER · LET’S GET QUOTED</span>
                </div>
              </div>

              <div className={styles.founderTagline}>
                <span className={styles.pulseDot} aria-hidden="true" />
                <span>BUILT FOR CONTRACTORS WHO BUILD THE REAL WORLD</span>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* CLOSING CTA SECTION                                                      */}
        {/* ========================================================================= */}
        <MarketingCta
          kicker="The next chapter is your business"
          title="Build something customers trust—and a system your team can run."
          note="No card required. Start free at $0/month."
        />

        <SiteFooter />
      </div>

      {/* Sticky Mobile/Desktop CTA Bar */}
      <StickyCta href={APP_SIGNUP_URL} label="Build my free site" />
    </main>
  );
}
