'use client';

import { useState } from 'react';
import { submitQuickStopRequestAction } from './actions';
import type { QuickStopDayOption } from '@/lib/quick-stop';

type Qualification = {
  enabled?: boolean;
  eligible?: boolean;
  unsafe?: boolean;
  needsPhotos?: boolean;
  requiredPhotos?: number;
  summary?: string;
  visitMinutes?: number | null;
  safety?: string | null;
  reason?: string | null;
  /** Scoping questions left blank that could still change a "no". */
  followUps?: { key: string; label: string }[];
  error?: string;
};

// Self-contained Quick Stop path for the public Book page. Runs its OWN intake
// (that IS the AI intake for Quick Stop): structured questions + photos, a live
// eligibility check, then a request submit. Kept separate from the standard
// estimate flow so the booking page's existing behavior is untouched — a
// customer simply gets a second, clearly-labeled path when the owner enables it.
export default function QuickStopFlow({
  subdomain,
  siteId,
  businessName,
  days,
}: {
  subdomain: string;
  siteId: string;
  businessName: string;
  /** The days actually on offer — computed server-side from the owner's
   *  weekdays, how far ahead they accept, and whether today's window has
   *  already closed. Never assume "today": at 9pm it isn't one. */
  days: QuickStopDayOption[];
}) {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verdict, setVerdict] = useState<Qualification | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [issue, setIssue] = useState('');
  const [startedWhen, setStartedWhen] = useState('');
  const [worsening, setWorsening] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [availability, setAvailability] = useState('');
  const [requestedDate, setRequestedDate] = useState(days[0]?.dateKey ?? '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);

  const eligible = verdict?.eligible === true;

  // The server names the scoping questions that could still change this verdict;
  // this narrows them to the ones STILL blank, so a box filled in after the
  // check stops being asked for the moment it's typed into.
  const answered: Record<string, string> = { startedWhen, worsening, propertyType };
  const followUps = (verdict?.followUps ?? []).filter((question) => !(answered[question.key] ?? '').trim());
  const wanted = (key: string) => (followUps.some((question) => question.key === key) ? ' es-field-wanted' : '');

  async function checkEligibility() {
    setError(null);
    if (!issue.trim()) {
      setError('Describe the issue first.');
      return;
    }
    setChecking(true);
    setVerdict(null);
    try {
      const res = await fetch('/api/public/leads/quick-stop-qualify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId,
          issue,
          startedWhen,
          worsening,
          propertyType,
          availability,
          photoCount: photos.length,
        }),
      });
      const data = (await res.json()) as Qualification;
      setVerdict(data);
    } catch {
      setError('Couldn’t check eligibility just now. Please try again.');
    } finally {
      setChecking(false);
    }
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set('subdomain', subdomain);
      fd.set('issue', issue);
      fd.set('startedWhen', startedWhen);
      fd.set('worsening', worsening);
      fd.set('propertyType', propertyType);
      fd.set('availability', availability);
      // Which day they picked. Re-validated server-side against the same rules
      // that produced the buttons — this is a public form.
      fd.set('requestedDate', requestedDate);
      fd.set('name', name);
      fd.set('phone', phone);
      fd.set('email', email);
      fd.set('address', address);
      for (const file of photos) fd.append('photos', file);

      const result = await submitQuickStopRequestAction(fd);
      if (result.ok) {
        setDone(true);
      } else if (result.unsafe && result.safety) {
        setVerdict({ unsafe: true, safety: result.safety });
      } else {
        setError(result.error);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <section className="panel workspace-section-card" style={{ marginTop: '1rem', borderColor: 'rgba(25,214,174,.4)' }}>
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Quick Stop</p>
          <h2>Request sent 👍</h2>
        </div>
        <p className="workspace-details-copy" style={{ marginTop: '.5rem' }}>
          {businessName} will review your job and, if they can fit you in, text you an arrival window and the
          Quick Stop fee. You only pay after you approve the time and price — nothing is booked until then.
        </p>
      </section>
    );
  }

  if (!open) {
    return (
      <section className="panel workspace-section-card" style={{ marginTop: '1rem' }}>
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Need it sooner?</p>
          <h2>Quick Stop</h2>
        </div>
        <p className="workspace-details-copy" style={{ marginTop: '.5rem', marginBottom: '1rem' }}>
          Get added to the contractor&apos;s route sooner. The contractor will review the job, propose an
          arrival window, and set the separate fee required to add another stop.
        </p>
        <button type="button" className="btn primary" onClick={() => setOpen(true)}>
          Request a Quick Stop
        </button>
      </section>
    );
  }

  return (
    <section className="panel workspace-section-card" style={{ marginTop: '1rem' }}>
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">Quick Stop</p>
        <h2>Tell us about the job</h2>
      </div>
      <p className="workspace-details-copy" style={{ marginTop: '.5rem', marginBottom: '1rem' }}>
        Answer a few quick questions so {businessName} can decide if they can fit you in
        {days.length > 1 ? ' today or in the next day or two' : ' today'}. All fields help — the clearer the job, the
        faster they can respond.
      </p>

      <div className="form-grid">
        <div className="field full">
          <label htmlFor="es-issue">What&apos;s the exact issue?</label>
          <textarea id="es-issue" rows={3} value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="Kitchen faucet is dripping steadily and won't shut off all the way." required />
        </div>
        <div className={`field${wanted('startedWhen')}`}>
          <label htmlFor="es-started">When did it start?</label>
          <input id="es-started" value={startedWhen} onChange={(e) => setStartedWhen(e.target.value)} placeholder="This morning" />
        </div>
        <div className={`field${wanted('worsening')}`}>
          <label htmlFor="es-worse">Is it getting worse?</label>
          <select id="es-worse" value={worsening} onChange={(e) => setWorsening(e.target.value)}>
            <option value="">Not sure</option>
            <option value="yes">Yes, getting worse</option>
            <option value="no">No, stable</option>
          </select>
        </div>
        <div className={`field${wanted('propertyType')}`}>
          <label htmlFor="es-property">Property type</label>
          <select id="es-property" value={propertyType} onChange={(e) => setPropertyType(e.target.value)}>
            <option value="">Choose…</option>
            <option value="house">House</option>
            <option value="condo">Condo / townhouse</option>
            <option value="apartment">Apartment</option>
            <option value="commercial">Commercial</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="es-photos">Photos of the issue</label>
          <input
            id="es-photos"
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setPhotos(Array.from(e.target.files ?? []).slice(0, 6))}
          />
          {photos.length > 0 ? <small className="field-hint">{photos.length} photo{photos.length === 1 ? '' : 's'} attached.</small> : null}
        </div>
      </div>

      {/* Hidden while the follow-up block is up — that block carries its own
          "Check again", and two buttons doing the same thing on one screen is
          two chances to press the wrong one. */}
      {!eligible && followUps.length === 0 ? (
        <div className="field full" style={{ marginTop: '1rem' }}>
          <button type="button" className="btn secondary" onClick={checkEligibility} disabled={checking}>
            {checking ? 'Checking…' : 'Check if this qualifies'}
          </button>
        </div>
      ) : null}

      {verdict?.unsafe && verdict.safety ? (
        <p className="payment-banner warning" style={{ marginTop: '1rem' }}>
          ⚠️ {verdict.safety}
        </p>
      ) : null}
      {verdict && !verdict.unsafe && verdict.needsPhotos ? (
        <p className="payment-banner muted" style={{ marginTop: '1rem' }}>{verdict.reason}</p>
      ) : null}
      {verdict && !verdict.unsafe && !verdict.needsPhotos && verdict.eligible === false ? (
        followUps.length > 0 ? (
          // One answer short, not turned away. The questions above are optional,
          // so a blank one reaches the screener as "(unknown)" — and being told
          // "not a fit" because you skipped a dropdown is a lost job for the
          // contractor and a dead end for the customer. Only ever shown for
          // questions that genuinely feed the verdict.
          <div className="payment-banner muted es-followups" style={{ marginTop: '1rem' }}>
            <p>
              {verdict.reason || 'This one’s hard to call from what’s here.'}{' '}
              <strong>
                Before you give up: {followUps.length === 1 ? 'one question above is' : `${followUps.length} questions above are`} still
                blank.
              </strong>{' '}
              {followUps.length === 1 ? 'It often changes the answer.' : 'They often change the answer.'}
            </p>
            <ul className="es-followup-list">
              {followUps.map((question) => (
                <li key={question.key}>{question.label}</li>
              ))}
            </ul>
            <button type="button" className="btn secondary" onClick={checkEligibility} disabled={checking}>
              {checking ? 'Checking…' : 'Check again'}
            </button>
          </div>
        ) : (
          <p className="payment-banner muted" style={{ marginTop: '1rem' }}>
            {verdict.reason || 'This job isn’t a fit for a Quick Stop.'} You can still request a regular booking above.
          </p>
        )
      ) : null}

      {eligible ? (
        <>
          <p className="payment-banner success" style={{ marginTop: '1rem' }}>
            ✓ This looks like a fit{verdict?.visitMinutes ? ` — roughly a ${verdict.visitMinutes}-minute visit` : ''}. Add your details and acceptable times below.
          </p>
          <div className="form-grid" style={{ marginTop: '1rem' }}>
            {days.length > 1 ? (
              <div className="field full">
                <label htmlFor="es-day">Which day suits you?</label>
                <div className="es-day-row" role="radiogroup" aria-label="Which day suits you">
                  {days.map((day) => (
                    <button
                      key={day.dateKey}
                      type="button"
                      role="radio"
                      aria-checked={requestedDate === day.dateKey}
                      className={`es-day-chip${requestedDate === day.dateKey ? ' is-on' : ''}`}
                      onClick={() => setRequestedDate(day.dateKey)}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
                <small className="field-hint">
                  {businessName} is already out on these days — you&apos;re asking to be added to a route, not booking a
                  fresh appointment.
                </small>
              </div>
            ) : null}
            <div className="field full">
              <label htmlFor="es-availability">
                What times work {days.length > 1 ? (days.find((d) => d.dateKey === requestedDate)?.label ?? 'that day').toLowerCase() : 'today'}?
              </label>
              <textarea id="es-availability" rows={2} value={availability} onChange={(e) => setAvailability(e.target.value)} placeholder="Any time after 2pm, or early evening." />
              <small className="field-hint">Give a window that works — the contractor proposes an exact arrival time, they don&apos;t auto-book it.</small>
            </div>
            <div className="field full">
              <label htmlFor="es-name">Full name</label>
              <input id="es-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Jane Homeowner" />
            </div>
            <div className="field">
              <label htmlFor="es-phone">Mobile</label>
              <input id="es-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(248) 555-0199" />
            </div>
            <div className="field">
              <label htmlFor="es-email">Email</label>
              <input id="es-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@email.com" />
            </div>
            <p className="field-hint booking-contact-hint">Add a mobile <strong>or</strong> an email &mdash; {businessName} needs one to get back to you.</p>
            <div className="field full">
              <label htmlFor="es-address">Address</label>
              <input id="es-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="1418 Maplewood Ave, Royal Oak, MI" />
            </div>
          </div>
          <div className="field full" style={{ marginTop: '.5rem' }}>
            <button type="button" className="btn primary" onClick={submit} disabled={submitting}>
              {submitting ? 'Sending…' : 'Request a Quick Stop'}
            </button>
          </div>
        </>
      ) : null}

      {error ? <p className="payment-banner warning" style={{ marginTop: '1rem' }}>{error}</p> : null}
    </section>
  );
}
