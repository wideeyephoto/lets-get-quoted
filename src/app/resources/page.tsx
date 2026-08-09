import Link from 'next/link';
import type { Metadata } from 'next';
import { ARTICLES, formatArticleDate } from '@/lib/resources';
import SiteFooter from '@/components/site-footer';
import { APP_SIGNUP_URL } from '@/components/marketing/links';

export const metadata: Metadata = {
  title: 'Resources',
  description:
    'Practical, no-fluff guides for contractors: how to price for real margin, stop losing leads, get paid faster, and earn more 5-star reviews.',
  alternates: { canonical: 'https://letsgetquoted.com/resources' },
};

export default function ResourcesPage() {
  return (
    <main className="marketing-shell" id="main-content">
      <div className="ambient-glow ambient-glow-a" aria-hidden="true" />

      <section className="section-block features-hero">
        <div className="section-heading">
          <p className="eyebrow">Resources</p>
          {/* The page's own title, so it's the h1. See .section-heading h1. */}
          <h1>Straight-talk guides for running a contracting business.</h1>
          <p>Practical guidance for running a contracting business — pricing, leads, getting paid, and reputation, whatever tools you use.</p>
        </div>
      </section>

      <section className="section-block">
        <div className="feature-grid fav-grid">
          {ARTICLES.map((article) => (
            <Link key={article.slug} href={`/resources/${article.slug}`} className="feature-card fav-card resource-card">
              <span className="fav-card-tag">{article.category}</span>
              <h3>{article.title}</h3>
              <p>{article.excerpt}</p>
              <span className="resource-meta">{formatArticleDate(article.datePublished)} · {article.readMinutes} min read</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="cta-band">
        <div className="cta-band-inner">
          <p className="eyebrow">Ready when you are</p>
          <h2>Put the advice to work.</h2>
          <p>Start free — you only pay when a homeowner pays you.</p>
          <div className="actions">
            <a href={APP_SIGNUP_URL} className="btn primary">Build my free site</a>
            <Link href="/features" className="btn secondary">Browse all features</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
