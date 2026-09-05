import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TRADES, getTrade, indefiniteArticle, lowerTradeName } from '@/lib/trades';
import { AVAILABLE_TEMPLATES } from '@/lib/templates/types';
import { FAVORITE_FEATURES, FEATURE_COUNT } from '@/lib/features';
import { buildSignupUrl } from '@/components/marketing/links';
import { titleWithBrand } from '@/lib/seo/marketing-seo';
import { breadcrumbJsonLd, HOME_CRUMB } from '@/lib/seo/breadcrumbs';
import { cspNonce } from '@/lib/csp-nonce';
import SiteFooter from '@/components/site-footer';
import TradeRoiCalculator from './TradeRoiCalculator';
import TradeTopicCluster from './TradeTopicCluster';
import TradeDefinitiveSuite from './TradeDefinitiveSuite';
import TradeInsuranceClaimsShowcase from './TradeInsuranceClaimsShowcase';
import { getTradeTopicCluster } from '@/lib/trade-clusters';
import { getDefinitiveTradeData } from '@/lib/trade-deep-data';

export function generateStaticParams() {
  return TRADES.map((trade) => ({ trade: trade.slug }));
}

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ trade: string }> }): Promise<Metadata> {
  const params = await paramsPromise;
  const trade = getTrade(params.trade);
  if (!trade) return {};
  return {
    /* `absolute` + titleWithBrand, not the root layout's title template.
       The template appends "· Let's Get Quoted" unconditionally, which is why
       titles rendered past the ~60 characters Google shows.
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

export default async function TradePage({ params }: { params: Promise<{ trade: string }> }) {
  const { trade: tradeParam } = await params;
  const trade = getTrade(tradeParam);
  if (!trade) notFound();

  const templates = trade.templateIds
    .map((id) => AVAILABLE_TEMPLATES.find((template) => template.id === id))
    .filter((template): template is NonNullable<typeof template> => Boolean(template));

  const cluster = getTradeTopicCluster(trade);
  const relatedTrades = cluster.relatedTrades;
  const definitiveData = getDefinitiveTradeData(trade.slug);

  const name = lowerTradeName(trade.name);
  const an = indefiniteArticle(trade.work);
  const signupUrl = buildSignupUrl({ trade: trade.slug });

  // Home › For your trade › Roofers, in place of the bare slug.
  const breadcrumbs = breadcrumbJsonLd([
    HOME_CRUMB,
    { name: 'For your trade', path: '/for' },
    { name: trade.name, path: `/for/${trade.slug}` },
  ]);

  const faqJsonLd = definitiveData?.faqs?.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: definitiveData.faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.answer,
          },
        })),
      }
    : null;

  const nonce = await cspNonce();

  return (
    <main className="marketing-shell" id="main-content">
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />
      {faqJsonLd ? (
        <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      ) : null}
      <div className="ambient-glow ambient-glow-a" aria-hidden="true" />

      <section className="hero-copy trade-hero">
        <p className="eyebrow">For {name}</p>
        <h1>{trade.headline}</h1>
        <p className="hero-text">{trade.subhead}</p>
        <div className="actions">
          <a href={signupUrl} className="btn primary">Build my free site</a>
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

      <TradeRoiCalculator trade={trade} />

      <TradeDefinitiveSuite trade={trade} />

      {/* Insurance Claims & Supplement Studio Showcase (Gated to insurance-eligible trades) */}
      <TradeInsuranceClaimsShowcase trade={trade} />

      <section className="section-block">
        <div className="section-heading">
          <p className="eyebrow">The whole toolkit</p>
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
            <Link href="/demo/sites" className="btn secondary">See the templates live &rarr;</Link>
          </div>
        </section>
      ) : null}

      <TradeTopicCluster trade={trade} />

      {relatedTrades.length > 0 ? (
        <section className="section-block">
          <div className="section-heading">
            <p className="eyebrow">Related trades</p>
            <h2>Also explore related specialties.</h2>
          </div>
          <div className="feature-grid">
            {relatedTrades.map((related) => (
              <Link key={related.slug} href={`/for/${related.slug}`} className="feature-card" style={{ textDecoration: 'none' }}>
                <h3>{related.name} &rarr;</h3>
                <p>{related.services.slice(0, 4).join(' · ')}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="cta-band">
        <div className="cta-band-inner">
          <p className="eyebrow">Ready when you are</p>
          <h2>Start with Flex at $0/month plus 1.25%.</h2>
          <p>Plans start with Flex at $0/month plus 1.25%. No setup fee. Everything {an} {trade.work} business needs, from your first quote.</p>
          <div className="actions">
            <a href={signupUrl} className="btn primary">Build my free site</a>
            <Link href="/faq" className="btn secondary">Read the FAQ</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
