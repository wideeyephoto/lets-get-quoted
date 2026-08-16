import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TRADES, getTrade, indefiniteArticle, lowerTradeName } from '@/lib/trades';
import { AVAILABLE_TEMPLATES } from '@/lib/templates/types';
import { FAVORITE_FEATURES, FEATURE_COUNT } from '@/lib/features';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import { titleWithBrand } from '@/lib/seo/marketing-seo';
import { breadcrumbJsonLd, HOME_CRUMB } from '@/lib/seo/breadcrumbs';
import { cspNonce } from '@/lib/csp-nonce';
import SiteFooter from '@/components/site-footer';

export function generateStaticParams() {
  return TRADES.map((trade) => ({ trade: trade.slug }));
}

export function generateMetadata({ params }: { params: { trade: string } }): Metadata {
  const trade = getTrade(params.trade);
  if (!trade) return {};
  return {
    /* `absolute` + titleWithBrand, not the root layout's title template.
       The template appends "· Let's Get Quoted" unconditionally, which is why
       29 of these 49 titles rendered past the ~60 characters Google shows —
       "Website & Software for Water Damage Restoration Companies" is 57 on its
       own and 76 with the brand, so the brand was the part being truncated.
       titleWithBrand adds it back on every trade short enough to keep it. */
    title: { absolute: titleWithBrand(trade.metaTitle) },
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

  // "hvac contractors" and "a appliance repair business" were both produced
  // here, on every one of the 49 pages. See the notes on these helpers.
  const name = lowerTradeName(trade.name);
  const an = indefiniteArticle(trade.work);

  // Home › For your trade › Roofers, in place of the bare slug, on all 49.
  const breadcrumbs = breadcrumbJsonLd([
    HOME_CRUMB,
    { name: 'For your trade', path: '/for' },
    { name: trade.name, path: `/for/${trade.slug}` },
  ]);

  return (
    <main className="marketing-shell" id="main-content">
      <script type="application/ld+json" nonce={cspNonce()} dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />
      <div className="ambient-glow ambient-glow-a" aria-hidden="true" />

      <section className="hero-copy trade-hero">
        <p className="eyebrow">For {name}</p>
        <h1>{trade.headline}</h1>
        <p className="hero-text">{trade.subhead}</p>
        <div className="actions">
          <a href={APP_SIGNUP_URL} className="btn primary">Build my free site</a>
          <Link href="/demo" className="btn secondary">Explore the demo &mdash; no signup</Link>
        </div>
        <p className="hero-reassure">Flex starts at $0/month + 1.25% &middot; No credit card</p>
        <ul className="trade-services" aria-label={`Built for ${trade.work} work`}>
          {trade.services.map((service) => (
            <li key={service}>{service}</li>
          ))}
        </ul>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Made for the way you work</p>
          <h2>Built around what {name} actually struggle with.</h2>
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
          <h2>Everything {an} {trade.work} business needs to run.</h2>
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
            <h2>Templates built for {name}.</h2>
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
          <h2>Start with Flex at $0/month plus 1.25%.</h2>
          <p>Plans start with Flex at $0/month plus 1.25%. No setup fee. Everything {an} {trade.work} business needs, from your first quote.</p>
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
