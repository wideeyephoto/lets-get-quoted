import FlagshipHome from '@/components/flagship/flagship-home';
import { HOME_FAQS } from '@/lib/home-faqs';
import { cspNonce } from '@/lib/csp-nonce';

export const dynamic = 'force-dynamic';

/**
 * The homepage.
 *
 * A SERVER component wrapping a client one. FlagshipHome has to be a client
 * component — the feature tour is driven by IntersectionObservers and the
 * sticky phone bar reacts to the hero scrolling away — and a client component
 * cannot emit the JSON-LD below, because cspNonce() reads a request header.
 * So the structured data stays here, on the server, and the page it describes
 * is rendered underneath it.
 *
 * The previous homepage is still at /home-classic, noindexed. Rolling back is
 * swapping which component this file renders.
 *
 * Title, description, canonical and OpenGraph all come from the root layout,
 * which already targets '/'. Nothing to restate here.
 */

// Organization and SoftwareApplication describe the business and the product,
// and are unchanged from the previous homepage. FAQPage is built from the same
// array the page renders visibly further down — see the note in
// src/lib/home-faqs.ts about why that matters.
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: "Let's Get Quoted",
      url: 'https://letsgetquoted.com',
      // The current mark. SITE-LOGO-1.png is a previous brand and is what
      // search results were showing.
      logo: 'https://letsgetquoted.com/favicon.png',
    },
    {
      '@type': 'SoftwareApplication',
      name: "Let's Get Quoted",
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description:
        'Contractor business software starting with a free website: build your site, qualify leads, send quotes, schedule work, manage crew, and collect Stripe payments in one connected system.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description:
          'Flex starts at $0/month plus a 1.25% LGQ platform fee. Paid plans lower the fee and add included capacity.',
      },
    },
    {
      '@type': 'FAQPage',
      mainEntity: HOME_FAQS.slice(0, 3).map((faq) => ({
        '@type': 'Question',
        name: faq.q,
        acceptedAnswer: { '@type': 'Answer', text: faq.a },
      })),
    },
  ],
};

export default async function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        nonce={await cspNonce()}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <FlagshipHome />
    </>
  );
}
