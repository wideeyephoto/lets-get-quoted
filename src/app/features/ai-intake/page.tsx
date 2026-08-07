import type { Metadata } from 'next';
import FeatureDetailLayout from '@/components/marketing/feature-detail-layout';
import ExampleFrame from '@/components/marketing/example-frame';
import { TRADES } from '@/lib/trades';
import { STRIPE_PROCESSING_NOTE } from '@/lib/pricing';
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
    'Qualify, score and prioritize contractor leads before the first call. Smart Intake asks trade-specific follow-ups, collects photos and timing, and surfaces the work worth answering first.',
  alternates: { canonical: 'https://letsgetquoted.com/features/ai-intake' },
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
 * All three rungs are real behaviour from the public lead endpoint: a
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
    title: 'A poor-fit enquiry lands',
    body: 'Leads that score low do not text you and do not email you — that is the default, not a setting you have to find. They are still captured and still on the board when you go looking. Nothing is thrown away; it just stops arriving as an interruption.',
  },
] as const;

export default function AIIntakePage() {
  return (
    <FeatureDetailLayout
      eyebrow="AI intake that thinks like an estimator"
      title={
        <>
          Know which leads are worth <em>the interruption.</em>
        </>
      }
      lede="Smart Intake asks trade-specific follow-up questions, collects the details and photos you need, then surfaces the best opportunities by fit, urgency, value and distance."
      heroNote="Works on the site you already have with us. No extra tools for the homeowner to install, and no app to talk them through."
      demo={
        <ExampleFrame
          label="A scored lead as it reaches the priority inbox"
          note="Sample job and homeowner. The fields are the real ones the intake collects."
        >
          <ArrivingLead />
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
      benefits={[
        {
          title: 'Builds real project context',
          body: 'Collects scope, photos, timing, budget signals and location without making your team play phone tag.',
        },
        {
          title: 'Prioritizes attention',
          body: 'Strong-fit, urgent and high-value work rises first — and with the service-area question switched on, whether a job sits inside the patch you actually cover is one of the signals doing the ranking.',
        },
        {
          title: 'Spends less of your day on poor-fit leads',
          body: 'Set a minimum job size and list the work you don’t take, and enquiries below the line arrive flagged rather than mixed in. Low-scoring ones don’t interrupt you at all by default — which is time you were spending on calls that were never going to close.',
        },
        {
          title: 'Keeps the intake usable',
          body: 'The same summary stays connected as the request becomes a quote, scheduled job and paid invoice.',
        },
        {
          title: 'Sets price expectations early',
          body: 'An instant estimate gives homeowners a realistic starting point before either side spends time on a call.',
        },
      ]}
      stepsTitle="From a vague inquiry to a prioritized opportunity — before you pick up the phone."
      steps={[
        {
          title: 'Describe the work',
          body: 'The homeowner starts in plain language.',
        },
        {
          title: 'Answer smart follow-ups',
          body: 'AI asks only the questions needed for that project.',
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
          body: 'Contact details are collected before the estimate appears — that order is deliberate.',
        },
        {
          title: 'Act on the best lead',
          body: 'Your team receives the summary and priority signals instantly.',
        },
      ]}
      cta={{
        title: 'Let your website qualify the next lead for you.',
        note: `No monthly fee. You pay a small platform fee only on money you actually collect, plus Stripe’s ${STRIPE_PROCESSING_NOTE}.`,
      }}
    >
      <section className="section-block" aria-labelledby="intake-alerts-title">
        <div>
          <p className="eyebrow">Not every lead deserves a text message</p>
          <h2 id="intake-alerts-title">The quiet ones are the feature.</h2>
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
    </FeatureDetailLayout>
  );
}
