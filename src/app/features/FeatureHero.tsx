import Link from 'next/link';
import HeroDashboard from '@/components/hero-dashboard';
import './feature-hero.css';

// Features hero: "Quote it. Sign it. Get paid." — copy on the left beside the
// shared interactive dashboard panel.
export default function FeatureHero() {
  return (
    <section className="fh-hero" aria-labelledby="fx-hero-title">
      <div className="fh-copy">
        <p className="eyebrow">The whole loop, one tool</p>
        <h1 id="fx-hero-title" className="fh-title">
          Quote it. Sign it. <span className="fh-grad">Get paid.</span>
        </h1>
        <p className="fh-sub">
          Every tool the job needs — from the AI estimate on your website to money in your bank. One command center, no
          monthly subscription.
        </p>
        <div className="actions">
          <Link href="/login" className="btn primary">
            Create Free Account
          </Link>
          <Link href="/demo" className="btn secondary">
            Explore the demo &mdash; no signup
          </Link>
        </div>
      </div>

      <HeroDashboard />
    </section>
  );
}
