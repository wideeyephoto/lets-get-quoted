import Link from 'next/link';
import type { Metadata } from 'next';
import { TRADES } from '@/lib/trades';
import SiteFooter from '@/components/site-footer';

export const metadata: Metadata = {
  title: 'Built for your trade · Let’s Get Quoted',
  description:
    'A website, a 24/7 AI Estimator, quotes, scheduling, and payments — tailored to your trade. Browse all the contractor trades Let’s Get Quoted is built for. No subscription.',
  alternates: { canonical: 'https://letsgetquoted.com/for' },
};

export default function TradeIndexPage() {
  return (
    <main className="marketing-shell">
      <div className="ambient-glow ambient-glow-a" aria-hidden="true" />

      <section className="hero-copy trade-hero">
        <p className="eyebrow">Built for your trade</p>
        <h1>One tool, tuned to the way your trade works.</h1>
        <p className="hero-text">
          Whatever you do, Let&rsquo;s Get Quoted gives you a website with a 24/7 AI Estimator, quotes and e-signatures,
          scheduling, and Stripe payments straight to your bank &mdash; with no subscription. Pick your trade to see how it fits.
        </p>
        <div className="actions">
          <Link href="/login?intent=signup" className="btn primary">Create Free Account</Link>
          <Link href="/demo" className="btn secondary">Explore the demo &mdash; no signup</Link>
        </div>
        <p className="hero-reassure">Free to start &middot; No credit card &middot; You only pay when a homeowner pays you.</p>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <p className="eyebrow">{TRADES.length} trades and counting</p>
          <h2>Find your trade.</h2>
        </div>
        <div className="trade-index-grid">
          {TRADES.map((trade) => (
            <Link key={trade.slug} href={`/for/${trade.slug}`} className="trade-index-card">
              <h3>{trade.name}</h3>
              <p>{trade.services.slice(0, 4).join(' · ')}</p>
            </Link>
          ))}
        </div>
        <p className="trade-index-note">
          Don&rsquo;t see yours? It still works &mdash; every feature is trade-agnostic. <Link href="/demo">Explore the demo &rarr;</Link>
        </p>
      </section>

      <section className="cta-band">
        <div className="cta-band-inner">
          <p className="eyebrow">Ready when you are</p>
          <h2>Start free &mdash; you only pay when a homeowner pays you.</h2>
          <p>No subscription. No setup fee. Everything you need to win the lead, quote the job, and get paid.</p>
          <div className="actions">
            <Link href="/login?intent=signup" className="btn primary">Create Free Account</Link>
            <Link href="/faq" className="btn secondary">Read the FAQ</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
