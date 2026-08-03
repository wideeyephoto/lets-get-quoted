'use client';

import { useState } from 'react';
import SaveButton from '@/components/save-button';
import { phoneLink } from '@/lib/phone';
import BookingSteps from './BookingSteps';
import { evaluateBookingAction, submitBookingAction, submitCallbackAction, type BookingEvaluation } from './actions';

type Props = {
  subdomain: string;
  siteId: string;
  businessName: string;
  serviceArea: string;
  /** Only set when the owner made it public — see withPublicContact. */
  phone: string | null;
};

// The shape of the flow, so somebody on screen two knows there is a screen
// three. The estimator may ask several questions or none, so the middle step
// covers "answering questions" as one leg rather than pretending to know how
// many there will be.
const STEPS = [
  { n: 1, label: 'The job' },
  { n: 2, label: 'Your estimate' },
  { n: 3, label: 'Pick a time' },
];

type Phase = 'describe' | 'asking' | 'thinking' | 'result';
type Estimate = { min?: number; max?: number; basis?: string };

// Response shapes from /api/public/leads/classify-estimate.
type EstimatorResponse =
  | { type: 'question'; question: string; responseId: string }
  | { type: 'estimate'; min?: number; max?: number; basis?: string; inArea?: boolean | null; excluded?: boolean };

const money = (n: number) => '$' + Math.round(n).toLocaleString();

// Longer than a good answer takes, shorter than anyone will wait for one.
// Matches the hero intake's deadline so the two behave the same under load.
const ESTIMATOR_TIMEOUT_MS = 8000;

