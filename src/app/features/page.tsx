/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  PageCTA,
  SiteFooter,
  SiteHeader,
} from '@/components/flagship/site-chrome';
import {
  FLEX_PRICE,
  LOWEST_PLATFORM_FEE,
  PLAN_PRICE_OPTIONS,
  PLAN_FEE_RANGE_LABEL,
  PUBLIC_PRICING_SUMMARY,
  STRIPE_PROCESSING_NOTE,
} from '@/lib/pricing';
import { BRAND_POSITIONING } from '@/lib/brand-messaging';
import { buildSignupUrl } from '@/lib/signup-intent';
import { cspNonce } from '@/lib/csp-nonce';
import { FEATURE_COUNT } from '@/lib/features';
import { TRADES } from '@/lib/trades';
import styles from '@/components/flagship/flagship.module.css';
import LaunchBanner from '@/components/marketing/launch-banner';
import ThemeFab from '@/components/theme-fab';
import AllFeaturesModal from '@/components/marketing/AllFeaturesModal';
import FeaturesCatalogExplorer from './FeaturesCatalogExplorer';
import CompanionPhotoScopeDemo from './CompanionPhotoScopeDemo';
import CompanionRouteDemo from './CompanionRouteDemo';
import CompanionHUD from './CompanionHUD';
import HighTechShowcase from '@/components/marketing/HighTechShowcase';

import FeaturesEnergyFlowHero from './FeaturesEnergyFlowHero';
import ContractorSecretWeapons from './ContractorSecretWeapons';
import themeStyles from './features-theme.module.css';

const FEATURES_URL = 'https://letsgetquoted.com/features';
const FEATURES_DESCRIPTION =
  'One connected system for contractors: free website, AI intake, quotes, scheduling, crews, and Stripe payments. Plans start at $0/month.';
const FEATURE_SIGNUP_URL = buildSignupUrl({ source: 'feature_page' });
const LOWEST_FEE_PLAN = PLAN_PRICE_OPTIONS[PLAN_PRICE_OPTIONS.length - 1];

/**
 * The Product page, in the standalone site's visual language.
 *
 * This page used to render in the app's own design system. It was measurably
 * more decorated than the site it was drawn from — more layered shadows, more
 * heavy weights — and still read flatter, for two reasons that are not about
 * decoration at all: it ran dark from header to footer where the source breaks
 * its pages with light sections, and its product panels sat flat-on where the
 * source tilts them in space. Both are structural, so the page adopts the
 * source language rather than borrowing two tricks from it.
 *
 * THE HERO IS NO LONGER THE SOURCE'S. It carried a five-card strip of stage
 * names under the copy, tilted, with two notification cards floating over it.
 * Measured at 1440 the alert covered stages 04 AND 05 — a five-step story
 * hiding the two steps it was building to — and the paid card covered the job
 * record, so "Kitchen lighting upgrade" rendered as "...ograde". Underneath
 * that, five equal boxes made five equal claims and none of them was large
 * enough to read as software.
 *
 * It is a thread beside the copy now: one job, running past the reader, with
 * the real outgoing texts in it. See hero-thread.ts for where the words come
 * from and §104 of the generator for the layout.
 */

