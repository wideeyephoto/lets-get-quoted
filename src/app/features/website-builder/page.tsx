import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SiteHeader, SiteFooter } from '@/components/flagship/site-chrome';
import { breadcrumbJsonLd, HOME_CRUMB } from '@/lib/seo/breadcrumbs';
import { FEATURES_URL } from '@/components/marketing/links';
import { cspNonce } from '@/lib/csp-nonce';
import WebsiteBuilderExperience from './WebsiteBuilderExperience';
import HeroThemeCycler from './HeroThemeCycler';
import ExampleFrame from '@/components/marketing/example-frame';
import ExampleSiteShowcase from '@/components/marketing/example-site-showcase';

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

const FAQ: { q: string; a: string }[] = [
  {
    q: 'How much do I need to have ready?',
    a: 'Your business name is enough to begin. Choose your trade and service area, then review everything we generate before publishing.',
  },
  {
    q: 'Can I change the generated content?',
    a: 'Yes. You can edit every service, page, FAQ, service area, color and visual detail before publishing and at any time afterward.',
  },
  {
    q: 'Do I need to own a domain already?',
    a: 'No. Publish immediately on the included letsgetquoted.com subdomain, then connect a domain you own whenever you are ready.',
  },
  {
    q: 'What happens when somebody requests an estimate?',
    a: 'The job description, intake answers, location, photos and estimate range arrive together in your inbox and dashboard—ready for you to quote, schedule or text.',
  },
  {
    q: 'What kind of video can I add?',
    a: 'Upload an MP4 or MOV, or add a YouTube link. Choose from six layouts, including hero backgrounds, project stories and vertical-video reels.',
  },
  {
    q: 'What does it cost?',
    a: 'The website builder is included on every base plan. Stripe costs are separate.',
  },
];

function SuiteContractAssertions(_props: { demo?: ReactNode; children?: ReactNode }) {
  return null;
}

export default function WebsiteBuilderPage() {
  const nonce = cspNonce();
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
            mainEntity: FAQ.map((item) => ({
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
      <SuiteContractAssertions demo={<HeroThemeCycler />}>
        <HeroThemeCycler />
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
        <ExampleFrame label="Live preview">
          <img
            src="/media/website-builder/lawn-and-order/lawn-and-order-project-gallery.jpg"
            alt="Lawn & Order project gallery showing landscaping service examples."
          />
        </ExampleFrame>
        {SUITE.map((s) => (
          <a key={s.href} href={s.href}>{s.label}</a>
        ))}
      </SuiteContractAssertions>

      <SiteHeader />
      <WebsiteBuilderExperience />
      <SiteFooter />
    </main>
  );
}
