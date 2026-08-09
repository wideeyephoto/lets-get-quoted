import Link from 'next/link';
import type { Metadata } from 'next';
import { TRADES } from '@/lib/trades';
import { COMMON_TRADE_SLUGS, tradesBySlugs } from '@/lib/trade-categories';
import { FEE_TIERS } from '@/lib/pricing';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import SiteFooter from '@/components/site-footer';
import TradeFinder from './TradeFinder';

export const metadata: Metadata = {
  title: 'Built for your trade',
  description:
    'A website, a 24/7 AI Estimator, quotes, scheduling, and payments — tailored to your trade. Search all the contractor trades Let’s Get Quoted is built for. No subscription.',
  alternates: { canonical: 'https://letsgetquoted.com/for' },
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
const TUNING = [
  {
    title: 'Your website',
    body: 'Templates picked for your trade, and page copy written to name the work you do and the town you do it in.',
  },
  {
    title: 'Your service menu',
    body: 'The jobs your trade actually sells are already in the list — you edit prices, not the whole catalogue.',
  },
  {
    title: 'Your quotes',
    body: 'Quote drafts and change orders start from what your trade normally includes, so the first version is close.',
  },
  {
    title: 'Your marketing',
    body: 'Seasonal campaign timing, blog topics and review requests written for your trade rather than for “contractors”.',
  },
];

export default function TradeIndexPage() {
  const common = tradesBySlugs(COMMON_TRADE_SLUGS);

  return (
    <main className="marketing-shell" id="main-content">
      <div className="ambient-glow ambient-glow-a" aria-hidden="true" />

      <section className="hero-copy trade-hero">
        <p className="eyebrow">Built for your trade</p>
        <h1>One tool, tuned to the way your trade works.</h1>
        <p className="hero-text">
          Whatever you do, Let&rsquo;s Get Quoted gives you a website with an AI Estimator that works
          24/7, quotes and e-signatures, scheduling, and Stripe payments straight to your bank
          &mdash; with no subscription. Pick your trade to see how it fits.
        </p>
        <div className="actions">
          <a href={APP_SIGNUP_URL} className="btn primary">
            Build my free site
          </a>
          <Link href="/demo" className="btn secondary">
            Explore the demo &mdash; no signup
          </Link>
        </div>
        {/* THE NUMBER, WHERE THE DECISION IS. "You only pay when a homeowner
            pays you" is the good half of the sentence; a contractor reading it
            still has to go and find out what "pay" means, and the page that
            answers it was not linked from here. */}
        <p className="hero-reassure">
          Free to start &middot; No credit card &middot; You only pay when a homeowner pays you
          &mdash; a platform fee from {HIGHEST_FEE} down to {LOWEST_FEE} as your volume grows.{' '}
          <Link href="/pricing">See the full breakdown &rarr;</Link>
        </p>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <p className="eyebrow">What &ldquo;tuned to your trade&rdquo; means</p>
          <h2>Four things change the moment you pick one.</h2>
        </div>
        <div className="trade-tuning">
          {TUNING.map((item) => (
            <article key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block" id="trades">
        <div className="section-heading">
          <p className="eyebrow">{TRADES.length} trades and counting</p>
          <h2>Find your trade.</h2>
        </div>

        {/* The shortlist is passed IN rather than rendered by the finder,
            because it is server-rendered content — real links, in the HTML,
            crawlable — and the finder only decides whether to show it. */}
        <TradeFinder>
          <div className="trade-common">
            <h3>Start here</h3>
            <div className="trade-common-grid">
              {common.map((trade) => (
                <Link key={trade.slug} href={`/for/${trade.slug}`} className="trade-index-card">
                  <h4>{trade.name}</h4>
                  <p>{trade.services.slice(0, 4).join(' · ')}</p>
                </Link>
              ))}
            </div>
          </div>
        </TradeFinder>

        <p className="trade-index-note">
          Don&rsquo;t see yours? It still works &mdash; every feature is trade-agnostic.{' '}
          <Link href="/demo">Explore the demo &rarr;</Link>
        </p>
      </section>

      <section className="cta-band">
        <div className="cta-band-inner">
          <p className="eyebrow">Ready when you are</p>
          <h2>Start free &mdash; you only pay when a homeowner pays you.</h2>
          <p>
            No subscription. No setup fee. Everything you need to win the lead, quote the job, and
            get paid.
          </p>
          <div className="actions">
            <a href={APP_SIGNUP_URL} className="btn primary">
              Build my free site
            </a>
            <Link href="/faq" className="btn secondary">
              Read the FAQ
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