export const metadata: Metadata = {
  title: 'Contractor Software & Features',
  description: FEATURES_DESCRIPTION,
  alternates: { canonical: FEATURES_URL },
  openGraph: {
    type: 'website',
    url: FEATURES_URL,
    siteName: "Let's Get Quoted",
    title: 'Contractor Software & Features · Let’s Get Quoted',
    description: FEATURES_DESCRIPTION,
    images: [{
      url: '/product/jobs.webp',
      width: 1600,
      height: 1000,
      alt: 'The Let’s Get Quoted contractor job workflow',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contractor Software & Features · Let’s Get Quoted',
    description: FEATURES_DESCRIPTION,
    images: ['/product/jobs.webp'],
  },
};

/**
 * THE PROOF STRIP, AND WHY IT IS FOUR FACTS RATHER THAN FOUR NUMBERS.
 *
 * A page that says "turn more leads into paid jobs" and then shows nothing but
 * more of its own claims is asking to be taken on faith. The obvious fix is a
 * strip of outcomes — leads won, revenue added, stars — and we do not have one
 * of those we could stand behind: no testimonial we have permission to quote,
 * no cohort, no measured conversion lift. An invented one is the fastest way to
 * lose everything else on the page.
 *
 * So every cell here is a fact about the product, with price claims projected
 * from the canonical billing catalog rather than copied into this page.
 */
const PROOF: { stat: string; label: string }[] = [
  { stat: `${TRADES.length} trades`, label: 'Pages, FAQs and intake questions written for your trade' },
  { stat: FLEX_PRICE.monthlyPrice, label: 'Flex base price; its LGQ platform fee is 1.25%' },
  { stat: PLAN_FEE_RANGE_LABEL, label: 'LGQ platform fee, selected by plan rather than payment volume' },
  { stat: `${FEATURE_COUNT} features`, label: 'One connected product; included limits and seats vary by plan' },
];

/**
 * The objections, answered where they are raised.
 *
 * Every answer here is checkable against the product rather than the pitch.
 */
const FAQ: { q: string; a: string }[] = [
  {
    q: 'What exactly does the platform fee cost me?',
    a: `${PUBLIC_PRICING_SUMMARY} The LGQ fee applies to the discount-adjusted service subtotal collected through LGQ; tax, tips, refunds, credits, and Stripe costs are excluded. Stripe's ${STRIPE_PROCESSING_NOTE} are separate.`,
  },
  {
    q: 'Can I use the domain I already own?',
    a: 'Yes. You publish immediately on the included letsgetquoted.com subdomain, then point your own domain at the site with one CNAME whenever you are ready — publishing never waits on DNS. You buy and hold the registration yourself, in your own name; we never own the address your trucks and invoices carry.',
  },
  {
    q: 'How long does setup actually take?',
    a: 'Your business name, your trade and the towns you cover are enough to generate the whole site — pages, services, FAQs and the instant estimate — in one sitting. Everything it writes stays editable, before it goes live and afterwards.',
  },
  {
    q: 'Who owns my customers and my job history?',
    a: 'You do. There is no contract and no lock-in period, and a paid plan is cancelled from your own Settings page rather than by asking us. Your clients, quotes, jobs, messages and payment history are your records, your custom domain stays registered to you, and leaving does not cost you the address your customers already know.',
  },
  {
    q: 'How do payments work — do you hold my money?',
    a: 'No. Payments run on Stripe into your own connected account, so the money goes from the homeowner to you and settles on Stripe’s normal payout schedule. We never see card numbers and never hold your balance; the platform fee comes out of the payment as it clears.',
  },
  {
    q: 'Can I start with just the website and add the rest later?',
    a: 'Yes, and most people do. The site and the instant estimate are useful on their own from the first day. Quotes, scheduling, crew, texting and payments are already in the same account waiting — you turn to them when you need them, not when a plan says you have to.',
  },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: "Let's Get Quoted",
      url: FEATURES_URL,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: FEATURES_DESCRIPTION,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description: PUBLIC_PRICING_SUMMARY,
      },
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQ.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    },
  ],
};