export default function InstantBookFlow({ subdomain, siteId, businessName, serviceArea, phone }: Props) {
  const [phase, setPhase] = useState<Phase>('describe');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [prevResponseId, setPrevResponseId] = useState('');
  const [turn, setTurn] = useState(0);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [evaluation, setEvaluation] = useState<BookingEvaluation | null>(null);

  const submitBooking = submitBookingAction.bind(null, subdomain);
  const submitCallback = submitCallbackAction.bind(null, subdomain);

  async function callEstimator(payload: Record<string, unknown>): Promise<EstimatorResponse> {
    // A deadline of its own, because fetch has none. The callers below already
    // recover from a throw by treating the value as unknown and carrying on —
    // this is what makes a SLOW estimator throw instead of leaving somebody on
    // the "thinking" screen indefinitely. Down was handled; hanging was not.
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), ESTIMATOR_TIMEOUT_MS);
    try {
      const res = await fetch('/api/public/leads/classify-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, businessName, serviceArea, location: address, ...payload }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error('estimator');
      return await res.json();
    } finally {
      clearTimeout(deadline);
    }
  }

  async function evaluate(estimateMax: number | null, inArea: boolean | null, excluded: boolean) {
    setPhase('thinking');
    const result = await evaluateBookingAction(subdomain, { estimateMax, inArea, excluded, address });
    setEvaluation(result);
    setPhase('result');
  }

  async function handle(res: EstimatorResponse) {
    if (res.type === 'question') {
      if (res.question) {
        setQuestion(res.question);
        setPrevResponseId(res.responseId);
        setTurn((t) => t + 1);
        setAnswer('');
        setPhase('asking');
      } else {
        // Malformed question — treat as an unknown-value estimate rather than stall.
        await evaluate(null, null, false);
      }
      return;
    }
    // res is an estimate (possibly numberless) — decide eligibility server-side.
    const est: Estimate = { min: res.min, max: res.max, basis: res.basis };
    setEstimate(est);
    const estimateMax = typeof res.max === 'number' ? res.max : null;
    const inArea = res.inArea === true ? true : res.inArea === false ? false : null;
    const excluded = res.excluded === true;
    await evaluate(estimateMax, inArea, excluded);
  }

  async function onDescribe(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || !address.trim()) return;
    setPhase('thinking');
    try {
      handle(await callEstimator({ description: description.trim(), turn: 0 }));
    } catch {
      // Estimator unreachable — don't strand the visitor; treat as unknown value.
      await evaluate(null, null, false);
    }
  }

  async function onAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim()) return;
    setPhase('thinking');
    try {
      handle(await callEstimator({ answer: answer.trim(), previousResponseId: prevResponseId, turn }));
    } catch {
      await evaluate(null, null, false);
    }
  }

  const estimateBanner =
    estimate?.min != null && estimate?.max != null ? (
      <div className="payment-amount-block booking-estimate">
        <p className="cap">Instant estimate{estimate.basis ? ` — ${estimate.basis}` : ''}</p>
        <p className="payment-amount">{money(estimate.min)} – {money(estimate.max)}</p>
        <small>A pre-visit ballpark. {businessName} confirms the exact price on site.</small>
      </div>
    ) : null;

  // Which leg of the rail we're on. 'asking' is still the estimate leg — the
  // questions exist to produce the number, so they belong to step 2 rather than
  // inventing a step of their own each time one is asked.
  const stepNow = phase === 'describe' ? 1 : phase === 'result' && evaluation?.verdict.eligible ? 3 : 2;
  const steps = <BookingSteps steps={STEPS} current={stepNow} />;

  // Every screen carries the phone number when the owner publishes one. Anybody
  // this flow can't help — bad estimate, wrong area, estimator down — used to
  // reach the end of the page with nothing to do next.
  const call = phone ? phoneLink(phone) : null;
  const callOut = call ? (
    <p className="book-escape">
      Rather just talk to someone? Call <a href={call.href}>{call.text}</a>.
    </p>
  ) : null;

  if (phase === 'thinking') {
    return (
      <section className="panel workspace-section-card booking-form">
        {steps}
        <div className="booking-thinking" role="status" aria-live="polite">
          <span className="booking-dots" aria-hidden="true"><i /><i /><i /></span>
          <p>Working out your estimate…</p>
        </div>
      </section>
    );
  }

  if (phase === 'describe') {
    return (
      <form onSubmit={onDescribe} className="panel workspace-section-card booking-form">
        {steps}
        {/* No "Step 1 of 3" eyebrow. The rail is two centimetres above saying
            exactly that, and a third statement of the same fact between the
            rail and the question is noise, not emphasis. The screens that keep
            an eyebrow keep it because it says something the rail can't — a
            verdict ("You're good to book") or a frame for a bare question. */}
        <div className="section-heading workspace-section-heading book-step-head">
          <h2>What do you need done?</h2>
        </div>
        <p className="workspace-details-copy">
          Tell {businessName} about the job in a sentence or two — you&apos;ll get an instant ballpark, then pick a
          time.
        </p>
        <div className="form-grid">
          <div className="field full">
            <label htmlFor="describe">The job</label>
            <textarea id="describe" rows={3} required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. My kitchen faucet drips and the shut-off valve is stuck." />
          </div>
          <div className="field full">
            <label htmlFor="flow-address">Address</label>
            <input id="flow-address" required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="1418 Maplewood Ave, Royal Oak, MI" autoComplete="street-address" />
            <small className="field-hint">Prices the job and finds days {businessName} is already near you.</small>
          </div>
          <div className="field full">
            <button type="submit" className="btn primary book-submit">Get my estimate</button>
          </div>
        </div>
        {callOut}
      </form>
    );
  }

  if (phase === 'asking') {
    return (
      <form onSubmit={onAnswer} className="panel workspace-section-card booking-form">
        {steps}
        <div className="section-heading workspace-section-heading book-step-head">
          <p className="eyebrow">Quick question</p>
          <h2>{question}</h2>
        </div>
        <div className="form-grid">
          <div className="field full">
            <label htmlFor="answer">Your answer</label>
            <input id="answer" required value={answer} onChange={(e) => setAnswer(e.target.value)} autoFocus placeholder="Type your answer…" />
          </div>
          <div className="field full">
            <button type="submit" className="btn primary book-submit">Continue</button>
          </div>
        </div>
        {callOut}
      </form>
    );
  }

  // phase === 'result'
  if (!evaluation) {
    return (
      <section className="panel workspace-section-card booking-form">
        <p className="empty-state">Something went wrong. Please refresh and try again.</p>
        {callOut}
      </section>
    );
  }

  // Not eligible → graceful "request a callback" (still captures the lead).
  if (!evaluation.verdict.eligible) {
    return (
      <form action={submitCallback} className="panel workspace-section-card booking-form">
        {steps}
        <div className="section-heading workspace-section-heading book-step-head">
          <p className="eyebrow">Almost there</p>
          <h2>{evaluation.fallback.heading}</h2>
        </div>
        {estimateBanner}
        <p className="workspace-details-copy">{evaluation.fallback.body}</p>
        <input type="hidden" name="description" value={description} />
        <div className="form-grid">
          <div className="field full">
            <label htmlFor="cb-name">Full name</label>
            <input id="cb-name" name="name" required placeholder="Jane Homeowner" autoComplete="name" />
          </div>
          <div className="field">
            <label htmlFor="cb-phone">Mobile</label>
            <input id="cb-phone" name="phone" type="tel" placeholder="(248) 555-0199" autoComplete="tel" />
          </div>
          <div className="field">
            <label htmlFor="cb-email">Email</label>
            <input id="cb-email" name="email" type="email" placeholder="jane@email.com" autoComplete="email" />
          </div>
          <p className="field-hint booking-contact-hint">Add a mobile <strong>or</strong> an email &mdash; {businessName} needs one to get back to you.</p>
          <div className="field full">
            <label htmlFor="cb-address">Address</label>
            <input id="cb-address" name="address" required defaultValue={address} placeholder="1418 Maplewood Ave, Royal Oak, MI" autoComplete="street-address" />
          </div>
          <div className="field full">
            <label htmlFor="cb-note">Anything we should know? (optional)</label>
            <textarea id="cb-note" name="note" rows={2} maxLength={500} placeholder="Gate code, where to park, a dog in the yard, which door to use…" />
          </div>
          <div className="field full">
            <SaveButton className="btn primary book-submit" pendingLabel="Sending…" savedLabel="Sent ✓">Request a callback</SaveButton>
          </div>
        </div>
        {callOut}
      </form>
    );
  }

  // Eligible → self-serve slots.
  if (evaluation.days.length === 0) {
    return (
      <form action={submitCallback} className="panel workspace-section-card booking-form">
        {steps}
        <div className="section-heading workspace-section-heading book-step-head">
          <p className="eyebrow">You&apos;re qualified</p>
          <h2>No open windows online right now</h2>
        </div>
        {estimateBanner}
        <p className="workspace-details-copy">
          Leave your details and {businessName} will reach out with the next opening.
        </p>
        <input type="hidden" name="description" value={description} />
        <div className="form-grid">
          <div className="field full">
            <label htmlFor="nw-name">Full name</label>
            <input id="nw-name" name="name" required placeholder="Jane Homeowner" autoComplete="name" />
          </div>
          <div className="field">
            <label htmlFor="nw-phone">Mobile</label>
            <input id="nw-phone" name="phone" type="tel" placeholder="(248) 555-0199" autoComplete="tel" />
          </div>
          <div className="field">
            <label htmlFor="nw-email">Email</label>
            <input id="nw-email" name="email" type="email" placeholder="jane@email.com" autoComplete="email" />
          </div>
          <p className="field-hint booking-contact-hint">Add a mobile <strong>or</strong> an email &mdash; {businessName} needs one to get back to you.</p>
          <div className="field full">
            <label htmlFor="nw-address">Address</label>
            <input id="nw-address" name="address" required defaultValue={address} placeholder="1418 Maplewood Ave, Royal Oak, MI" autoComplete="street-address" />
          </div>
          <div className="field full">
            <label htmlFor="nw-note">Anything we should know? (optional)</label>
            <textarea id="nw-note" name="note" rows={2} maxLength={500} placeholder="Gate code, where to park, a dog in the yard, which door to use…" />
          </div>
          <div className="field full">
            <SaveButton className="btn primary book-submit" pendingLabel="Sending…" savedLabel="Sent ✓">Request a callback</SaveButton>
          </div>
        </div>
        {callOut}
      </form>
    );
  }

  return (
    <form action={submitBooking} className="panel workspace-section-card booking-form">
      {steps}
      <div className="section-heading workspace-section-heading book-step-head">
        <p className="eyebrow">You&apos;re good to book</p>
        <h2>Pick your window</h2>
      </div>
      {estimateBanner}
      <input type="hidden" name="description" value={description} />
      {estimate?.max != null ? <input type="hidden" name="estimateMax" value={estimate.max} /> : null}

      <div className="booking-days">
        {evaluation.days.map((day) => (
          <div className={`booking-day-group${day.nearby ? ' is-nearby' : ''}`} key={day.dateKey}>
            <p className="booking-day-heading">
              {day.dayLabel}
              {day.nearby ? (
                <span className="booking-nearby">
                  ◆ We&apos;ll already be in your area{day.driveMinutes ? ` · ~${day.driveMinutes} min away` : ''}
                </span>
              ) : null}
            </p>
            <div className="booking-slots">
              {day.slots.map((slot) => (
                <label className="booking-slot" key={`${day.dateKey}|${slot.time}`}>
                  <input type="radio" name="slot" value={`${day.dateKey}|${slot.time}`} required />
                  <span className="booking-slot-time">{slot.label}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="section-heading workspace-section-heading book-step-head">
        <p className="eyebrow">Your details</p>
        <h2>Where should we go?</h2>
      </div>
      <div className="form-grid">
        <div className="field full">
          <label htmlFor="bk-name">Full name</label>
          <input id="bk-name" name="name" required placeholder="Jane Homeowner" autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="bk-phone">Mobile</label>
          <input id="bk-phone" name="phone" type="tel" placeholder="(248) 555-0199" autoComplete="tel" />
        </div>
        <div className="field">
          <label htmlFor="bk-email">Email</label>
          <input id="bk-email" name="email" type="email" placeholder="jane@email.com" autoComplete="email" />
        </div>
        <p className="field-hint booking-contact-hint">Add a mobile <strong>or</strong> an email &mdash; {businessName} needs one to get back to you.</p>
        <div className="field full">
          <label htmlFor="bk-address">Address</label>
          <input id="bk-address" name="address" required defaultValue={address} placeholder="1418 Maplewood Ave, Royal Oak, MI" autoComplete="street-address" />
        </div>
        <div className="field full">
          <label htmlFor="bk-note">Anything we should know? (optional)</label>
          <textarea id="bk-note" name="note" rows={2} maxLength={500} placeholder="Gate code, where to park, a dog in the yard, which door to use…" />
          <small className="field-hint">This goes to whoever turns up, not just the office.</small>
        </div>
        <div className="field full">
          <SaveButton className="btn primary book-submit" pendingLabel="Sending…" savedLabel="Sent ✓">Request this time</SaveButton>
          {/* "Booked ✓" was a lie the button told for the half-second before the
              redirect: scheduled_for stays NULL until the owner confirms, which
              is the whole safety property of this feature. */}
          <p className="book-reassure">
            This is a request, not a charge. {businessName} confirms before anything is booked.
          </p>
        </div>
      </div>
      {callOut}
    </form>
  );
}
