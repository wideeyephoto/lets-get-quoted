import type { Metadata } from 'next';
import FeatureDetailLayout from '@/components/marketing/feature-detail-layout';
import SampleIntake from './sample-intake';
import ExampleFrame from '@/components/marketing/example-frame';
import AiIntakeSandbox from '@/components/marketing/AiIntakeSandbox';
import SmsQuoteSimulator from '@/components/marketing/SmsQuoteSimulator';
import { TRADES } from '@/lib/trades';
import { FEATURE_PRICING_NOTE } from '@/lib/pricing';
import { TIER_LABEL } from '@/lib/lead-priority';
import styles from './ai-intake.module.css';

export const metadata: Metadata = {
  // No brand suffix here. The root layout's title template is
  // "%s · Let's Get Quoted" (src/app/layout.tsx), so naming the brand again
  // rendered "AI Intake for Contractors | Let's Get Quoted · Let's Get Quoted".
  // Sibling pages in this cluster (client-portal, back-office) already use a
  // bare title — this one and quick-stops were the two that drifted.
  title: 'AI Intake for Contractors',
  description:
    'Score contractor leads before the first call. Smart Intake asks trade-specific follow-ups, collects photos and timing, and ranks what to answer first.',
  alternates: { canonical: 'https://letsgetquoted.com/features/ai-intake' },
  /* THE SOCIAL CARD IS THIS PAGE'S, NOT THE HOMEPAGE'S.
     Next replaces the parent metadata's `openGraph` object wholesale rather
     than merging into it — but only if the child declares one. Without this
     block every share of this URL unfurled as the homepage: its title, its
     description, a screenshot of a website template, and an og:url pointing at
     letsgetquoted.com, so the card sent people somewhere else entirely. */
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/ai-intake',
    siteName: "Let's Get Quoted",
    title: 'Qualify every lead before you pick up the phone.',
    description:
      'Smart Intake asks trade-specific follow-up questions, collects photos, timing, location and budget signals, then scores every job by fit, urgency, value and distance.',
    images: [{ url: '/features/og-ai-intake.jpg', width: 1200, height: 630, alt: 'Let’s Get Quoted AI Smart Intake for contractors' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Qualify every lead before you pick up the phone.',
    description:
      'Smart Intake asks trade-specific follow-up questions, collects photos, timing, location and budget signals, then scores every job by fit, urgency, value and distance.',
    images: ['/features/og-ai-intake.jpg'],
  },
};

/* The arriving lead, as the priority inbox draws it.
 *
 * Every field here is one the intake genuinely collects — description, photos,
 * timeframe, service area, phone — and the tier label is imported from
 * lead-priority rather than retyped, so a rename in the product shows up here
 * instead of quietly leaving the marketing page describing an older inbox.
 *
 * The location line reads "In your service area" and not a mileage. Nothing
 * computes per-lead distance: the service-area question checks the answer
 * against the cities the owner listed and flags it. A number like "3.2 mi"
 * would be an invented precision. */
function ArrivingLead() {
  return (
    <div className={styles.leadCard}>
      <div className={styles.leadHead}>
        <span className={styles.leadName}>Dana R.</span>
        <span className={styles.leadTier}>{TIER_LABEL['needs-response']}</span>
        <span className={styles.leadHeat}>Hot</span>
      </div>

      <ul className={styles.leadFacts}>
        <li className={styles.fact}>
          <span className={styles.factLabel}>Job</span>
          <span className={styles.factValue}>Water heater, no hot water</span>
        </li>
        <li className={styles.fact}>
          <span className={styles.factLabel}>Timeframe</span>
          <span className={styles.factValue}>As soon as possible</span>
        </li>
        <li className={styles.fact}>
          <span className={styles.factLabel}>Location</span>
          <span className={styles.factValue}>In your service area</span>
        </li>
        <li className={styles.fact}>
          <span className={styles.factLabel}>Estimate shown</span>
          <span className={styles.factValue}>$900 – $1,600</span>
        </li>
      </ul>

      <p className={styles.leadSummary}>
        <strong>Summary.</strong> 40-gallon gas heater, roughly 11 years old, pilot won’t stay lit and
        there’s standing water at the base. Homeowner is on a well and wants it looked at today.
        Phone verified.
      </p>

      <ul className={styles.leadPhotos} aria-label="Photos the homeowner attached">
        <li className={styles.photo}>Photo 1</li>
        <li className={styles.photo}>Photo 2</li>
        <li className={styles.photo}>Photo 3</li>
      </ul>
    </div>
  );
}

/* Which leads are allowed to interrupt you.
 *
 * All three rungs are real behavior from the public lead endpoint: a
 * high-value lead (its estimate clears the threshold the owner set) escalates
 * to a louder email and, opt-in, a text to the owner's mobile; an ordinary lead
 * emails; and a low-scoring one stays silent by default while still landing on
 * the board. */
const ALERT_LADDER = [
  {
    tone: 'loud',
    channel: 'Text + email',
    title: 'A high-value job lands',
    body: 'When the estimate clears the dollar figure you set, the alert escalates — a louder email, and a text to your own mobile if you switch that on. Big work does not wait behind a notification you check at six.',
  },
  {
    tone: 'normal',
    channel: 'Email',
    title: 'An ordinary job lands',
    body: 'The full brief arrives by email with the summary, the photos and the priority signals, so the first thing you read is the job rather than a name and a phone number.',
  },
  {
    tone: 'quiet',
    channel: 'No alert',
    title: 'A poor-fit inquiry lands',
    body: 'Leads that score low do not text you and do not email you — that is the default, not a setting you have to find. They are still captured and still on the board when you go looking. Nothing is thrown away; it just stops arriving as an interruption.',
  },
] as const;

/* Answers checked against the product rather than against the pitch: the trade
   count is TRADES, the scoring signals are lib/leads.ts, the phone code is
   lib/lead-verification.ts, and the alert thresholds are the intake settings
   the ladder below describes. Nothing here promises a capability the rest of
   the page has not already shown. */
const FAQ: { q: string; a: string }[] = [
  {
    q: 'What decides a lead’s score?',
    a: 'Fit, urgency, value and distance. The job description and the follow-up answers give the first three; the service area you set gives the fourth, when that question is switched on.',
  },
  {
    q: 'Which trades does it work for?',
    a: `All ${TRADES.length}. The follow-up questions, the services and the FAQs are built for the trade on your account rather than for contractors in general — a water heater draws different questions from a panel upgrade.`,
  },
  {
    q: 'Can I change what it asks?',
    a: 'Yes. You set the minimum job size, list the work you don’t take, choose whether an email is required alongside the phone number, and set the dollar figure that counts as high value.',
  },
  {
    q: 'What happens to leads that score low?',
    a: 'They are captured and they stay on your board. What changes is that they do not text you and do not email you by default — nothing is discarded, it just stops arriving as an interruption.',
  },
  {
    q: 'Is the estimate a quote?',
    a: 'No. It is a range, shown to set expectations before either side spends time on a call, and you see the same range the homeowner saw. The quote is yours to build afterwards.',
  },
  {
    q: 'Do I need a Let’s Get Quoted website?',
    a: 'Yes — Smart Intake is the request form on the site we build for you, which is included. There is nothing for the homeowner to install and no app to talk them through.',
  },
];

export default function AIIntakePage() {
  return (
    <FeatureDetailLayout
      breadcrumb={{ name: 'AI intake', path: '/features/ai-intake' }}
      eyebrow="AI intake for contractors"
      /* The old headline was about the ALERT ("worth the interruption"), which
         is the third thing this does. What a contractor searching for lead
         software wants first is the qualifying, and it is what the demo beside
         it now shows happening. */
      title={
        <>
          Qualify every lead <em>before you pick up the phone.</em>
        </>
      }
      lede="Smart Intake asks trade-specific follow-up questions, collects photos, timing, location and budget signals, then scores every job by fit, urgency, value and distance."
      heroNote={`Built into your Let’s Get Quoted website · Works across ${TRADES.length} trades · No app to install`}
      /* THE BUTTON ASKS FOR THE SMALL THING FIRST.
         "Build my free site" put the largest commitment on the page in front of
         somebody who has not yet seen the feature work. The demo is right
         there, and on a phone it is below the fold — so the first button takes
         you to it and the signup is the second. */
      primary={{ label: 'Try a sample intake', href: '#sample-intake' }}
      /* Both actions are "look at it working", and neither is a signup. This is
         the one page where that is right: the whole argument is that the intake
         does something a form does not, and asking somebody to open an account
         before they have watched it is asking on faith. The closing CTA takes
         the signup. */
      secondary={{ label: 'See scored leads in the demo', href: '/demo/leads' }}
      demo={
        <ExampleFrame
          label="One request, from two words to a job you can quote"
          note="A sample job and homeowner. The follow-up questions and every field in the brief are the real ones the intake uses; nothing here calls the model."
        >
          <SampleIntake>
            <ArrivingLead />
          </SampleIntake>
        </ExampleFrame>
      }
      proof={[
        {
          title: 'Trade-specific questions',
          body: `The next question changes with the job — across all ${TRADES.length} trades.`,
        },
        {
          title: 'Lead scoring',
          body: 'Fit, urgency, value and distance considered.',
        },
        {
          // The draft's title, kept. Only the body needed changing: its
          // "nearby requests rise first" half claimed a location-triggered
          // alert that does not exist.
          title: 'Instant alerts',
          body: 'A job over your dollar threshold can text you the minute it lands.',
        },
        {
          title: 'One clean summary',
          body: 'Walk into the call already understanding the job.',
        },
      ]}
      story={{
        eyebrow: 'Less chasing. Better first calls.',
        title: 'Your website does the first round of discovery.',
        body: 'Instead of receiving a name, phone number and vague sentence, you receive a useful project brief. The homeowner answers the right questions before contact details unlock their estimate, helping set expectations and filter out poor-fit inquiries.',
      }}
      /* FIVE BECAME THREE.
         "Builds real project context", "prioritizes attention", "spends less
         of your day on poor-fit leads", "keeps the intake usable" and "sets
         price expectations early" are three outcomes and two mechanisms. The
         mechanisms are shown rather than claimed — the demo above is the
         context being built, and the alert ladder below is the prioritizing —
         so what is left is what a contractor gets out of it. */
      benefits={[
        {
          title: 'Understand the job before you call',
          body: 'Scope, photos, timing, budget signals and location arrive together, so the first conversation starts from the work rather than from “so what’s the problem?”. The same summary stays attached as the request becomes a quote, a scheduled job and a paid invoice.',
        },
        {
          title: 'Answer the best work first',
          body: 'Fit, urgency, value and distance decide what rises. With the service-area question switched on, whether a job sits inside the patch you actually cover is one of the signals doing the ranking.',
        },
        {
          title: 'Stop losing days to poor-fit inquiries',
          body: 'Set a minimum job size and list the work you don’t take, and inquiries below the line arrive flagged rather than mixed in. An instant estimate also gives the homeowner a realistic starting point before either side spends time on a call.',
        },
      ]}
      stepsTitle="From a vague inquiry to a prioritized opportunity — before you pick up the phone."
      /* SIX BECAME FOUR.
         "Describe the work" and "answer smart follow-ups" are the first two
         panels of the demo in the hero, and "act on the best lead" is the
         alert ladder at the foot of the page. Repeating them here was the page
         explaining in words what it had already shown twice. What is left is
         the order the homeowner actually moves through, including the one bit
         of it that is a deliberate decision rather than a step. */
      steps={[
        {
          title: 'Describe the work',
          body: 'The homeowner starts in plain language, and the intake asks only the follow-ups that job needs.',
        },
        {
          title: 'Add the detail that decides it',
          body: 'Photos, timing, budget signals and location are collected while the homeowner is still in the moment — not chased down over three days of voicemail.',
        },
        {
          title: 'Leave a way to reach them',
          body: 'A phone number is requested, and an email alongside it when you ask for one. You choose whether the email is required, optional or never asked for at all.',
        },
        {
          title: 'Unlock the estimate',
          body: 'Contact details are collected before the estimate appears — that order is deliberate, and it is why a scored lead has a number on it.',
        },
      ]}
      cta={{
        title: 'Let your website qualify the next lead for you.',
        note: `${FEATURE_PRICING_NOTE} AI Intake allowances vary by plan, and the standard quote form takes over automatically when credits run out.`,
      }}
    >
      <section className="section-block" aria-labelledby="intake-alerts-title">
        <div>
          <p className="eyebrow">Not every lead deserves a text message</p>
          {/* "The quiet ones are the feature" is a better sentence and a
              worse heading: the first thing it makes a contractor wonder is
              whether we are throwing leads away. Say the reassurance in the
              heading and keep the wit for the copy. */}
          <h2 id="intake-alerts-title">Keep every lead. Get interrupted only by the right ones.</h2>
          <p>
            Scoring is only worth having if something acts on it. What a lead scores decides how
            loudly it arrives, so the jobs worth stopping for are the ones that reach your pocket.
          </p>
        </div>

        <ul className={styles.ladder}>
          {ALERT_LADDER.map((rung) => (
            <li key={rung.title} className={styles.rung} data-tone={rung.tone}>
              <span className={styles.rungChannel}>{rung.channel}</span>
              <h3 className={styles.rungTitle}>{rung.title}</h3>
              <p className={styles.rungBody}>{rung.body}</p>
            </li>
          ))}
        </ul>

        <p className={styles.ladderNote}>
          You set the dollar threshold that counts as high value, and you decide whether low-scoring
          leads stay silent. Both live in your intake settings, and both can be changed the first
          week you find you disagree with them.
        </p>
      </section>

      <section className="section-block" style={{ margin: '48px 0' }}>
        <SmsQuoteSimulator />
      </section>

      <AiIntakeSandbox />

      {/* <details> rather than a script: it works before hydration, it is in the
          tab order for free, and the browser's own find-in-page opens it. No
          `name`, so reading one answer never closes another. */}
      <section className="section-block" aria-labelledby="intake-faq-title">
        <div>
          <p className="eyebrow">Before you turn it on</p>
          <h2 id="intake-faq-title">The questions contractors ask us.</h2>
        </div>

        <div className={styles.faq}>
          {FAQ.map((item, index) => (
            <details key={item.q} open={index === 0}>
              <summary>
                <span>{item.q}</span>
                <i aria-hidden="true" />
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </FeatureDetailLayout>
  );
}