export default async function FeaturesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        nonce={await cspNonce()}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className={themeStyles.featuresTheme}>
        <div className={themeStyles.siteShell}>
          {/* Ambient atmospheric backdrop glows matching website-builder */}
          <div className={`${themeStyles.ambient} ${themeStyles.ambientOne}`} aria-hidden="true" />
          <div className={`${themeStyles.ambient} ${themeStyles.ambientTwo}`} aria-hidden="true" />
          <div className={`${themeStyles.ambient} ${themeStyles.ambientThree}`} aria-hidden="true" />
          <div className={`${themeStyles.ambient} ${themeStyles.ambientFour}`} aria-hidden="true" />
          <div className={`${themeStyles.ambient} ${themeStyles.ambientFive}`} aria-hidden="true" />
          <div className={`${styles.root} inner-site feature-index-page`}>
          <a className="skip-link" href="#main-content">
            Skip to content
          </a>
          <SiteHeader />
          <LaunchBanner offsetHeader />
          <ThemeFab />

          <main id="main-content">
          {/* Centered flagship hero: the workflow simulation has moved to the tour section below */}
          <section className="index-hero">
            <p className="eyebrow">
              <span aria-hidden="true">✦</span> ONE JOB RECORD. EVERY STEP CONNECTED.
            </p>
            <h1>
              From website lead to paid job—<em>without stitching together six tools.</em>
            </h1>
            <p>
              Your website, AI intake, quotes, scheduling, crew, customer updates, and payments all work from the same job record.
            </p>
            <div className="hero-actions">
              <a className="button primary" href={FEATURE_SIGNUP_URL}>
                Build my free site <span aria-hidden="true">→</span>
              </a>
              <a className="button secondary" href="#catalog-explorer">
                Explore all features
              </a>
            </div>

            {/* The plan range stays beside the primary action and comes from the
                same canonical catalog as /pricing. */}
            <p className="index-hero-fee">
              Flex starts at {FLEX_PRICE.platformFee} platform fee (or as low as {LOWEST_PLATFORM_FEE} on {LOWEST_FEE_PLAN.name}) on collected payments. Free to build &amp; quote.{' '}
              <Link href="/pricing">Compare exact prices and limits</Link>
            </p>

            {/* 6-PILLAR INTERACTIVE ENERGY FLOW CHART */}
            <FeaturesEnergyFlowHero />

            {/* CONTRACTOR SECRET WEAPONS: 4-CARD HIGH MARGIN GRID */}
            <ContractorSecretWeapons />
          </section>

      {/* Four facts about the product, immediately after the claims that need
          them. Not outcomes, not customers, not stars — see PROOF above for
          why, and for where each number is read from. */}
      <section className="index-proof" aria-label="What an account costs and covers">
        {PROOF.map((cell) => (
          <span key={cell.stat}>
            <b>{cell.stat}</b>
            <small>{cell.label}</small>
          </span>
        ))}
      </section>

      {/* QUICK STOPS: Priority visit detour sold into route gaps */}
      <section className="route-band" id="quick-stops" aria-labelledby="route-title">
        <div className="route-copy">
          <p className="eyebrow">
            <span aria-hidden="true">✦</span> EARN MORE FROM EVERY ROUTE
          </p>
          <h2 id="route-title">
            Sell a priority visit to the customer you were <em>already driving past.</em>
          </h2>
          <p>
            A homeowner near today&rsquo;s route asks to be seen sooner. You approve the request,
            set the fee and the window, and they pay for the visit before you go. The work itself is
            quoted and invoiced exactly like any other job.
          </p>
          <Link className="route-link" href="/features/quick-stops">
            Explore Quick Stops <span aria-hidden="true">→</span>
          </Link>
        </div>
        <ul className="route-points">
          <li>
            <b>You approve every request</b>
            <small>Nothing lands on your calendar because somebody paid for it.</small>
          </li>
          <li>
            <b>You set the priority visit fee</b>
            <small>And the radius, the window and how many you will take.</small>
          </li>
          <li>
            <b>Paid before you arrive</b>
            <small>The window is confirmed when the visit fee clears, not before.</small>
          </li>
        </ul>

        {/* Interactive Companion Quick Stops Route Detour Demo */}
        <CompanionRouteDemo />
      </section>

      {/* 2026 NEXT-GEN HIGH-TECH & AI INNOVATIONS SHOWCASE */}
      <HighTechShowcase />

      {/* Interactive AI Companion Photo Scope Estimator Demo */}
      <CompanionPhotoScopeDemo />

      {/* 56-FEATURE COMPLETE CATALOG EXPLORER */}
      <FeaturesCatalogExplorer />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.25rem', flexWrap: 'wrap', margin: '32px auto 48px' }}>
        <Link href="/features/back-office" className="button secondary">
          See everything the back office runs <span aria-hidden="true">→</span>
        </Link>
        <AllFeaturesModal triggerLabel="Browse the full feature catalog" triggerVariant="secondary" />
      </div>

      <PageCTA
        title="Start with the website. Grow into the whole system."
        body={`${PUBLIC_PRICING_SUMMARY} See /pricing for included capacity, add-ons, and fee terms.`}
        href={FEATURE_SIGNUP_URL}
      />
      </main>

      {/* 24/7 Interactive AI Contractor Field Companion */}
      <CompanionHUD />

      <SiteFooter />

      </div>
        </div>
      </div>
    </>
  );
}
