import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { TRADES } from '@/lib/trades';
import { COMMON_TRADE_SLUGS, tradesBySlugs } from '@/lib/trade-categories';
import { FEE_TIERS } from '@/lib/pricing';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import SiteFooter from '@/components/site-footer';
import TradeFinder from './TradeFinder';
import styles from './for.module.css';

export const metadata: Metadata = {
  /* `absolute`, because the root layout's title template appends "· Let's Get
     Quoted" to every page title — and this title already carries the brand, so
     without it the tab and the search result both read
     "… | Let's Get Quoted · Let's Get Quoted". */
  title: { absolute: 'Contractor Website & Quoting Software by Trade | Let’s Get Quoted' },
  description:
    'A website, a 24/7 AI Estimator, quotes, scheduling, and Stripe payments — tailored to your trade. Browse all 49 contractor trades Let’s Get Quoted is built for. Free to start, no monthly subscription.',
  alternates: { canonical: 'https://letsgetquoted.com/for' },
  /* Next replaces the parent's `openGraph` object wholesale rather than merging
     into it, so everything this card needs has to be here — including the image,
     which would otherwise be dropped, and `url`, which would otherwise stay
     pointed at the homepage and unfurl a link to /for as the site's generic
     card. */
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/for',
    siteName: "Let's Get Quoted",
    title: 'Contractor Website & Quoting Software by Trade · Let’s Get Quoted',
    description:
      'Websites and quoting software built for your trade — 49 of them. Win the lead, quote the job, and get paid. Free to start, no monthly subscription.',
    images: [
      {
        url: '/template-previews/professional.jpg',
        width: 1900,
        height: 881,
        alt: 'A contractor website built with Let’s Get Quoted',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contractor Website & Quoting Software by Trade',
    description:
      'Websites and quoting software built for your trade — 49 of them. Free to start, no monthly subscription.',
    images: ['/template-previews/professional.jpg'],
  },
};

const HIGHEST_FEE = FEE_TIERS[0].rate;
const LOWEST_FEE = FEE_TIERS[FEE_TIERS.length - 1].rate;

/**
 * WHAT PICKING A TRADE ACTUALLY CHANGES.
 *
 * The page claimed to be "tuned to the way your trade works" and then listed
 * services, which is a description of the trade rather than of the tuning. Each
 * of these is a real branch in the product on the stored trade — the service
 * menu comes from the trade's own list, the templates from templateIds, and the
 * quote, blog and campaign helpers all read the account's trade before they
 * write anything. Nothing here is aspirational.
 */
const BENEFITS = [
  {
    title: 'Your website',
    body: 'Templates picked for your trade, and page copy written to name the work you do and the town you do it in.',
    icon: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18" />
      </>
    ),
  },
  {
    title: 'Your service menu',
    body: 'The jobs your trade actually sells are already in the list — you edit prices, not the whole catalogue.',
    icon: (
      <>
        <path d="M8 6h13M8 12h13M8 18h13" strokeLinecap="round" />
        <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" strokeLinecap="round" />
      </>
    ),
  },
  {
    title: 'Your quotes',
    body: 'Quote drafts and change orders start from what your trade normally includes, so the first version is close.',
    icon: (
      <>
        <path d="M6 3h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
        <path d="M14 3v5h5" />
      </>
    ),
  },
  {
    title: 'Your marketing',
    body: 'Seasonal campaign timing, blog topics and review requests written for your trade rather than for “contractors”.',
    icon: (
      <>
        <path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1Z" />
        <path d="M17 9a4 4 0 0 1 0 6" strokeLinecap="round" />
      </>
    ),
  },
];

/**
 * The five statements on the trust strip.
 *
 * EVERY ONE OF THESE IS CHECKABLE, and that is the whole rule for this band. No
 * customer counts, no star ratings, no processed-payment totals, no logos —
 * there is no measurement behind any of those, and a number nobody can source is
 * worse than an empty strip. The trade count reads off TRADES so it cannot go
 * stale the way a typed "49" would; the other four are the pricing model as
 * /pricing states it and the payment processor as it is wired.
 */
const TRUST = [
  `${TRADES.length} trades supported`,
  'Free to start',
  'No credit card',
  'No monthly subscription',
  'Stripe-powered payments',
];

/** The customer's side of the product, in the order it happens. */
const STEPS = [
  { title: 'Visit the website', body: 'A real contractor site, published on its own address.' },
  { title: 'Get an estimate', body: 'Answer a few questions and see an estimated range in seconds.' },
  { title: 'Approve the quote', body: 'Read the line items and e-sign it from a phone.' },
  { title: 'Pay online', body: 'Card or bank, through Stripe, straight to the contractor.' },
];

