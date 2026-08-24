import type { Metadata } from 'next';
import { SiteHeader, SiteFooter } from '@/components/flagship/site-chrome';
import SiteCustomizerSandbox from '@/components/marketing/SiteCustomizerSandbox';
import styles from '@/app/tools/tools.module.css';

export const metadata: Metadata = {
  title: 'Instant Website Builder Sandbox & Customizer',
  description:
    'Test drive the Let’s Get Quoted contractor website builder. Customize your business name, trade, theme, and color palette with live real-time preview.',
  alternates: { canonical: 'https://letsgetquoted.com/demo/customize' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/demo/customize',
    siteName: "Let's Get Quoted",
    title: 'Live Contractor Website Customizer Sandbox',
    description:
      'Customize your trade contractor website in seconds: choose your trade, theme, and colors with live instant preview.',
  },
};

export default function DemoCustomizePage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Let’s Get Quoted Contractor Website Customizer',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Any',
    offers: {
      '@type': 'Offer',
      price: '0.00',
      priceCurrency: 'USD',
    },
  };

  return (
    <main className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteHeader />

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroEyebrow}>
            <span>✦</span> Interactive Live Sandbox
          </div>
          <h1 className={styles.heroTitle}>
            Build your contractor website in <em>60 seconds</em>.
          </h1>
          <p className={styles.heroSubtitle}>
            Type your business name, select your trade, and pick your favorite theme. Watch your custom high-converting website generate right before your eyes.
          </p>
        </div>
      </section>

      <section style={{ padding: '0 0 80px' }}>
        <SiteCustomizerSandbox />
      </section>

      <SiteFooter />
    </main>
  );
}
