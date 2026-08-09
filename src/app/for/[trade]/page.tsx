import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TRADES, getTrade } from '@/lib/trades';
import { AVAILABLE_TEMPLATES } from '@/lib/templates/types';
import { FAVORITE_FEATURES, FEATURE_COUNT } from '@/lib/features';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import SiteFooter from '@/components/site-footer';

export function generateStaticParams() {
  return TRADES.map((trade) => ({ trade: trade.slug }));
}

export function generateMetadata({ params }: { params: { trade: string } }): Metadata {
  const trade = getTrade(params.trade);
  if (!trade) return {};
  return {
    // No brand here — the root layout's title template appends "· Let's Get
    // Quoted" to every page title, so carrying it produced
    // "Pricing — Let's Get Quoted · Let's Get Quoted" in the tab and in search
    // results. openGraph.title below keeps it, because the template does not
    // apply there.
    title: trade.metaTitle,
    description: trade.metaDescription,
    alternates: { canonical: `https://letsgetquoted.com/for/${trade.slug}` },
    openGraph: {
      title: `${trade.metaTitle} · Let’s Get Quoted`,
      description: trade.metaDescription,
      url: `https://letsgetquoted.com/for/${trade.slug}`,
    },
  };
}

export default function TradePage({ params }: { params: { trade: string } }) {
  const trade = getTrade(params.trade);
  if (!trade) notFound();

  const templates = trade.templateIds
    .map((id) => AVAILABLE_TEMPLATES.find((template) => template.id === id))
    .filter((template): template is NonNullable<typeof template> => Boolean(template));

  return (
    <main className="marketing-shell" id="main-content">
      <div className="ambient-glow ambient-glow-a" aria-hidden="true" />

      <section className="hero-copy trade-hero">
        <p className="eyebrow">For {trade.name.toLowerCase()}</p>
        <h1>{trade.headline}</h1>
        <p className="hero-text">{trade.subhead}</p>
        <div className="actions">
          <a href={APP_SIGNUP_URL} className="btn primary">Build my free site</a>
          <Link href="/demo" className="btn secondary">Explore the demo &mdash; no signup</Link>
        </div>
        <p className="hero-reassure">Free to start &middot; No credit card &middot; You only pay when a homeowner pays you.</p>
        <ul className="trade-services" aria-label={`Built for ${trade.work} work`}>
          {trade.services.map((service) => (
            <li key={service}>{service}</li>
          ))}
        </ul>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Made for the way you work</p>
          <h2>Built around what {trade.name.toLowerCase()} actually struggle with.</h2>
        </div>
        <div className="feature-grid">
          {trade.pains.map((pain) => (
            <article key={pain.title} className="feature-card">
              <h3>{pain.title}</h3>
              <p>{pain.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <p className="eyebrow">The whole toolkit</p>
          {/* trade.work, not a de-pluralised trade.name. Stripping the "s" off
              "Plumbers" gives "a plumber business" and off "Roofers" gives "a
              roofer business" — the practitioner where the trade belongs.
              `work` is already the noun for the work itself ("plumbing",
              "roofing", "landscaping & lawn care"). */}
          <h2>Everything a {trade.work} business needs to run.</h2>
          <p>One login for your site, leads, quotes, scheduling, and getting paid &mdash; a slice of the {FEATURE_COUNT} features that come standard.</p>
        </div>
        <div className="feature-grid fav-grid">
          {FAVORITE_FEATURES.map((feature) => (
            <article key={feature.id} className="feature-card fav-card">
              <span className="fav-card-tag">{feature.category}</span>
              <h3>{feature.name}</h3>
              <p>{feature.desc}</p>
            </article>
          ))}
        </div>
        <div className="mid-cta">
          <Link href="/features" className="btn secondary">See all {FEATURE_COUNT} features &rarr;</Link>
        </div>
      </section>

      {templates.length > 0 ? (
        <section className="section-block">
          <div className="section-heading">
            <p className="eyebrow">Your storefront</p>
            <h2>Templates built for {trade.name.toLowerCase()}.</h2>
            <p>Pick a look, drop in your photos, and publish to your own domain in minutes &mdash; no developer.</p>
          </div>
          <div className="feature-grid">
            {templates.map((template) => (
              <article key={template.id} className="feature-card">
                <h3>{template.name}</h3>
                <p>{template.description}.</p>
              </article>
            ))}
          </div>
          <div className="mid-cta">
            <Link href="/demo" className="btn secondary">See the templates live &rarr;</Link>
          </div>
        </section>
      ) : null}

      <section className="cta-band">
        <div className="cta-band-inner">
          <p className="eyebrow">Ready when you are</p>
          <h2>Start free &mdash; you only pay when a homeowner pays you.</h2>
          <p>No subscription. No setup fee. Everything a {trade.work} business needs, from your first quote.</p>
          <div className="actions">
            <a href={APP_SIGNUP_URL} className="btn primary">Build my free site</a>
            <Link href="/faq" className="btn secondary">Read the FAQ</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