function Check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
      <path d="m4 12.5 5 5L20 6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function TradeIndexPage() {
  const common = tradesBySlugs(COMMON_TRADE_SLUGS);

  return (
    <>
      {/* The navy, painted across the whole viewport. A sibling of <main> rather
          than a child of it, so nothing on the page can clip it. */}
      <div className={styles.ground} aria-hidden="true" />

      {/* The absolute stop on horizontal overflow, one level out from the page
          so the hero's glow has somewhere to spill. See .frame / .page. */}
      <div className={styles.frame}>
        <main className={styles.page} id="main-content">
          {/* ---- 2. Split hero -------------------------------------------- */}
          <section className={styles.hero}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>Built for your trade</p>
              <h1>Websites and quoting software built for your trade.</h1>
              <p className={styles.heroLede}>
                Everything you need to win the lead, quote the job, and get paid.
              </p>
              <div className={styles.heroCtas}>
                <a href={APP_SIGNUP_URL} className={`${styles.btn} ${styles.btnPrimary}`}>
                  Build my free site
                </a>
                <Link href="/demo" className={`${styles.btn} ${styles.btnGhost}`}>
                  Explore the demo
                </Link>
              </div>
              {/* THE NUMBER, WHERE THE DECISION IS. "You only pay when a homeowner
                  pays you" is the good half of the sentence; a contractor reading
                  it still has to go and find out what "pay" means, and the page
                  that answers it was not linked from here. */}
              <p className={styles.heroFine}>
                You only pay when a homeowner pays you &mdash; a platform fee from {HIGHEST_FEE} down
                to {LOWEST_FEE} as your volume grows. <Link href="/pricing">See the full breakdown</Link>
              </p>
            </div>

            <div className={styles.heroArt}>
              {/* Eager and high-priority: this is the LCP element at every width.
                  The intrinsic size is the trimmed master's, printed by
                  scripts/build-for-hero.mjs — if it stops matching, Next reserves
                  the wrong box and the hero shifts as the image lands. */}
              <Image
                className={styles.heroShot}
                src="/for/hero-quote-devices.webp"
                alt="Let’s Get Quoted quote builder displayed on a laptop and phone."
                width={956}
                height={642}
                priority
                sizes="(max-width: 560px) 92vw, (max-width: 980px) 560px, (max-width: 1360px) 56vw, 703px"
              />
            </div>
          </section>

          {/* ---- 3. Trust strip ------------------------------------------- */}
          <ul className={styles.trust}>
            {TRUST.map((item) => (
              <li key={item}>
                <Check />
                {item}
              </li>
            ))}
          </ul>

          {/* ---- 4. Four core benefits ------------------------------------ */}
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>What &ldquo;tuned to your trade&rdquo; means</p>
              <h2>Four things change the moment you pick one.</h2>
            </div>
            <div className={styles.benefits}>
              {BENEFITS.map((item) => (
                <article key={item.title} className={styles.benefit}>
                  <span className={styles.benefitMark}>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      aria-hidden="true"
                    >
                      {item.icon}
                    </svg>
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </section>

          {/* ---- 5. Featured trades --------------------------------------- */}
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>Start here</p>
              <h2>Find your trade.</h2>
              <p>
                Eight of the {TRADES.length} we build for. The full directory is below &mdash; every
                one of them has its own page.
              </p>
            </div>
            <div className={styles.featured}>
              {common.map((trade) => (
                <Link key={trade.slug} href={`/for/${trade.slug}`} className={styles.featuredCard}>
                  <h3>{trade.name}</h3>
                  <span>{trade.services.slice(0, 4).join(' · ')}</span>
                  <em aria-hidden="true">See the page &rarr;</em>
                </Link>
              ))}
            </div>
          </section>

          {/* ---- 6. Product proof ----------------------------------------- */}
          <section className={styles.section}>
            <div className={styles.proof}>
              <div className={styles.proofHead}>
                <p className={styles.eyebrow}>See it working</p>
                <h2>Try the entire customer experience.</h2>
                <p>
                  Open a real demo website, request an estimate, review a quote, and see how
                  scheduling and payment work &mdash; from your customer&rsquo;s point of view.
                </p>
                <div className={styles.proofCta}>
                  <Link href="/demo" className={`${styles.btn} ${styles.btnPrimary}`}>
                    Explore the demo &mdash; no signup
                  </Link>
                </div>
              </div>

              {/* An ordered list because the order IS the content — nobody
                  approves a quote they were never sent. `role="list"` because
                  Safari drops list semantics from a list with no markers, and the
                  sequence is the point here. The chevrons between the steps are
                  drawn in CSS and are not in the document at all. */}
              <ol className={styles.steps} role="list">
                {STEPS.map((step) => (
                  <li key={step.title} className={styles.step}>
                    <b>{step.title}</b>
                    <span>{step.body}</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* ---- 7. The directory ----------------------------------------- */}
          <section className={styles.section} id="trades">
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>{TRADES.length} trades and counting</p>
              <h2>Every trade we build for.</h2>
              <p>
                Search by the work rather than the job title &mdash; &ldquo;water heater&rdquo; finds
                plumbers, &ldquo;mulch&rdquo; finds landscapers.
              </p>
            </div>

            <TradeFinder />

            <p className={styles.note}>
              Don&rsquo;t see yours? It still works &mdash; every feature is trade-agnostic.{' '}
              <Link href="/demo">Explore the demo &rarr;</Link>
            </p>
          </section>

          {/* ---- 8. Closing CTA -------------------------------------------
              `page-cta` carries no styling anywhere — it is the marker the
              header's mobile CTA bar watches for (site-chrome.tsx), so the bar
              stands aside rather than floating on top of the ask it duplicates. */}
          <section className={`${styles.closing} page-cta`}>
            <p className={styles.eyebrow}>Ready when you are</p>
            <h2>Start free &mdash; you only pay when a homeowner pays you.</h2>
            <p>
              No subscription. No setup fee. Everything you need to win the lead, quote the job, and
              get paid.
            </p>
            <div className={styles.closingCtas}>
              <a href={APP_SIGNUP_URL} className={`${styles.btn} ${styles.btnPrimary}`}>
                Build my free site
              </a>
              <Link href="/faq" className={`${styles.btn} ${styles.btnGhost}`}>
                Read the FAQ
              </Link>
            </div>
          </section>

          <SiteFooter />
        </main>
      </div>
    </>
  );
}
