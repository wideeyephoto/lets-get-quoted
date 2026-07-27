import Link from 'next/link';
import type { Metadata } from 'next';
import { FEATURE_CATEGORIES, FAVORITE_FEATURES, FEATURE_COUNT } from '@/lib/features';
import SiteFooter from '@/components/site-footer';
import FeaturesPipeline from './FeaturesPipeline';

export const metadata: Metadata = {
  title: "Features — Let's Get Quoted",
  description:
    'Every feature in Let’s Get Quoted: website, AI lead intake, quotes, e-signatures, Stripe payments, payment plans, scheduling, crew, recurring billing, reviews, and marketing — one tool, no subscription.',
  alternates: { canonical: 'https://letsgetquoted.com/features' },
};

// Icon set for the bento band, keyed by favorite feature id. Kept inline so the
// page stays self-contained (no external assets) and can render on the server.
function favoriteIcon(id: string) {
  const paths: Record<string, JSX.Element> = {
    'hosted-website': (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18" />
      </>
    ),
    'ai-smart-intake': (
      <>
        <path d="M12 3.2 13.7 8 18.5 9.7 13.7 11.4 12 16.2 10.3 11.4 5.5 9.7 10.3 8z" />
        <path d="m18.4 14.2.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z" />
      </>
    ),
    'client-esignature': (
      <>
        <path d="M3 20.5s3.6-.7 5.6-2.7l9.1-9.1a2.1 2.1 0 0 0-3-3l-9.1 9.1C3.6 15.9 3 20.5 3 20.5z" />
        <path d="m13.5 6 3 3" />
        <path d="M4 21h16" />
      </>
    ),
    'stripe-payments': (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18" />
        <path d="M7 15h4" />
      </>
    ),
    'payment-plans': (
      <>
        <path d="m12 2 9 5-9 5-9-5z" />
        <path d="m3 12 9 5 9-5" />
        <path d="m3 17 9 5 9-5" />
      </>
    ),
    'online-booking': (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
        <path d="m9 15 2 2 4-4" />
      </>
    ),
    'recurring-plans': (
      <>
        <path d="m17 2 4 4-4 4" />
        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
        <path d="m7 22-4-4 4-4" />
        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      </>
    ),
    'review-routing': (
      <>
        <path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[id] ?? paths['hosted-website']}
    </svg>
  );
}

// Bento tile sizing, mapped to specific favorites so the grid packs cleanly:
// two 2x2 hero tiles + two wide banners + four standard tiles = a full grid.
const TILE_SIZE: Record<string, 'big' | 'wide'> = {
  'hosted-website': 'big',
  'ai-smart-intake': 'big',
  'payment-plans': 'wide',
  'review-routing': 'wide',
};

export default function FeaturesPage() {
  // Hand the pipeline a plain, serializable slice of the catalog.
  const stations = FEATURE_CATEGORIES.map((category) => ({
    num: category.num,
    slug: category.slug,
    title: category.title,
    intro: category.intro,
    features: category.features.map((feature) => ({
      id: feature.id,
      name: feature.name,
      desc: feature.desc,
      favorite: feature.favorite ?? false,
    })),
  }));

  return (
    <main className="marketing-shell">
      <div className="ambient-glow ambient-glow-a" aria-hidden="true" />
      <div className="ambient-glow ambient-glow-b" aria-hidden="true" />

      {/* Hero */}
      <section className="fx-hero" aria-labelledby="fx-hero-title">
        <p className="eyebrow">The complete platform</p>
        <h1 id="fx-hero-title" className="fx-hero-title">
          The whole contractor toolkit, in one place.
        </h1>
        <p className="fx-hero-lede">
          Website, AI lead intake, quotes, e-signatures, payments, scheduling, crew, and getting paid — the entire
          operating loop of a job, with no monthly subscription. One command center, organized the way work actually
          flows.
        </p>

        <dl className="fx-stat-strip" aria-label="Key numbers">
          <div className="fx-stat fx-stat--hot">
            <dt>{FEATURE_COUNT}+</dt>
            <dd>features</dd>
          </div>
          <div className="fx-stat">
            <dt>{FEATURE_CATEGORIES.length}</dt>
            <dd>lifecycle stages</dd>
          </div>
          <div className="fx-stat fx-stat--good">
            <dt>$0</dt>
            <dd>per month</dd>
          </div>
          <div className="fx-stat">
            <dt>1</dt>
            <dd>login for all of it</dd>
          </div>
        </dl>

        <div className="actions">
          <Link href="/login" className="btn primary">
            Create Free Account
          </Link>
          <Link href="/demo" className="btn secondary">
            Explore the demo &mdash; no signup
          </Link>
        </div>
      </section>

      {/* Concept B — Bento command center of the favorites */}
      <section className="fx-bento-section" aria-labelledby="fx-bento-title">
        <div className="fx-section-head">
          <p className="eyebrow">Contractor favorites</p>
          <h2 id="fx-bento-title">One command center for the whole job.</h2>
          <p className="fx-section-sub">
            The features owners lean on every day &mdash; the ones that win the job, get you paid faster, and keep
            customers coming back.
          </p>
        </div>

        <div className="fx-bento">
          {FAVORITE_FEATURES.map((feature) => {
            const size = TILE_SIZE[feature.id];
            return (
              <article
                key={feature.id}
                className={`fx-tile${size === 'big' ? ' fx-tile--big' : ''}${size === 'wide' ? ' fx-tile--wide' : ''}`}
              >
                <span className="fx-tile-ic" aria-hidden="true">
                  {favoriteIcon(feature.id)}
                </span>
                <span className="fx-tile-tag">{feature.category}</span>
                <h3 className="fx-tile-name">{feature.name}</h3>
                <p className="fx-tile-desc">{feature.desc}</p>
              </article>
            );
          })}
        </div>
      </section>

      {/* Concept A — The Pipeline: every stage, every feature */}
      <section className="fx-pipeline-section" aria-labelledby="fx-pipeline-title">
        <div className="fx-section-head">
          <p className="eyebrow">The full toolkit</p>
          <h2 id="fx-pipeline-title">Every feature, in the order a job flows.</h2>
          <p className="fx-section-sub">
            Twelve stages, from first click on your website to clean books at tax time. Follow the line &mdash; nothing
            in the job is left to another app.
          </p>
        </div>

        <FeaturesPipeline stations={stations} />
      </section>

      {/* Closing CTA */}
      <section className="cta-band">
        <div className="cta-band-inner">
          <p className="eyebrow">Ready when you are</p>
          <h2>Start free &mdash; you only pay when a homeowner pays you.</h2>
          <p>No subscription. No setup fee. The whole toolkit, from your first quote.</p>
          <div className="actions">
            <Link href="/login" className="btn primary">
              Create Free Account
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
