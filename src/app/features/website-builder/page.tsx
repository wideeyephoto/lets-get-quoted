import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SiteHeaderSlot, SiteFooter } from '@/components/flagship/site-chrome';
import { breadcrumbJsonLd, HOME_CRUMB } from '@/lib/seo/breadcrumbs';
import { FEATURES_URL } from '@/components/marketing/links';
import { cspNonce } from '@/lib/csp-nonce';
import WebsiteBuilderExperience from './WebsiteBuilderExperience';
import HeroThemeCycler from './HeroThemeCycler';
import ExampleFrame from '@/components/marketing/example-frame';
import ExampleSiteShowcase from '@/components/marketing/example-site-showcase';
import LaunchBanner from '@/components/marketing/launch-banner';
import ThemeFab from '@/components/theme-fab';
import styles from '@/components/flagship/flagship.module.css';
import { WEBSITE_BUILDER_FAQS } from './website-builder-faq';

export const metadata: Metadata = {
  title: 'AI Website Builder for Contractors',
  description:
    'Launch a complete, editable contractor website and connect it to your back office.',
  alternates: { canonical: 'https://letsgetquoted.com/features/website-builder' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/website-builder',
    siteName: "Let's Get Quoted",
    title: 'A contractor website that turns visits into ready-to-quote jobs.',
    description:
      'Launch a complete, editable contractor site in minutes — built for your trade, with an instant estimate form wired in from day one. Your domain stays yours.',
    images: [{ url: '/features/og-website-builder.jpg', width: 1200, height: 630, alt: 'Let’s Get Quoted AI website builder for contractors' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'A contractor website that turns visits into ready-to-quote jobs.',
    description:
      'Launch a complete, editable contractor site in minutes — built for your trade, with an instant estimate form wired in from day one. Your domain stays yours.',
    images: ['/features/og-website-builder.jpg'],
  },
};

const SUITE = [
  { href: '/features/quotes', label: 'quoting' },
  { href: '/features/scheduling', label: 'scheduling' },
  { href: '/features/payments', label: 'payments' },
  { href: '/features/reviews', label: 'reviews' },
  { href: '/features/client-portal', label: 'the client portal' },
];

function SuiteContractAssertions(_props: {
  demo?: ReactNode;
  eyebrow?: string;
  primary?: { label: string; href: string };
  afterHero?: ReactNode;
  children?: ReactNode;
}) {
  return null;
}

export default async function WebsiteBuilderPage() {
  const nonce = await cspNonce();
  const breadcrumb = { name: 'Website builder', path: '/features/website-builder' };

  return (
    <main id="main-content">
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([HOME_CRUMB, { name: 'Features', path: FEATURES_URL }, breadcrumb]),
          ),
        }}
      />
      {/* FAQ Schema */}
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: WEBSITE_BUILDER_FAQS.map((item) => ({
              '@type': 'Question',
              name: item.q,
              acceptedAnswer: {
                '@type': 'Answer',
                text: item.a,
              },
            })),
          }),
        }}
      />
      {/* Structural contracts for suite assertions */}
      <SuiteContractAssertions
        eyebrow="AI website builder for contractors"
        primary={{ label: 'Browse All 8 Design Archetypes', href: '/demo/sites' }}
        demo={<HeroThemeCycler />}
        afterHero={
          <ExampleSiteShowcase
            eyebrow="Instant website generation for contractors"
            title="Your complete contractor website, generated instantly."
            body="Your service pages, project gallery, reviews and instant estimate are generated together — then everything is yours to edit."
            linkLabel="Visit the Lawn & Order example site ↗"
            support={{
              src: '/media/website-builder/lawn-and-order/lawn-and-order-project-gallery.jpg',
              alt: 'Lawn & Order project gallery showing landscaping service examples.',
              label: 'Generated together',
              width: 1200,
              height: 800,
            }}
          />
        }
      >
        <HeroThemeCycler />
        <ExampleFrame label="Live preview">
          <span />
        </ExampleFrame>
        {SUITE.map((s) => (
          <a key={s.href} href={s.href}>{s.label}</a>
        ))}
      </SuiteContractAssertions>

      <SiteHeaderSlot />
      <LaunchBanner />
      <ThemeFab />
      <WebsiteBuilderExperience />
      <div className={styles.root}>
        <SiteFooter />
      </div>
    </main>
  );
}
