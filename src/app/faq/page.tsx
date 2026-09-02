import type { Metadata } from 'next';
import SiteFooter from '@/components/site-footer';
import { cspNonce } from '@/lib/csp-nonce';
import FaqClient, { type FaqGroup } from './FaqClient';

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    'Is it really free, how payments work, whether you need a domain, how the AI estimate works, how to switch, how to export your data, and what happens to refunds.',
  alternates: { canonical: 'https://letsgetquoted.com/faq' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/faq',
    siteName: "Let's Get Quoted",
    title: 'FAQ · Let’s Get Quoted',
    description:
      'Is it really free, how payments work, whether you need a domain, how the AI estimate works, how to switch, how to export your data, and what happens to refunds.',
    images: [
      {
        url: '/product/jobs.webp',
        width: 1600,
        height: 1000,
        alt: 'Let’s Get Quoted FAQ',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FAQ · Let’s Get Quoted',
    description:
      'Is it really free, how payments work, whether you need a domain, how the AI estimate works, how to switch, how to export your data, and what happens to refunds.',
    images: ['/product/jobs.webp'],
  },
};

/** `id` is the URL fragment — stable, and part of the page's contract with
 *  anyone who has ever sent one of these links. Renaming one breaks a link
 *  somebody pasted into a text message; add a new entry instead. */
// Grouped for the page; flattened into FAQPage JSON-LD below. Answers are plain
// text (no markup) so they're valid for both the rendered page and rich results.
const FAQ_GROUPS: FaqGroup[] = [
  {
    id: 'pricing',
    heading: 'Pricing & fees',
    items: [
      {
        id: 'is-it-really-free',
        q: 'Is Let’s Get Quoted really free?',
        a: 'Yes. Flex has a $0 monthly base price and a 1.25% LGQ platform fee on eligible payments collected through LGQ. Paid plans add a subscription, lower that fee, and include more capacity. There is no setup fee.',
      },
      {
        id: 'what-does-it-cost',
        q: 'So what does it cost when I get paid?',
        a: 'Your selected plan sets the LGQ platform fee: Flex 1.25%, Solo 0.50%, Growth 0.25%, or Scale 0.10%. It applies to eligible service subtotal collected through LGQ. Stripe processing and payment-infrastructure costs are separate and paid by the contractor.',
      },
      {
        id: 'contract-or-cancel',
        q: 'Is there a contract or anything to cancel?',
        a: 'There is no contract, and cancelling is something you do yourself: Settings, then Plan & usage, then Cancel plan. Nothing to email and nobody to talk to. It takes effect at renewal rather than cutting you off mid-period — the plan stays open through the end of the period you have already paid for, and after that the workspace moves to Flex, which has no monthly base price and so has nothing to cancel. Paid-plan downgrades work the same way. You can delete your account anytime, subject to payment and record-retention obligations.',
      },
      {
        // Grounded in lib/payments.ts, which creates every refund with
        // reverse_transfer and refund_application_fee both set. This answer is
        // checkable against the code, which is the only kind worth writing.
        id: 'fee-on-a-refund',
        q: 'If I refund a customer, do I get the platform fee back?',
        a: 'Yes. When you refund a payment, our platform fee is refunded with it — in full on a full refund, and proportionally on a partial one. We don’t keep a cut of a transaction that got undone. Stripe’s own processing fee on the original charge is not returned by Stripe; that part is theirs, not ours.',
      },
    ],
  },
  {
    id: 'getting-paid',
    heading: 'Getting paid',
    items: [
      {
        id: 'how-do-i-get-paid',
        q: 'How do I actually get paid?',
        a: 'Payments run on Stripe. Your customer pays by card or bank (ACH) through a secure checkout, and the money pays out straight to your own bank account. We never see or store card numbers.',
      },
      {
        id: 'when-does-money-arrive',
        q: 'How soon does the money reach my bank?',
        a: 'Payouts are made by Stripe on the schedule set for your account, and you can see every expected payout and its date in your own Stripe dashboard. New accounts usually wait a little longer for the first one while Stripe finishes verification. Bank (ACH) payments clear more slowly than cards by nature, so a large ACH payment lands later than a card charge made the same day.',
      },
      {
        id: 'deposits-and-plans',
        q: 'Can customers pay a deposit or spread payments out?',
        a: 'Yes. You can require a deposit before a job is scheduled or before work starts, collect stage/progress payments, and split an approved balance into scheduled, 0%-interest installments charged to a saved card. Whether an arrangement like that creates financing or disclosure obligations depends on your state — worth checking with your own advisor before you offer it.',
      },
      {
        id: 'ach-for-big-jobs',
        q: 'Do you offer bank (ACH) payments for big jobs?',
        a: 'Yes. On larger one-off payments, bank debit is offered automatically because it’s cheaper than card on high amounts — with an automatic fallback to card if bank payment isn’t available.',
      },
      {
        id: 'chargebacks',
        q: 'What happens if a customer disputes a charge?',
        a: 'The dispute is raised with the card network through Stripe, and you’ll see it on the payment with the deadline for responding. You submit your evidence — the signed quote, the job record, photos and the message history are all attached to the job already — and the card network decides. Nobody, including us, can overturn a dispute on your behalf; Stripe’s dispute fee and the disputed amount follow Stripe’s standard terms.',
      },
    ],
  },
  {
    id: 'website-and-setup',
    heading: 'Website & setup',
    items: [
      {
        id: 'do-i-need-to-be-technical',
        q: 'Do I need to be technical or hire a web designer?',
        a: 'No. Pick a professionally designed template, drop in your photos (or use the auto-added stock photos to start), and publish. Most contractors are live in minutes.',
      },
      {
        id: 'do-i-need-a-domain',
        q: 'Do I need my own domain?',
        a: 'No. You get a free yourname.letsgetquoted.com address to launch immediately. When you’re ready, you can connect your own custom domain with guided DNS verification.',
      },
      {
        id: 'can-i-switch',
        q: 'I already have customers and maybe a website — can I switch?',
        // The "keep your existing phone number for texting" claim was removed:
        // texting runs on one platform Messaging Service (TWILIO_MESSAGING_
        // SERVICE_SID, set once in env), so there is no per-account number and
        // no way to bring your own. Somebody choosing this product because
        // their number would carry over would have found out after switching.
        a: 'Yes. You can import your existing customer list and connect your current domain. Texts sent from the platform go out from a Let’s Get Quoted number rather than your own — your existing business line keeps working exactly as it does now for calls.',
      },
      {
        id: 'export-my-data',
        q: 'Can I get my data back out?',
        a: 'Yes, at any time and without asking us. You can export your clients, jobs, quotes and invoices, your service list, and your tax and insights figures as CSV files, plus a single export of everything at once, and a QuickBooks-formatted export if that’s where your books live. It is your data and there is no export fee and no wait.',
      },
      {
        id: 'if-lgq-shuts-down',
        q: 'What happens to my site and my customers if Let’s Get Quoted shuts down?',
        a: 'The three things that matter most are already yours and not ours. Your domain is registered to you, so it can be pointed at another site the same day. Your money is paid out by Stripe into your own bank account under your own Stripe account, so nothing is sitting in an account we control. And your customer, job and invoice data can be exported in full, whenever you like, without contacting us. What you would lose is the software itself and the hosted site at the yourname.letsgetquoted.com address — which is why connecting your own domain early is worth the ten minutes.',
      },
    ],
  },
  {
    id: 'leads-and-customers',
    heading: 'Leads & customers',
    items: [
      {
        id: 'ai-instant-estimate',
        q: 'What is the AI instant estimate?',
        a: 'It’s a conversational estimator on your site that asks a homeowner a few quick questions and returns a realistic price range for their job, 24/7. The range is an automated, nonbinding estimate — not a quote you have seen or approved. Nothing is committed until you send an actual quote. You control how aggressively it prices, and it hands you a qualified lead, flagging the high-value ones so you can respond fast.',
      },
      {
        id: 'can-i-text-customers',
        q: 'Can I text my customers?',
        a: 'Yes. Two-way SMS keeps every conversation in one inbox, with automatic texts for quote approvals, arrival windows, payment requests, and review asks, plus built-in opt-out handling (STOP/START/HELP). Obtaining consent to text your customers remains your responsibility.',
      },
      {
        id: 'crew-access',
        q: 'Can my crew use it too?',
        a: 'Yes. Crew get their own logins and a field view to see their jobs and log hours, materials, and photos on site. Those hours roll up under Crew & Labor so you know what to pay. It is a rollup to pay from, not a payroll service — it does not calculate tax or move money to your crew.',
      },
    ],
  },
  {
    id: 'trust-and-security',
    heading: 'Trust & security',
    items: [
      {
        id: 'is-my-data-safe',
        q: 'Is my data and my customers’ payment info safe?',
        a: 'Card payments are handled entirely by Stripe, so sensitive card data never touches our servers. Every request is encrypted in transit using HTTPS/TLS, and row-level security policies are designed to isolate each contractor’s data from every other account.',
      },
      {
        id: 'how-do-i-get-help',
        q: 'How do I get help if something goes wrong?',
        a: 'Use the contact form for account, payment, or product help. A person reads and answers every message — there is no ticket robot in between. Never send a card number, bank details, or a password; nobody here will ever ask you for them.',
      },
      {
        id: 'how-is-this-different',
        q: 'How is this different from other contractor software?',
        a: 'Most tools make you stitch together a website builder, a payment link, and a separate CRM. Let’s Get Quoted connects your site, leads, quotes, scheduling, and payments in one product, with Flex at $0/month and paid plans for lower fees and more capacity.',
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
      url: `https://letsgetquoted.com/faq#${item.id}`,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  ),
};

export default async function FaqPage() {
  const nonce = await cspNonce();
  return (
    <main className="marketing-shell" id="main-content">
      <script
        type="application/ld+json"
        nonce={nonce}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="ambient-glow ambient-glow-a" aria-hidden="true" />
      <FaqClient groups={FAQ_GROUPS} />
      <SiteFooter />
    </main>
  );
}
