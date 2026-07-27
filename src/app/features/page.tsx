import Link from 'next/link';
import type { Metadata } from 'next';
import { FEATURE_CATEGORIES, FAVORITE_FEATURES, FEATURE_COUNT } from '@/lib/features';
import SiteFooter from '@/components/site-footer';

export const metadata: Metadata = {
  title: "Features — Let's Get Quoted",
  description:
    'Every feature in Let’s Get Quoted: website, AI lead intake, quotes, e-signatures, Stripe payments, payment plans, scheduling, crew, recurring billing, reviews, and marketing — one tool, no subscription.',
  alternates: { canonical: 'https://letsgetquoted.com/features' },
};

export default function FeaturesPage() {
  return (
    <main className="marketing-shell">
      <div className="ambient-glow ambient-glow-a" aria-hidden="true" />

      <section className="section-block features-hero">
        <div className="section-heading">
          <p className="eyebrow">Every feature</p>
          <h2>The whole contractor toolkit, in one place.</h2>
          <p>
            Website, leads, quotes, e-signatures, scheduling, crew, and getting paid — the entire operating loop, with
            no monthly subscription. Here&apos;s everything Let&apos;s Get Quoted does, organized the way a job actually
            flows.
          </p>
        </div>
        <div className="features-stats">
          <div className="features-stat hot"><strong>{FEATURE_COUNT}+</strong><span>features shipped</span></div>
          <div className="features-stat hot"><strong>$0</strong><span>per month to start</span></div>
          <div className="features-stat"><strong>{FEATURE_CATEGORIES.length}</strong><span>areas covered</span></div>
          <div className="features-stat"><strong>1</strong><span>login for all of it</span></div>
        </div>
        <div className="actions">
          <Link href="/login" className="btn primary">Create Free Account</Link>
          <Link href="/demo" className="btn secondary">Explore the demo &mdash; no signup</Link>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Contractor favorites</p>
          <h2>The features owners lean on every day.</h2>
          <p>The highlights &mdash; the ones that win the job, get you paid faster, and keep customers coming back.</p>
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
      </section>

      <section className="section-block">
        <div className="section-heading">
          <p className="eyebrow">The full list</p>
          <h2>Every feature, by stage.</h2>
        </div>
        <div className="feature-catalog">
          {FEATURE_CATEGORIES.map((category) => (
            <section className="feature-cat" key={category.slug} id={category.slug}>
              <div className="feature-cat-head">
                <span className="feature-cat-num">{category.num}</span>
                <div>
                  <h3>{category.title}</h3>
                  <p className="feature-cat-intro">{category.intro}</p>
                </div>
              </div>
              <ul className="feat-checklist">
                {category.features.map((feature) => (
                  <li key={feature.id}>
                    <span className="feat-mark" aria-hidden="true">&#10003;</span>
                    <span className="feat-copy">
                      <b>{feature.name}</b>
                      <span>{feature.desc}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>

      <section className="cta-band">
        <div className="cta-band-inner">
          <p className="eyebrow">Ready when you are</p>
          <h2>Start free &mdash; you only pay when a homeowner pays you.</h2>
          <p>No subscription. No setup fee. The whole toolkit, from your first quote.</p>
          <div className="actions">
            <Link href="/login" className="btn primary">Create Free Account</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
