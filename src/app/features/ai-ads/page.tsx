import type { Metadata } from 'next';
import FeatureDetailLayout from '@/components/marketing/feature-detail-layout';
import AiAdsSimulator from './AiAdsSimulator';
import ClosedLoopFlywheel from './ClosedLoopFlywheel';
import MultiChannelShieldGrid from './MultiChannelShieldGrid';

export const metadata: Metadata = {
  title: 'AI Advertising Autopilot for Contractors',
  description:
    'Launch Google Search, Meta, and Retargeting campaigns in 60 seconds. Zero agency markups, 5% transparent management fee, and closed-loop offline conversion feedback.',
  alternates: { canonical: 'https://letsgetquoted.com/features/ai-ads' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/ai-ads',
    siteName: "Let's Get Quoted",
    title: 'AI Advertising Autopilot for Contractors · Zero Agency Markup',
    description:
      'Launch profitable Google & Meta ad campaigns in 60 seconds. Pre-built trade keywords, automated copy generation, weather surge boosts, and instant speed-to-lead auto-SMS.',
    images: [{ url: '/features/og-ai-ads.jpg', width: 1200, height: 630, alt: 'AI Advertising Autopilot for Contractors' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Advertising Autopilot for Contractors · Zero Agency Markup',
    description:
      'Launch profitable Google & Meta ad campaigns in 60 seconds. Pre-built trade keywords, automated copy generation, weather surge boosts, and instant speed-to-lead auto-SMS.',
    images: ['/features/og-ai-ads.jpg'],
  },
};

const PROOF = [
  {
    title: '100% Direct Ad Spend',
    body: '100% of your nominal ad budget goes straight to ad network clicks (Google / Meta). We itemize a flat 5% platform management fee with zero agency markups.',
  },
  {
    title: '⚡ 60s Speed-to-Lead Auto-SMS',
    body: 'AI instantly responds to incoming ad leads within 60 seconds with a personalized, trade-specific text message to double your appointment close rate.',
  },
  {
    title: '🛡️ Zero-Config Smart Shield',
    body: 'Includes automatic Weather Surge (+25% budget during storms/freezes), Capacity Guard (auto-pauses when fully booked), and competitor keyword blocking.',
  },
  {
    title: '🔄 Closed-Loop Conversion Sync',
    body: 'When you mark a lead won, the signed quote amount syncs directly back to Google Ads Smart Bidding to train Google’s AI to target higher-ticket jobs.',
  },
];

const STEPS = [
  {
    title: 'Pick Your Trade & Smart Bundle',
    body: 'Choose Launch ($168/wk), Growth ($315/wk), or Scale & Dominate ($588/wk)—or start with a $250 Auto-Refill Wallet. All keywords, negatives, and character-compliant copy are pre-configured.',
  },
  {
    title: '1-Click Launch on Stripe',
    body: 'Activate with a single click. Weekly drip funding or auto-refill billing keeps your upfront cash outlay low with zero long-term contracts.',
  },
  {
    title: 'Dynamic Message-Match Intake',
    body: 'When homeowners click your search ad, your website headline dynamically updates to match their exact search query, increasing form submissions.',
  },
  {
    title: 'Closed-Loop Revenue Reporting',
    body: 'Track your live ROAS multiplier in real-time. Daily spend syncs from Google Ads API and won job revenue feeds Google’s bidding engine.',
  },
];

const FAQS = [
  {
    q: 'Why do you use Weekly Drip Billing and Auto-Refill Wallets?',
    a: 'Weekly drip billing ($168–$588/week) lowers your upfront cash commitment by over 75% without starving your campaign momentum. We deploy your ad spend into Google & Meta daily, billing your card once every 7 days. Alternatively, our Auto-Refill Wallet lets you start with a $250 deposit and strict monthly ceiling.',
  },
  {
    q: 'How is this different from hiring a local marketing agency?',
    a: 'Traditional marketing agencies charge $2,000 to $3,500/month in fixed management retainers and take weeks to launch. Let’s Get Quoted provides fully automated multi-channel campaigns for a transparent 5% platform fee with zero long-term commitments.',
  },
  {
    q: 'Do I need my own Google Ads or Meta Ads manager account?',
    a: 'No. Everything is programmatically provisioned and managed under our Master MCC architecture. You never have to log into Google Ads Manager or navigate complex ad dashboards.',
  },
  {
    q: 'How does closed-loop revenue optimization work?',
    a: 'When you mark an estimate won or collect payment in Let’s Get Quoted, our system automatically uploads the offline conversion with the signed dollar amount and visitor gclid back to Google Ads, training Smart Bidding algorithms to target your most profitable jobs.',
  },
  {
    q: 'What happens when our crews are booked out with work?',
    a: 'Our built-in Capacity Guard automatically pauses ad bidding the moment you toggle your site status to "Fully Booked", preventing wasted ad spend when you can’t take on new jobs.',
  },
  {
    q: 'Can I cancel or pause my advertising budget at any time?',
    a: 'Yes. You can upgrade, downgrade, pause, or cancel your ad bundle anytime directly from your dashboard with one click via the Stripe Customer Portal.',
  },
];

export default function AiAdsFeaturePage() {
  return (
    <FeatureDetailLayout
      breadcrumb={{ name: 'AI Ads Autopilot', path: '/features/ai-ads' }}
      eyebrow="✦ AI ADVERTISING AUTOPILOT"
      title="Google & Meta search ads that win high-ticket jobs. Zero agency markups."
      lede="Launch profitable Google Search, Meta Feed, and Retargeting campaigns in 60 seconds. Our AI handles keyword research, negative scrubbing, compliant copy, and real-time offline conversion feedback — for a transparent 5% management fee."
      heroChips={[
        'Zero Agency Retainers',
        '5% Transparent Fee',
        'Speed-to-Lead Auto-SMS',
        'Weather Surge Included',
      ]}
      demo={<AiAdsSimulator />}
      primary={{ label: 'Launch My Campaign', href: '/dashboard/marketing/ads' }}
      secondary={{ label: 'Start Free Platform Trial', href: 'https://app.letsgetquoted.com/start?goal=build_site&source=feature_page' }}
      proof={PROOF}
      story={{
        eyebrow: 'HOW THE AUTOPILOT WORKS',
        title: 'From Google search click to signed contract in 4 automated steps.',
        body: 'Our AI engine eliminates agency overhead while keeping you in full control of your ad spend and lead flow.',
      }}
      stepsEyebrow="THE 4-STEP LAUNCH"
      stepsTitle="From setup to closed-loop revenue in minutes."
      steps={STEPS}
      cta={{
        title: 'Put AI Advertising Autopilot to work for your business.',
        note: 'Zero long-term contracts. 100% direct ad network spend with a flat 5% management fee. Upgrade, pause, or cancel anytime.',
      }}
    >
      <ClosedLoopFlywheel />
      <MultiChannelShieldGrid />

      <section className="section-block" aria-labelledby="ads-faq-title" style={{ margin: '48px 0' }}>
        <div>
          <p className="eyebrow">Before you launch</p>
          <h2 id="ads-faq-title">Frequently asked questions about AI Advertising Autopilot.</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
          {FAQS.map((item, index) => (
            <details
              key={item.q}
              open={index === 0}
              style={{
                padding: '1rem',
                background: 'var(--bg-surface-elevated, #f8fafc)',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle, rgba(0,0,0,0.08))',
              }}
            >
              <summary style={{ fontWeight: 700, cursor: 'pointer', fontSize: '1rem' }}>{item.q}</summary>
              <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary, #475569)', lineHeight: 1.5, fontSize: '0.9375rem' }}>
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>
    </FeatureDetailLayout>
  );
}
