import Link from 'next/link';
import type { Metadata } from 'next';
import SiteFooter from '@/components/site-footer';
import { cspNonce } from '@/lib/csp-nonce';

export const metadata: Metadata = {
  title: 'FAQ — Let’s Get Quoted',
  description:
    'Answers to the common questions about Let’s Get Quoted: is it really free, how payments work, whether you need a domain, how the AI estimate works, and how your data is kept safe.',
  alternates: { canonical: 'https://letsgetquoted.com/faq' },
};

type QA = { q: string; a: string };
type FaqGroup = { heading: string; items: QA[] };

// Grouped for the page; flattened into FAQPage JSON-LD below. Answers are plain
// text (no markup) so they're valid for both the rendered page and rich results.
const FAQ_GROUPS: FaqGroup[] = [
  {
    heading: 'Pricing & fees',
    items: [
      {
        q: 'Is Let’s Get Quoted really free?',
        a: 'Yes. There’s no monthly subscription and no setup fee. You only pay a platform fee when a homeowner actually pays you through the platform — nothing when you’re just building your site, sending quotes, or managing jobs.',
      },
      {
        q: 'So what does it cost when I get paid?',
        a: 'A platform fee that starts at 1.25% and drops to as low as 0.65% as your yearly volume grows, plus standard Stripe processing (about 2.9% + 30¢ per card charge). On a $1,000 card payment at the starting tier that’s roughly $12.50 platform fee plus Stripe’s processing — and the platform rate only gets lower from there.',
      },
      {
        q: 'Is there a contract or anything to cancel?',
        a: 'No contract and no subscription to cancel. Because you’re only charged when you collect a payment, there’s nothing running in the background. You can delete your account anytime.',
      },
    ],
  },
  {
    heading: 'Getting paid',
    items: [
      {
        q: 'How do I actually get paid?',
        a: 'Payments run on Stripe. Your customer pays by card or bank (ACH) through a secure checkout, and the money pays out straight to your own bank account. We never see or store card numbers.',
      },
      {
        q: 'Can customers pay a deposit or spread payments out?',
        a: 'Yes. You can require a deposit before a job is scheduled or before work starts, collect stage/progress payments, and offer payment plans — a deposit plus fixed, 0%-interest installments that auto-charge a saved card. Payment plans are your own installments, not third-party lending.',
      },
      {
        q: 'Do you offer bank (ACH) payments for big jobs?',
        a: 'Yes. On larger one-off payments, bank debit is offered automatically because it’s cheaper than card on high amounts — with an automatic fallback to card if bank payment isn’t available.',
      },
    ],
  },
  {
    heading: 'Website & setup',
    items: [
      {
        q: 'Do I need to be technical or hire a web designer?',
        a: 'No. Pick a professionally designed template, drop in your photos (or use the auto-added stock photos to start), and publish. Most contractors are live in minutes.',
      },
      {
        q: 'Do I need my own domain?',
        a: 'No. You get a free yourname.letsgetquoted.com address to launch immediately. When you’re ready, you can connect your own custom domain with guided DNS verification.',
      },
      {
        q: 'I already have customers and maybe a website — can I switch?',
        a: 'Yes. You can import your existing customer list, connect your current domain, and keep your existing phone number for texting while routing web contact through your new site.',
      },
    ],
  },
  {
    heading: 'Leads & customers',
    items: [
      {
        q: 'What is the AI instant estimate?',
        a: 'It’s a conversational estimator on your site that asks a homeowner a few quick questions and returns a realistic price range for their job, 24/7. You control how aggressively it prices, and it hands you a qualified lead — flagging the high-value ones so you can respond fast.',
      },
      {
        q: 'Can I text my customers?',
        a: 'Yes. Two-way SMS keeps every conversation in one inbox, and the platform sends appointment reminders, review requests, and payment updates — all with built-in consent handling (STOP/START/HELP).',
      },
      {
        q: 'Can my crew use it too?',
        a: 'Yes. Crew get their own logins and a field view to see their jobs and log hours, materials, and photos on site. Those hours roll up under Crew & Labor so you know what to pay. It is a rollup to pay from, not a payroll service — it does not calculate tax or move money to your crew.',
      },
    ],
  },
  {
    heading: 'Trust & security',
    items: [
      {
        q: 'Is my data and my customers’ payment info safe?',
        a: 'Card payments are handled entirely by Stripe, so sensitive card data never touches our servers. Every request is encrypted in transit, and each contractor’s data is walled off from every other account.',
      },
      {
        q: 'How is this different from other contractor software?',
        a: 'Most tools make you stitch together a website builder, a payment link, and a separate CRM — each with its own monthly bill. Let’s Get Quoted is one connected tool for your site, leads, quotes, scheduling, and payments, with no subscription. You can compare it side by side on the home page.',
      },
    ],
  },
];

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_GROUPS.flatMap((group) =>
    group.items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  ),
};

export default function FaqPage() {
  return (
    <main className="marketing-shell">
      <script type="application/ld+json" nonce={cspNonce()} dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <div className="ambient-glow ambient-glow-a" aria-hidden="true" />

      <section className="section-block features-hero">
        <div className="section-heading">
          <p className="eyebrow">Questions, answered</p>
          {/* The page's own title, so it's the h1 — every other heading here is
              a section under it. Sized by .section-heading h1, not the global. */}
          <h1>Everything you’re wondering, before you sign up.</h1>
          <p>No subscription, no catch — here’s exactly how Let’s Get Quoted works, what it costs, and how you get paid.</p>
        </div>
        <div className="actions">
          <Link href="/login" className="btn primary">Create Free Account</Link>
          <Link href="/demo" className="btn secondary">Explore the demo &mdash; no signup</Link>
        </div>
      </section>

      {FAQ_GROUPS.map((group) => (
        <section className="section-block" key={group.heading}>
          <div className="section-heading">
            <p className="eyebrow">{group.heading}</p>
          </div>
          <div className="faq-list">
            {group.items.map((item) => (
              <details className="faq-item" key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      ))}

      <section className="cta-band">
        <div className="cta-band-inner">
          <p className="eyebrow">Still have a question?</p>
          <h2>The fastest way to see it is to try it.</h2>
          <p>Start free — you only pay when a homeowner pays you.</p>
          <div className="actions">
            <Link href="/login" className="btn primary">Create Free Account</Link>
            <Link href="/#wheel" className="btn secondary">Browse all features</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
