import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import SiteFooter from '@/components/site-footer';
import StickyCta from '@/components/sticky-cta';
import {
  APP_SIGNUP_URL,
  CtaLink,
  MARKETING_MAIN_ID,
  MARKETING_PAGE_CLASS,
  MarketingCta,
  MarketingHeader,
} from '@/components/marketing';
import { FEE_TIERS } from '@/lib/pricing';
import styles from './founder.module.css';

export const metadata: Metadata = {
  title: 'Founder story',
  description:
    'Why Let’s Get Quoted is building a better website and connected back office for contractors.',
  alternates: { canonical: 'https://letsgetquoted.com/founder' },
};

/* The one number on the page, read from the canonical fee model rather than
   typed in, so it cannot drift from /pricing or the calculator. */
const LOWEST_RATE = FEE_TIERS[0].rate;

/* Prose with apostrophes and quote marks lives in constants rather than inline
   JSX text: it keeps the curly punctuation intact without scattering entities
   through the markup, and it keeps the copy in one readable block. */

const LEDE =
  'I kept seeing talented contractors held back by terrible websites, generic lead forms and a back office split across too many tools. Let’s Get Quoted is my attempt to fix the whole chain—not just redesign the front page.';

const MANIFESTO_QUOTE =
  '“A contractor starting with one truck should be able to look professional, respond intelligently and run the work with the same confidence as a much larger company.”';

const PLEDGES = [
  'Beautiful enough to build trust',
  'Useful enough to run the job',
  'Accessible before the business is big',
];

/* Four beats, in order, which is why they are an <ol> below. */
const CHAPTERS: { title: string; body: ReactNode }[] = [
  {
    title: 'The problem',
    body: 'Too many great tradespeople have no website, an outdated website or a good-looking site that still delivers vague, low-context leads.',
  },
  {
    // The draft's sentence, kept word for word — "understand location" is the
    // distance-aware phrasing that is actually true of the intake scorer, and
    // nothing in it promises a location-triggered alert. The second sentence is
    // added, not substituted.
    title: 'The realization',
    body: 'If the website can ask smarter questions, it can set price expectations, find urgency, understand location and give the contractor a better first call. A website does not have to be a phone-number collector—it can qualify the opportunity before anyone picks up.',
  },
  {
    title: 'The bigger opportunity',
    body: 'Once that context exists, it should not disappear. It should follow the job into the quote, schedule, texts, client portal, crew handoff and payment.',
  },
  {
    title: 'The promise',
    body: 'Build the complete product for the contractor starting today and the established operator growing toward the next crew—without a monthly subscription standing in the way.',
  },
];

/* A set, not a sequence, which is why these are a <ul>. The fourth is the one
   the draft left out, and it is the principle the other three depend on: a
   product that is beautiful, connected and cheap to start is worth nothing to a
   one-truck business if the one-truck version is the hollow one. */
const PRINCIPLES: { title: string; body: string }[] = [
  {
    title: 'Design earns trust.',
    body: 'The site and customer experience should make a small business feel established without pretending to be something it is not.',
  },
  {
    title: 'Context should travel.',
    body: 'Details gathered once should keep helping the owner, office, crew and homeowner throughout the job.',
  },
  {
    title: 'Software should earn its keep.',
    body: 'The business should not carry another monthly bill before the product helps money move.',
  },
  {
    title: 'Small contractors should not receive a stripped-down product.',
    body: 'The one-truck business gets the same quoting, scheduling, payments, client portal and follow-up as the operator running four crews. I am not building a smaller version of the product for the people who can least afford the gaps in it.',
  },
];

export default function FounderPage() {
  return (
    <>
      {/* AppShell renders no chrome for this route (OWN_CHROME_MARKETING_ROUTES),
          so the page draws the shared marketing header itself. */}
      <MarketingHeader />

      <main className={MARKETING_PAGE_CLASS} id={MARKETING_MAIN_ID}>
        <div className="ambient-glow ambient-glow-a" aria-hidden="true" />
        <div className="ambient-glow ambient-glow-b" aria-hidden="true" />

        <div className="marketing-shell">
          <section className="hero-grid" aria-labelledby="founder-title">
            <div className="hero-copy">
              <p className="eyebrow">A note from the founder</p>
              <h1 id="founder-title" className={styles.title}>
                Contractors deserve software that makes the business look{' '}
                <em>as good as the work.</em>
              </h1>
              <p className={styles.lede}>{LEDE}</p>

              <div className="actions">
                <CtaLink spec={{ label: 'Build my free site' }} className="btn primary" arrow />
                <CtaLink
                  spec={{ label: 'See what it runs', href: '/features' }}
                  className="btn secondary"
                />
              </div>

              <div className={styles.signature}>
                {/* A monogram, not a portrait. There is no photograph on this page
                    and no biography behind it — the page says what is being built
                    and why, and nothing about the person that the copy does not
                    already say out loud. */}
                <span className={styles.monogram} aria-hidden="true">
                  B
                </span>
                <span>
                  <span className={styles.signatureName}>Brett</span>
                  <span className={styles.signatureRole}>Founder · Let’s Get Quoted</span>
                </span>
              </div>
            </div>

            <aside className={`panel ${styles.manifesto}`} aria-label="Why I’m building this">
              <p className="eyebrow">Why I’m building this</p>
              <blockquote className={styles.quote}>{MANIFESTO_QUOTE}</blockquote>
              <ul className={styles.pledges}>
                {PLEDGES.map((pledge, index) => (
                  <li key={pledge} className={styles.pledge}>
                    <span className={styles.pledgeNum} aria-hidden="true">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span>{pledge}</span>
                  </li>
                ))}
              </ul>
            </aside>
          </section>

          <section className="section-block" aria-labelledby="founder-story-title">
            <div className={styles.sectionHead}>
              <p className="eyebrow">The idea behind the product</p>
              <h2 id="founder-story-title">The website should start the back office.</h2>
            </div>
            <ol className={styles.cards}>
              {CHAPTERS.map((chapter, index) => (
                <li key={chapter.title} className={styles.card}>
                  {/* The numeral is visual rhythm, not information — the list
                      element already carries the order. */}
                  <span className={styles.cardNum} aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 className={styles.cardTitle}>{chapter.title}</h3>
                  <p className={styles.cardBody}>{chapter.body}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="section-block" aria-labelledby="founder-principles-title">
            <div className={styles.sectionHead}>
              <p className="eyebrow">What guides the build</p>
              <h2 id="founder-principles-title">Beautiful. Practical. Aligned with the contractor.</h2>
            </div>
            <ul className={styles.cards}>
              {PRINCIPLES.map((principle, index) => (
                <li key={principle.title} className={styles.card}>
                  <span className={styles.cardNum} aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 className={styles.cardTitle}>{principle.title}</h3>
                  <p className={styles.cardBody}>{principle.body}</p>
                </li>
              ))}
            </ul>
          </section>

          <MarketingCta
            kicker="The next chapter is your business"
            title="Build something customers trust—and a system your team can run."
            note={`No card required and no monthly subscription. The platform fee is ${LOWEST_RATE} of what a homeowner pays you, falling as your volume grows, and applies only when they actually pay.`}
          />

          <SiteFooter />
        </div>

        <StickyCta href={APP_SIGNUP_URL} label="Build my free site" />
      </main>
    </>
  );
}
