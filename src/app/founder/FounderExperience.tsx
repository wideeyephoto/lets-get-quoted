'use client';

import { useState } from 'react';
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

const SPRAWL_TOOLS = [
  {
    id: 'hosting',
    name: 'Website Hosting & WordPress Maintenance',
    cost: 50,
    icon: '🌐',
    sub: 'Hosting servers, domain renewals, SSL & security plugins',
  },
  {
    id: 'crm',
    name: 'Standalone Quoting & CRM (Jobber / Housecall Pro)',
    cost: 149,
    icon: '📋',
    sub: 'Basic 1-to-2 user tier with restricted custom fields',
  },
  {
    id: 'scheduling',
    name: 'Scheduling & Dispatch App (Calendly / Acuity)',
    cost: 79,
    icon: '📅',
    sub: 'Online booking slots & team calendar synchronization',
  },
  {
    id: 'intake',
    name: 'Third-Party Form & Photo Intake (Typeform / Wufoo)',
    cost: 35,
    icon: '📸',
    sub: 'Custom photo uploads & multi-step questionnaires',
  },
  {
    id: 'sms',
    name: 'Client Texting Service (Twilio / Textline)',
    cost: 40,
    icon: '💬',
    sub: 'Carrier-registered 10DLC messaging software',
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
    body: 'Information captured once from the homeowner must flow seamlessly to the truck, crew dispatch, and final invoice without double-entry.',
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
  const [selectedTools, setSelectedTools] = useState<string[]>([
    'hosting',
    'crm',
    'scheduling',
    'intake',
    'sms',
  ]);

  const toggleTool = (id: string) => {
    setSelectedTools((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const selectAllTools = () => {
    setSelectedTools(SPRAWL_TOOLS.map((t) => t.id));
  };

  const clearAllTools = () => {
    setSelectedTools([]);
  };

  const totalMonthlyTax = SPRAWL_TOOLS.filter((t) =>
    selectedTools.includes(t.id)
  ).reduce((sum, t) => sum + t.cost, 0);

  const totalAnnualTax = totalMonthlyTax * 12;
  const activeCount = selectedTools.length;

  return (
    <main className={`${MARKETING_PAGE_CLASS} ${styles.page}`} id={MARKETING_MAIN_ID}>
      <div className="ambient-glow ambient-glow-a" aria-hidden="true" />
      <div className="ambient-glow ambient-glow-b" aria-hidden="true" />

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

          {/* Interactive Tool-Sprawl Cost Calculator */}
          <div className={styles.sprawlCalcContainer} aria-label="Interactive Tool-Sprawl Cost Calculator">
            <div className={styles.sprawlCalcHeader}>
              <div className={styles.sprawlHeaderLeft}>
                <p className={styles.sprawlHeaderKicker}>💸 THE 5-APP SUBSCRIPTION TAX</p>
                <h3 className={styles.sprawlHeaderTitle}>Interactive Tool-Sprawl Cost Calculator</h3>
                <p className={styles.sprawlHeaderSub}>
                  Select the standalone tools your contracting business currently juggles to see what fragmented software actually costs you:
                </p>
              </div>
              <div className={styles.sprawlQuickToggle}>
                <button type="button" onClick={selectAllTools} className={styles.sprawlToggleBtn}>
                  Select All
                </button>
                <button type="button" onClick={clearAllTools} className={styles.sprawlToggleBtn}>
                  Clear All
                </button>
              </div>
            </div>

            <div className={styles.sprawlGrid}>
              {/* Left Column: Tool Checklist */}
              <div className={styles.sprawlToolList} role="group" aria-label="Tools checklist">
                {SPRAWL_TOOLS.map((tool) => {
                  const isSelected = selectedTools.includes(tool.id);
                  return (
                    <div
                      key={tool.id}
                      onClick={() => toggleTool(tool.id)}
                      className={`${styles.sprawlToolItem} ${isSelected ? styles.sprawlToolItemSelected : ''}`}
                      role="checkbox"
                      aria-checked={isSelected}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          toggleTool(tool.id);
                        }
                      }}
                    >
                      <div className={`${styles.sprawlCheckbox} ${isSelected ? styles.sprawlCheckboxChecked : ''}`}>
                        {isSelected ? '✓' : ''}
                      </div>
                      <span className={styles.sprawlToolIcon} aria-hidden="true">
                        {tool.icon}
                      </span>
                      <div className={styles.sprawlToolInfo}>
                        <span className={styles.sprawlToolName}>{tool.name}</span>
                        <span className={styles.sprawlToolSub}>{tool.sub}</span>
                      </div>
                      <span className={styles.sprawlToolCost}>~${tool.cost}/mo</span>
                    </div>
                  );
                })}
              </div>

              {/* Right Column: Live Calculated Results & LGQ Contrast */}
              <div className={styles.sprawlResultsCard}>
                <div>
                  <div className={styles.sprawlResultsTop}>
                    <span className={styles.sprawlResultsTag}>
                      {activeCount > 0 ? `${activeCount} SEPARATE APPS SELECTED` : 'NO APPS SELECTED'}
                    </span>
                    <span style={{ color: '#8b9caa', fontFamily: 'monospace', fontSize: '11px' }}>
                      MONTHLY SOFTWARE BILL
                    </span>
                  </div>

                  <div className={styles.sprawlTotalRow}>
                    <span className={styles.sprawlTotalLabel}>Total Monthly Subscription Tax</span>
                    <div className={styles.sprawlBigPrice}>
                      ${totalMonthlyTax}<small>/month</small>
                    </div>
                    <span className={styles.sprawlAnnualPill}>
                      ${totalAnnualTax.toLocaleString()}/year in software bills
                    </span>
                  </div>

                  <div className={styles.sprawlRetypeBox}>
                    ⚠️ <strong>The Hidden Retype Penalty:</strong>{' '}
                    {activeCount > 0 ? (
                      <>
                        You’re paying <strong>${totalMonthlyTax}/mo (${totalAnnualTax.toLocaleString()}/yr)</strong> to retype the same job details 4 times across disconnected tools.
                      </>
                    ) : (
                      <>Check the tools you use on the left to calculate your wasted software spend.</>
                    )}
                  </div>
                </div>

                <div className={styles.sprawlContrastLgq}>
                  <div className={styles.sprawlContrastHead}>
                    <span className={styles.sprawlContrastLabel}>LET&apos;S GET QUOTED</span>
                    <div className={styles.sprawlZeroNumber}>
                      $0<small>/month base</small>
                    </div>
                  </div>

                  <ul className={styles.sprawlBenefitList}>
                    <li className={styles.sprawlBenefitItem}>
                      <i aria-hidden="true">✓</i>
                      <span>Replaces all {activeCount > 0 ? activeCount : 5} tools in one connected system</span>
                    </li>
                    <li className={styles.sprawlBenefitItem}>
                      <i aria-hidden="true">✓</i>
                      <span>
                        Save <strong>${totalAnnualTax.toLocaleString()}/yr</strong> with $0 monthly base pricing
                      </span>
                    </li>
                    <li className={styles.sprawlBenefitItem}>
                      <i aria-hidden="true">✓</i>
                      <span>Zero retyping · Homeowner request carries straight to payout</span>
                    </li>
                  </ul>

                  <a
                    href={APP_SIGNUP_URL}
                    className={styles.sprawlCtaBtn}
                  >
                    Replace all {activeCount > 0 ? activeCount : 5} with $0/mo Flex Account →
                  </a>
                </div>
              </div>
            </div>
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
