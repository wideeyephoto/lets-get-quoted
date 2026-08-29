import type { Metadata } from 'next';
import ExampleFrame from '@/components/marketing/example-frame';
import SuiteFeaturePage, {
  Panel,
  PanelActions,
  PanelHead,
  PanelNote,
  PanelRows,
} from '@/components/marketing/suite-feature-page';
import { FEATURE_PRICING_NOTE, STRIPE_PROCESSING_NOTE } from '@/lib/pricing';

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

import styles from '@/components/marketing/suite-feature-page.module.css';

type FlowStep = {
  step: string;
  title: string;
  body: string;
  mock?: React.ReactNode;
  image?: { src: string; alt: string; width: number; height: number };
};

const REVIEWS_FLOW: FlowStep[] = [
  {
    step: 'Step 1',
    title: 'Automatic post-job review request',
    body: 'Triggered when the work wraps. Every customer receives the honest dual-route choice: post a public review or share private feedback.',
    mock: (
      <div className={styles.shotMockContainer}>
        <div className={styles.shotMockHeader}>
          <span className={styles.shotMockTitle}>Post-Job Review Request &middot; Dual Route</span>
          <span className={styles.shotBadgeGood}>Google Policy Compliant</span>
        </div>
        <dl className={styles.shotKeyValues}>
          <div className={styles.shotKeyRow}>
            <dt>Public Google Review</dt>
            <dd style={{ color: '#50e3bd' }}>1-Tap direct to your Google Business profile</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Private Owner Feedback</dt>
            <dd>Direct confidential message to your inbox</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Compliance Guarantee</dt>
            <dd>No star-rating gating &middot; Protects your Google ranking</dd>
          </div>
        </dl>
      </div>
    ),
  },
  {
    step: 'Step 2',
    title: 'Google review website sync & rich snippet SEO',
    body: 'Authentic Google reviews sync to your hosted website with schema markup, boosting search ranking and buyer confidence.',
    mock: (
      <div className={styles.shotMockContainer}>
        <div className={styles.shotMockHeader}>
          <span className={styles.shotMockTitle}>Website Review Widget &middot; Google Verified</span>
          <span className={styles.shotBadgeGood}>4.9 ★ (84 Reviews)</span>
        </div>
        <dl className={styles.shotKeyValues}>
          <div className={styles.shotKeyRow}>
            <dt>Recent Feedback</dt>
            <dd>&ldquo;Fastest quote and cleanest crew in Royal Oak!&rdquo;</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Schema Markup</dt>
            <dd>JSON-LD AggregateRating active</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Attribution</dt>
            <dd style={{ color: '#50e3bd' }}>Verified Homeowner &middot; Job #1048</dd>
          </div>
        </dl>
      </div>
    ),
  },
  {
    step: 'Step 3',
    title: 'Private feedback resolution hub',
    body: 'Private notes route to your dashboard so you can resolve minor snags directly with the client before they ever become public complaints.',
    mock: (
      <div className={styles.shotMockContainer}>
        <div className={styles.shotMockHeader}>
          <span className={styles.shotMockTitle}>Private Customer Note &middot; Dana W.</span>
          <span className={styles.shotBadgeFlag}>Needs Follow-up</span>
        </div>
        <dl className={styles.shotKeyValues}>
          <div className={styles.shotKeyRow}>
            <dt>Message</dt>
            <dd>&ldquo;Great job on the heater, small puddle left in laundry.&rdquo;</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Resolution</dt>
            <dd>Crew dispatched to dry &middot; Resolved in 20 min</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Outcome</dt>
            <dd style={{ color: '#50e3bd' }}>5-Star Google review posted later</dd>
          </div>
        </dl>
      </div>
    ),
  },
  {
    step: 'Step 4',
    title: '1-Tap rebooking & seasonal marketing',
    body: 'Reach out to past clients for annual checkups or seasonal maintenance. Live reach counts, consent filters, and STOP handling run automatically.',
    mock: (
      <div className={styles.shotMockContainer}>
        <div className={styles.shotMockHeader}>
          <span className={styles.shotMockTitle}>Autumn Gutter Clean Campaign</span>
          <span className={styles.shotBadgeGood}>142 Reachable</span>
        </div>
        <dl className={styles.shotKeyValues}>
          <div className={styles.shotKeyRow}>
            <dt>Audience</dt>
            <dd>Past roofing & gutter clients (last 12 mo)</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Opt-Out Protection</dt>
            <dd>STOP & consent strictly enforced</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Response Rate</dt>
            <dd style={{ color: '#50e3bd', fontWeight: 800 }}>18 Booked Appointments</dd>
          </div>
        </dl>
      </div>
    ),
  },
];

export default function ReviewsFeaturePage() {
  return (
    <SuiteFeaturePage
      breadcrumb={{ name: 'Reviews', path: '/features/reviews' }}
      eyebrow="Reviews + growth"
      title={
        <>
          More reviews, <em>without gaming the reviews.</em>
        </>
      }
      lede="The request goes out when the job is actually finished, and every customer is offered the same two things: post a public review, or tell you privately. Then the customers you already have become the ones you book next."
      heroChips={['No star-rating gating', 'STOP and consent enforced', 'Sent when the job is finished']}
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
      afterBenefits={
        <section className="section-block" id="the-screens" aria-labelledby="screens-title">
          <div className={styles.shotsHead}>
            <p className="eyebrow">The review and rebooking engine</p>
            <h2 id="screens-title">Build your reputation honestly and keep past clients coming back.</h2>
            <p>
              Dual-route feedback, Google review syncing, complaint prevention, and seasonal rebooking campaigns.
            </p>
          </div>

          <ol className={styles.shots}>
            {REVIEWS_FLOW.map((shot) => (
              <li className={styles.shot} key={shot.step}>
                <div className={styles.shotCopy}>
                  <span className={styles.shotStep}>{shot.step}</span>
                  <h3 className={styles.shotTitle}>{shot.title}</h3>
                  <p className={styles.shotBody}>{shot.body}</p>
                </div>
                <div className={styles.shotMedia}>
                  {shot.image ? (
                    <img
                      src={shot.image.src}
                      alt={shot.image.alt}
                      width={shot.image.width}
                      height={shot.image.height}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    shot.mock
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      }
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
          /* The policy is named and linked rather than alluded to, because
             "breaks Google's rules" is the kind of claim a contractor is right
             to want to check for themselves — it is their Business Profile at
             risk, not ours. Named as well as linked, so the answer survives
             Google reorganizing its help center. */
          a: (
            <>
              No, and the product will not let you. Every customer is offered a public review and a private
              word, in the same order, regardless of rating — the routing function is not even given the
              rating. Selectively soliciting positive reviews is prohibited under Google&rsquo;s{' '}
              <a
                href="https://support.google.com/business/answer/7091"
                target="_blank"
                rel="noopener noreferrer"
              >
                Prohibited &amp; restricted content
              </a>{' '}
              policy for Business Profiles, and it is your profile that gets restricted for it, so it is not
              a setting you can turn on here.
            </>
          ),
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
          a: `${FEATURE_PRICING_NOTE} Review requests use the text or email capacity included with your plan; optional top-ups cover extra sending. Stripe's ${STRIPE_PROCESSING_NOTE} are separate.`,
        },
      ]}
      cta={{
        title: 'Ask properly. Then ask them back.',
        note: `${FEATURE_PRICING_NOTE} Message allowances and optional top-ups are listed on /pricing.`,
      }}
    />
  );
}
