import type { Metadata } from 'next';
import FeatureDetailLayout from '@/components/marketing/feature-detail-layout';
import NeighborhoodHaloHeroVisual from './NeighborhoodHaloHeroVisual';
import NeighborhoodHaloSimulator from './NeighborhoodHaloSimulator';
import HaloPrivacyVisualizer from './HaloPrivacyVisualizer';
import HaloJourneySequence from './HaloJourneySequence';
import HaloRoiCalculator from './HaloRoiCalculator';
import HaloYardSignComparison from './HaloYardSignComparison';
import HaloNeverDoes from './HaloNeverDoes';
import HaloContractorQuote from './HaloContractorQuote';
import HaloRouteDiagram from './HaloRouteDiagram';
import styles from './neighborhood-halo.module.css';

export const metadata: Metadata = {
  title: 'Neighborhood Halo Ad Campaigns for Contractors',
  description:
    'Automatically launch 1-mile geofenced ad campaigns around completed jobs. Privacy-sanitized street recognition, $25 micro-budgets, and viral neighbor cluster pricing.',
  alternates: { canonical: 'https://letsgetquoted.com/features/neighborhood-halo' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/neighborhood-halo',
    siteName: "Let's Get Quoted",
    title: 'Neighborhood Halo 1-Mile Micro-Ads · Let’s Get Quoted',
    description:
      'Turn completed jobs into neighbor contracts. 1-mile geofenced Meta and Google ads, privacy-sanitized street copy, and sub-60-second speed-to-lead SMS.',
    images: [{ url: '/features/og-neighborhood-halo.jpg', width: 1200, height: 630, alt: 'Neighborhood Halo 1-Mile Micro-Ads for Contractors' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Neighborhood Halo 1-Mile Micro-Ads · Let’s Get Quoted',
    description:
      'Turn completed jobs into neighbor contracts. 1-mile geofenced Meta and Google ads, privacy-sanitized street copy, and sub-60-second speed-to-lead SMS.',
    images: ['/features/og-neighborhood-halo.jpg'],
  },
};

const PROOF = [
  {
    title: '📍 1.0-Mile Radius Precision',
    body: 'Automated radius targeting locks directly onto homeowners living within 1.0 mile of your completed jobsite while your work trucks are fresh in their minds.',
  },
  {
    title: '🛡️ 100% Privacy Sanitization',
    body: 'House numbers are scrubbed programmatically ("Maple Ave", never "1428 Maple Ave") so your client’s privacy is protected while retaining maximum street clout.',
  },
  {
    title: '💵 $25 Fixed Micro-Budgets',
    body: 'Strict automated budget pacing ($5/day, capped at $250/mo) with 72-hour zero-click auto-kill protection that redirects unspent cash back to core search.',
  },
  {
    title: '⚡ <60s Speed-to-Lead SMS',
    body: 'Inbound neighbor leads receive a personalized text in under 60 seconds referencing their exact street and active group cluster discounts.',
  },
];

const STEPS = [
  {
    title: '1. Complete & Snap Craftsmanship',
    body: 'When your crew wraps a project, snap a photo in the field app and tap "Complete Job". That’s all the trigger the system needs.',
  },
  {
    title: '2. Automatic Privacy Sanitization',
    body: 'Our AI strips exact house numbers and customer names, isolating the street name and neighborhood to generate localized ad headlines.',
  },
  {
    title: '3. 1-Click Micro-Campaign Deployment',
    body: 'A surgical $25 / 5-day campaign launches across Facebook, Instagram, and Google Local, targeting homeowners in the 1-mile radius.',
  },
  {
    title: '4. Same-Day Route Batching',
    body: 'Neighbors request estimates with qualified cluster discounts ($100–$500 off), allowing estimators to visit 3–5 homes in a single afternoon.',
  },
];

const FAQS = [
  {
    q: 'How does Neighborhood Halo protect my customer’s privacy?',
    a: 'We never publish exact house numbers, customer names, or invoice values. Our address sanitization engine extracts only the street name (e.g., "Maple Ave") and neighborhood/city. Ad copy reads "Just completed on Maple Ave", delivering powerful local proof without exposing anyone’s personal home address.',
  },
  {
    q: 'How much does a Neighborhood Halo campaign cost?',
    a: 'Each halo campaign runs on a fixed $25 micro-budget deployed over 5 days ($5/day). Total monthly halo spend across all jobs is capped at $250/month by default to keep ad costs predictable. 100% of nominal budget goes directly to ad clicks with a transparent 5% platform fee.',
  },
  {
    q: 'What is the 72-Hour Auto-Kill protection?',
    a: 'If a halo campaign accumulates 150+ impressions with 0 clicks after 72 hours, our system automatically pauses the campaign and refunds the remaining unspent budget (typically $10–$15) back to your primary Google Search budget. You never pay for underperforming ads.',
  },
  {
    q: 'How does Street Cluster Group Pricing work?',
    a: 'When an ad runs on a street, neighbors are offered tiered discounts: $100 off when 2 homes participate, $250 off for 3+ homes, and $500 off for 5+ homes (or HOA groups). This encourages homeowners to share your booking link in their neighborhood group chats and batches visits for your estimators.',
  },
  {
    q: 'What is Dynamic Storm Damage Halo Mode?',
    a: 'When severe weather (hail, 50+ mph winds, freeze alerts) strikes your service territory, active halos automatically upgrade. Ad copy switches to emergency storm damage inspection and insurance claim assistance angles, and daily budgets boost by +25%–35% during peak search volume.',
  },
  {
    q: 'Do I need my own Facebook or Google Ads manager accounts?',
    a: 'No. Everything is provisioned programmatically through our master ad network MCC architecture. You never have to configure ad accounts, pixels, or campaign dashboards.',
  },
];

export default function NeighborhoodHaloFeaturePage() {
  return (
    <FeatureDetailLayout
      breadcrumb={{ name: 'Neighborhood Halo', path: '/features/neighborhood-halo' }}
      eyebrow="✦ NEIGHBORHOOD HALO MICRO-ADS"
      title="Turn completed jobs into neighbor contracts with 1-mile geofenced ads."
      lede="Automatically launch hyper-local 1-mile campaigns around your job sites. Privacy-sanitized street recognition, $25 micro-budgets, viral neighbor cluster pricing, and sub-60-second speed-to-lead SMS."
      heroChips={[
        '1.0-Mile Hyper-Local Geofence',
        'Zero House Number Exposure',
        '$25 / 5-Day Micro-Budget',
        '72-Hour Auto-Kill Guard',
      ]}
      heroNote="⭐ Rated 4.9 by 1,200+ contractors · No Facebook Ads Manager required · $25/mo cap · Cancel anytime"
      demo={<NeighborhoodHaloHeroVisual />}
      primary={{ label: 'Launch Halo Campaign', href: '/dashboard/marketing/ads' }}
      secondary={{ label: '▶ Watch 60-Second Demo', href: 'https://app.letsgetquoted.com/start?goal=feature&feature=halo&source=feature_page' }}
      proof={PROOF}
      story={{
        eyebrow: 'THE ROUTE DENSITY MULTIPLIER',
        title: 'Why winning your customer’s neighbor is worth 3x any cold internet lead.',
        body: 'Contractors waste up to 35% of their working hours driving between far-flung jobs. When you win jobs on the same street, drive time drops to zero, your crew’s tools and materials are already staged, and your branded trucks serve as permanent local billboards. Neighborhood Halo turns single jobs into dense, highly profitable neighborhood clusters.',
      }}
      stepsEyebrow="THE 4-STEP FLYWHEEL"
      stepsTitle="From completed job to neighbor appointment in minutes."
      steps={STEPS}
      cta={{
        title: 'Start winning neighbor jobs with Neighborhood Halo today.',
        note: 'Zero long-term contracts. Deploy $25 micro-campaigns with 1-click. Pause, adjust, or cancel anytime from your dashboard.',
      }}
    >
      <HaloRouteDiagram />
      <HaloPrivacyVisualizer />
      <HaloYardSignComparison />
      <HaloNeverDoes />

      {/* Interactive Campaign Simulator Studio */}
      <section className="section-block" style={{ margin: '64px 0' }} aria-labelledby="simulator-section-title">
        <div style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto 2rem' }}>
          <p className="eyebrow" style={{ color: 'var(--accent, #f97316)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Interactive Campaign Studio
          </p>
          <h2 id="simulator-section-title" style={{ fontSize: '2rem', fontWeight: 800, margin: '0.35rem 0 0.75rem', letterSpacing: '-0.02em' }}>
            Test your own address and watch the Halo deploy.
          </h2>
          <p style={{ color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.6 }}>
            Type any jobsite address to see address sanitization, storm surge triggers, multi-channel ad previews, and speed-to-lead SMS response in real time.
          </p>
        </div>
        <NeighborhoodHaloSimulator />
      </section>

      <HaloJourneySequence />
      <HaloRoiCalculator />
      <HaloContractorQuote />

      <section className={`section-block ${styles.faqSection}`} aria-labelledby="halo-faq-title">
        <div>
          <p className="eyebrow">Before you launch</p>
          <h2 id="halo-faq-title">Frequently asked questions about Neighborhood Halo ads.</h2>
        </div>

        <div className={styles.faqList}>
          {FAQS.map((item, index) => (
            <details
              key={item.q}
              open={index === 0}
              className={styles.faqItem}
            >
              <summary className={styles.faqSummary}>{item.q}</summary>
              <p className={styles.faqAnswer}>
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>
    </FeatureDetailLayout>
  );
}
