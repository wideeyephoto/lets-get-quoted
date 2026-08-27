import Link from 'next/link';
import type { Metadata } from 'next';
import SiteFooter from '@/components/site-footer';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import ChangelogFeed from './ChangelogFeed';

export const metadata: Metadata = {
  title: 'Changelog & New Features | Let’s Get Quoted',
  description:
    'Explore the latest features, improvements, and updates shipped to Let’s Get Quoted — from Schedule Workbench and AI Receptionists to Permit Intel and GPS Timesheets.',
  alternates: { canonical: 'https://letsgetquoted.com/changelog' },
  openGraph: {
    title: 'Changelog & New Features | Let’s Get Quoted',
    description:
      'Explore the latest features, improvements, and updates shipped to Let’s Get Quoted for trade contractors.',
    url: 'https://letsgetquoted.com/changelog',
    type: 'website',
  },
};

export default function ChangelogPage() {
  return (
    <main className="marketing-shell" id="main-content">
      <div className="ambient-glow ambient-glow-a" aria-hidden="true" />

      <section className="section-block features-hero">
        <div className="section-heading">
          <p className="eyebrow">Product Updates</p>
          <h1>What’s new in Let’s Get Quoted.</h1>
          <p>
            Continuous improvements, powerful new tools, and workflow updates built to help contractors quote faster, dispatch smarter, and get paid with zero friction.
          </p>
        </div>
      </section>

      <section className="section-block">
        <ChangelogFeed />
      </section>

      <section className="cta-band">
        <div className="cta-band-inner">
          <p className="eyebrow">Try everything live</p>
          <h2>Experience the new tools in action.</h2>
          <p>Start free today — explore all features in our interactive demo or create your workspace.</p>
          <div className="actions">
            <a href={APP_SIGNUP_URL} className="btn primary">
              Start free workspace
            </a>
            <Link href="/demo" className="btn secondary">
              Explore 5-minute demo →
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
