import Link from 'next/link';
import type { Metadata } from 'next';
import SiteFooter from '@/components/site-footer';
import FeatureHero from './FeatureHero';
import FeatureWheelStory from './FeatureWheelStory';

export const metadata: Metadata = {
  title: "Features — Let's Get Quoted",
  description:
    'Every feature in Let’s Get Quoted: website, AI lead intake, quotes, e-signatures, Stripe payments, payment plans, scheduling, crew, recurring billing, reviews, and marketing — one tool, no subscription.',
  alternates: { canonical: 'https://letsgetquoted.com/features' },
};

export default function FeaturesPage() {
  return (
    <main className="fx-page">
      <div className="ambient-glow ambient-glow-a" aria-hidden="true" />
      <div className="ambient-glow ambient-glow-b" aria-hidden="true" />

      <div className="marketing-shell">
        <FeatureHero />
      </div>

      {/* The lifecycle wheel + everyday command center — full content width */}
      <FeatureWheelStory />

      <div className="marketing-shell">
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
      </div>
    </main>
  );
}
