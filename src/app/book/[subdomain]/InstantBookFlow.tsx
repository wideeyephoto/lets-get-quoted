'use client';

import { useState } from 'react';
import SaveButton from '@/components/save-button';
import { evaluateBookingAction, submitBookingAction, submitCallbackAction, type BookingEvaluation } from './actions';

type Props = {
  subdomain: string;
  siteId: string;
  businessName: string;
  serviceArea: string;
};

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

export default function InstantBookFlow({ subdomain, siteId, businessName, serviceArea }: Props) {
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
    if (!description.trim()) return;
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

  if (phase === 'thinking') {
    return (
      <section className="panel workspace-section-card booking-form">
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
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Step 1</p>
          <h2>What do you need done?</h2>
        </div>
        <p className="workspace-details-copy" style={{ marginTop: '0.4rem', marginBottom: '1rem' }}>
          Tell {businessName} about the job in a sentence or two — you&apos;ll get an instant ballpark, then pick a
          time.
        </p>
        <div className="form-grid">
          <div className="field full">
            <label htmlFor="describe">The job</label>
            <textarea id="describe" rows={3} required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. My kitchen faucet drips and the shut-off valve is stuck." />
          </div>
          <div className="field full">
            <label htmlFor="flow-address">Address (optional)</label>
            <input id="flow-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="1418 Maplewood Ave, Royal Oak, MI" />
          </div>
          <div className="field full">
            <button type="submit" className="btn primary">Get my estimate</button>
          </div>
        </div>
      </form>
    );
  }

  if (phase === 'asking') {
    return (
      <form onSubmit={onAnswer} className="panel workspace-section-card booking-form">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Quick question</p>
          <h2>{question}</h2>
        </div>
        <div className="form-grid">
          <div className="field full">
            <label htmlFor="answer">Your answer</label>
            <input id="answer" required value={answer} onChange={(e) => setAnswer(e.target.value)} autoFocus placeholder="Type your answer…" />
          </div>
          <div className="field full">
            <button type="submit" className="btn primary">Continue</button>
          </div>
        </div>
      </form>
    );
  }

  // phase === 'result'
  if (!evaluation) {
    return (
      <section className="panel workspace-section-card booking-form">
        <p className="empty-state">Something went wrong. Please refresh and try again.</p>
      </section>
    );
  }

  // Not eligible → graceful "request a callback" (still captures the lead).
  if (!evaluation.verdict.eligible) {
    return (
      <form action={submitCallback} className="panel workspace-section-card booking-form">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Almost there</p>
          <h2>{evaluation.fallback.heading}</h2>
        </div>
        {estimateBanner}
        <p className="workspace-details-copy" style={{ marginTop: '0.75rem', marginBottom: '1rem' }}>{evaluation.fallback.body}</p>
        <input type="hidden" name="description" value={description} />
        <div className="form-grid">
          <div className="field full">
            <label htmlFor="cb-name">Full name</label>
            <input id="cb-name" name="name" required placeholder="Jane Homeowner" />
          </div>
          <div className="field">
            <label htmlFor="cb-phone">Mobile</label>
            <input id="cb-phone" name="phone" type="tel" placeholder="(248) 555-0199" />
          </div>
          <div className="field">
            <label htmlFor="cb-email">Email</label>
            <input id="cb-email" name="email" type="email" placeholder="jane@email.com" />
          </div>
          <div className="field full">
            <label htmlFor="cb-address">Address</label>
            <input id="cb-address" name="address" defaultValue={address} placeholder="1418 Maplewood Ave, Royal Oak, MI" />
          </div>
          <p className="field-hint booking-contact-hint">Add a mobile <strong>or</strong> an email &mdash; {businessName} needs one to get back to you.</p>
          <div className="field full">
            <SaveButton className="btn primary" pendingLabel="Sending…" savedLabel="Sent ✓">Request a callback</SaveButton>
          </div>
        </div>
      </form>
    );
  }

  // Eligible → self-serve slots.
  if (evaluation.days.length === 0) {
    return (
      <form action={submitCallback} className="panel workspace-section-card booking-form">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">You&apos;re qualified</p>
          <h2>No open windows online right now</h2>
        </div>
        {estimateBanner}
        <p className="workspace-details-copy" style={{ marginTop: '0.75rem', marginBottom: '1rem' }}>
          Leave your details and {businessName} will reach out with the next opening.
        </p>
        <input type="hidden" name="description" value={description} />
        <div className="form-grid">
          <div className="field full">
            <label htmlFor="nw-name">Full name</label>
            <input id="nw-name" name="name" required placeholder="Jane Homeowner" />
          </div>
          <div className="field">
            <label htmlFor="nw-phone">Mobile</label>
            <input id="nw-phone" name="phone" type="tel" placeholder="(248) 555-0199" />
          </div>
          <div className="field">
            <label htmlFor="nw-email">Email</label>
            <input id="nw-email" name="email" type="email" placeholder="jane@email.com" />
          </div>
          <p className="field-hint booking-contact-hint">Add a mobile <strong>or</strong> an email &mdash; {businessName} needs one to get back to you.</p>
          <div className="field full">
            <label htmlFor="nw-address">Address</label>
            <input id="nw-address" name="address" defaultValue={address} placeholder="1418 Maplewood Ave, Royal Oak, MI" />
          </div>
          <div className="field full">
            <SaveButton className="btn primary" pendingLabel="Sending…" savedLabel="Sent ✓">Request a callback</SaveButton>
          </div>
        </div>
      </form>
    );
  }

  return (
    <form action={submitBooking} className="panel workspace-section-card booking-form">
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">You&apos;re good to book</p>
        <h2>Pick your window</h2>
      </div>
      {estimateBanner}
      <input type="hidden" name="description" value={description} />
      {estimate?.max != null ? <input type="hidden" name="estimateMax" value={estimate.max} /> : null}

      <div className="booking-days" style={{ marginTop: '1rem' }}>
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

      <div className="section-heading workspace-section-heading" style={{ marginTop: '1.5rem' }}>
        <p className="eyebrow">Your details</p>
        <h2>Where should we go?</h2>
      </div>
      <div className="form-grid">
        <div className="field full">
          <label htmlFor="bk-name">Full name</label>
          <input id="bk-name" name="name" required placeholder="Jane Homeowner" />
        </div>
        <div className="field">
          <label htmlFor="bk-phone">Mobile</label>
          <input id="bk-phone" name="phone" type="tel" placeholder="(248) 555-0199" />
        </div>
        <div className="field">
          <label htmlFor="bk-email">Email</label>
          <input id="bk-email" name="email" type="email" placeholder="jane@email.com" />
        </div>
        <p className="field-hint booking-contact-hint">Add a mobile <strong>or</strong> an email &mdash; {businessName} needs one to get back to you.</p>
        <div className="field full">
          <label htmlFor="bk-address">Address</label>
          <input id="bk-address" name="address" defaultValue={address} placeholder="1418 Maplewood Ave, Royal Oak, MI" />
        </div>
        <div className="field full">
          <SaveButton className="btn primary" pendingLabel="Booking…" savedLabel="Booked ✓">Request this time</SaveButton>
        </div>
      </div>
    </form>
  );
}
