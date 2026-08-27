import type { Metadata } from 'next';
import { SiteHeader, SiteFooter } from '@/components/flagship/site-chrome';
import SmsQuoteSimulator from '@/components/marketing/SmsQuoteSimulator';
import styles from '@/app/tools/tools.module.css';
import chromeStyles from '@/components/flagship/flagship.module.css';

export const metadata: Metadata = {
  title: 'Interactive SMS AI Quote & Apple Pay Simulation',
  description:
    'Test drive the Let’s Get Quoted AI inbound quoting engine. Watch how text inquiries qualify trade leads, calculate itemized estimates, and collect Apple Pay deposits.',
  alternates: { canonical: 'https://letsgetquoted.com/demo/sms-quote' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/demo/sms-quote',
    siteName: "Let's Get Quoted",
    title: 'Live SMS AI Inbound Quoting Simulator',
    description:
      'From homeowner text message to Apple Pay deposit in 60 seconds. Test emergency repairs, deck building, and HVAC scenarios.',
  },
};

export default function DemoSmsQuotePage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Let’s Get Quoted SMS AI Inbound Quoting Simulator',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Any',
    offers: {
      '@type': 'Offer',
      price: '0.00',
      priceCurrency: 'USD',
    },
  };

  return (
    <main className={`${styles.page} ${chromeStyles.root}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteHeader />

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroEyebrow}>
            <span>✦</span> Interactive Live Demo
          </div>
          <h1 className={styles.heroTitle}>
            From inbound text to <em>paid deposit</em> in 60 seconds.
          </h1>
          <p className={styles.heroSubtitle}>
            Watch how Let’s Get Quoted AI qualifies homeowner inquiries 24/7, builds transparent itemized quotes, and collects Apple Pay deposits before competitors check their voicemail.
          </p>
        </div>
      </section>

      <section style={{ padding: '0 0 80px' }}>
        <SmsQuoteSimulator />
      </section>

      <SiteFooter />
    </main>
  );
}
