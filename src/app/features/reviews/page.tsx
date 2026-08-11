import type { Metadata } from 'next';
import ExampleFrame from '@/components/marketing/example-frame';
import SuiteFeaturePage, {
  Panel,
  PanelActions,
  PanelHead,
  PanelNote,
  PanelRows,
} from '@/components/marketing/suite-feature-page';
import { FEE_TIERS, STRIPE_PROCESSING_NOTE } from '@/lib/pricing';

export const metadata: Metadata = {
  title: 'Review Requests and Rebooking',
  description:
    'Ask every customer for a review the honest way — public or private, never screened by star rating — then bring past customers back with rebook invites.',
  alternates: { canonical: 'https://letsgetquoted.com/features/reviews' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/reviews',
    siteName: "Let's Get Quoted",
    title: 'More reviews, without gaming the reviews.',
    description:
      'Every customer is offered the same two things: post publicly, or tell you privately. No screening by star rating — that breaks Google’s rules and risks your profile.',
    images: [{ url: '/features/og-reviews.jpg', width: 1200, height: 630, alt: 'Review requests and customer marketing for contractors' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'More reviews, without gaming the reviews.',
    description:
      'Every customer is offered the same two things: post publicly, or tell you privately. No screening by star rating — that breaks Google’s rules and risks your profile.',
    images: ['/features/og-reviews.jpg'],
  },
};

export default function ReviewsFeaturePage() {
  return (
    <SuiteFeaturePage
      eyebrow="Reviews + growth"
      title={
        <>
          More reviews, <em>without gaming the reviews.</em>
        </>
      }
      lede="The request goes out when the job is actually finished, and every customer is offered the same two things: post a public review, or tell you privately. Then the customers you already have become the ones you book next."
      heroNote="No review gating. The routes offered do not depend on how happy somebody is, because screening by star rating breaks Google’s rules and puts your profile at risk."
      primary={{ label: 'Open the live reviews screen', href: '/demo/reviews' }}
      demo={
        <ExampleFrame
          label="What a customer is offered after the job wraps."
          note="Invented customer. The rule is real and enforced in code: the two routes are offered together, in the same order, whatever the customer thinks of you."
        >
          <Panel>
            <PanelHead title="Review request · sent Wed 9:00 AM" pill="Job complete" tone="good" />
            <PanelRows
              rows={[
                { label: 'Option one', value: 'Post a public review' },
                { label: 'Option two', value: 'Tell us privately' },
                { label: 'Shown only to happy customers', value: 'Neither', strong: true },
              ]}
            />
            <PanelNote>
              A low rating cannot close the public route and a high one cannot hide the private
              one. The only thing a rating changes is how the thank-you reads back.
            </PanelNote>
            <PanelActions labels={['See response rate', 'Invite them back']} />
          </Panel>
        </ExampleFrame>
      }
      proof={[
        { title: 'No star-rating gating', body: 'Both routes, every customer, every time.' },
        { title: 'Sent when work is done', body: 'Triggered by the job, not by a reminder.' },
        { title: 'Rebook the ones due', body: 'One tap, or the whole batch.' },
        { title: 'Consent handled', body: 'STOP, START, HELP and opt-out enforced.' },
      ]}
      story={{
        eyebrow: 'The cheapest job you will win this year',
        title: 'The customer who already paid you is the easiest one to book again.',
        body: 'Winning a stranger costs advertising. Booking somebody whose property, history and card you already hold costs a text. Reviews and marketing sit together here for that reason: the review request, the rebook invite and the campaign all read from the same customer record, so “everyone we did a gutter clean for last autumn” is a list rather than an afternoon in a spreadsheet.',
      }}
      benefits={[
        {
          title: 'Ask in a way that cannot backfire',
          body: 'Every customer sees both routes in the same order. Nothing is conditioned on how they rate you — which is what keeps your Google profile safe as well as being the honest thing to do.',
        },
        {
          title: 'Know whether it is working',
          body: 'Invites sent, response rate, average rating, the star distribution and every piece of private feedback in one place. Your Google reviews can also be pulled onto your own site with proper attribution.',
        },
        {
          title: 'Bring the past customers back',
          body: 'Campaigns to everyone, past, repeat or lapsed customers, with live reach counts before you send. Rebook invites for the ones who are due. All of it threaded into the same two-way SMS inbox.',
        },
      ]}
      stepsEyebrow="From finished job to the next one"
      stepsTitle="Four steps that run off the work you already did."
      steps={[
        {
          title: 'Finish the job',
          body: 'That is the trigger. The request goes out when the work is actually complete, not on a timer that fires while the crew is still on site.',
        },
        {
          title: 'Offer both routes',
          body: 'Public review or a private word, together. What comes back privately is feedback you can act on before it becomes a public one.',
        },
        {
          title: 'Read the dashboard',
          body: 'Response rate and distribution tell you whether asking is working. Import the public ones onto your website so the proof lives where buyers are.',
        },
        {
          title: 'Invite them back',
          body: 'Rebook the customers who are due, or run a campaign at a segment. Consent and opt-outs are enforced for you, so a list cannot quietly become a complaint.',
        },
      ]}
      catalog={['reviews', 'marketing']}
      catalogEyebrow="What it sends, and what it tracks"
      catalogTitle="Reviews and the marketing that follows them."
      catalogNote="Two areas of the product on one page because they are one motion: the finished job earns the review, and the same customer record is what makes the next invitation worth sending."
      faq={[
        {
          q: 'Can I only ask happy customers for a public review?',
          a: 'No, and the product will not let you. Every customer is offered a public review and a private word, in the same order, regardless of rating — the routing function is not even given the rating. Screening by star rating breaks Google’s policies and risks your profile, so it is not a setting you can turn on.',
        },
        {
          q: 'What happens to a bad review before it is public?',
          a: 'Nothing is intercepted. The private option exists so somebody who wants to tell you directly has a way to, and that feedback lands in your dashboard — but it never replaces or hides the public route.',
        },
        {
          q: 'Do the reviews show on my website?',
          a: 'Your Google reviews can be imported onto your site with proper attribution, and there is an optional aggregate-star badge that also emits rich-result markup for search. Both are yours to switch off.',
        },
        {
          q: 'How do you keep me out of trouble with texting?',
          a: 'STOP, START and HELP are handled, opt-outs are enforced, unsubscribes are suppressed from future sends and delivery is tracked. A campaign shows you its live reach count before it goes, so you know what you are actually sending and to how many people.',
        },
        {
          q: 'Is there a charge per review request or campaign?',
          a: `No. There is no subscription and no per-message fee. The platform fee is ${FEE_TIERS[0].rate} of what a homeowner actually pays you, falling to ${FEE_TIERS[FEE_TIERS.length - 1].rate} as your yearly volume grows, plus Stripe's standard processing (${STRIPE_PROCESSING_NOTE}).`,
        },
      ]}
      cta={{
        title: 'Ask properly. Then ask them back.',
        note: `No subscription and no per-message fee. The platform fee is ${FEE_TIERS[0].rate} of what you collect and falls to ${FEE_TIERS[FEE_TIERS.length - 1].rate} as your volume grows, plus Stripe processing (${STRIPE_PROCESSING_NOTE}).`,
      }}
    />
  );
}
