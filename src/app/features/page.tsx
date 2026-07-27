import Link from 'next/link';
import type { Metadata } from 'next';
import { FEATURE_CATEGORIES, FEATURE_COUNT } from '@/lib/features';
import SiteFooter from '@/components/site-footer';
import FeaturesPipeline from './FeaturesPipeline';
import FeatureBento from './FeatureBento';

export const metadata: Metadata = {
  title: "Features — Let's Get Quoted",
  description:
    'Every feature in Let’s Get Quoted: website, AI lead intake, quotes, e-signatures, Stripe payments, payment plans, scheduling, crew, recurring billing, reviews, and marketing — one tool, no subscription.',
  alternates: { canonical: 'https://letsgetquoted.com/features' },
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

        <FeatureBento />
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
