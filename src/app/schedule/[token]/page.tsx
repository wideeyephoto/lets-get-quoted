import Link from 'next/link';
import SaveButton from '@/components/save-button';
import { formatScheduleOption, getPublicScheduleRequest } from '@/lib/scheduling';
import { requestDifferentScheduleOptionsAction, selectScheduleOptionAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function PublicScheduleRequestPage({
  params,
}: {
  params: { token: string };
}) {
  const request = await getPublicScheduleRequest(params.token);

  if (!request) {
    return (
      <main className="wide-shell workspace-shell schedule-choice-shell">
        <section className="workspace-hero panel">
          <div className="workspace-hero-copy">
            <p className="eyebrow">Scheduling</p>
            <h1 className="workspace-title">This scheduling link is no longer available</h1>
            <p className="workspace-lead">Ask your contractor to send a fresh set of dates and times.</p>
          </div>
        </section>
      </main>
    );
  }

  const selectedOption = request.selected_index == null ? null : request.options[request.selected_index];

  if (request.status === 'selected' && selectedOption) {
    return (
      <main className="wide-shell workspace-shell schedule-choice-shell">
        <section className="workspace-hero panel schedule-choice-hero">
          <div className="workspace-hero-copy">
            <p className="eyebrow">{request.businessName}</p>
            <h1 className="workspace-title">You&apos;re scheduled</h1>
            <p className="workspace-lead">{request.job.ref} for {request.job.client_name}</p>
            <div className="payment-banner success">
              <p><strong>{formatScheduleOption(selectedOption)}</strong> is confirmed.</p>
              {request.client_notes ? <p>Notes: {request.client_notes}</p> : null}
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (request.status === 'needs_more_options') {
    return (
      <main className="wide-shell workspace-shell schedule-choice-shell">
        <section className="workspace-hero panel schedule-choice-hero">
          <div className="workspace-hero-copy">
            <p className="eyebrow">{request.businessName}</p>
            <h1 className="workspace-title">We&apos;ll send different options</h1>
            <p className="workspace-lead">Your note has been sent to the contractor.</p>
            {request.client_notes ? <div className="payment-banner muted"><p>{request.client_notes}</p></div> : null}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="wide-shell workspace-shell schedule-choice-shell">
      <section className="workspace-hero panel schedule-choice-hero">
        <div className="workspace-hero-copy">
          <p className="eyebrow">{request.businessName}</p>
          <h1 className="workspace-title">Choose a service time</h1>
          <p className="workspace-lead">{request.job.ref} for {request.job.client_name}{request.job.address ? ` at ${request.job.address}` : ''}</p>
        </div>
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Available options</p>
          <h2>Pick the date that works best</h2>
        </div>
        <div className="schedule-choice-grid">
          {request.options.map((option, index) => (
            <form action={selectScheduleOptionAction.bind(null, params.token)} className="schedule-choice-card" key={`${option.date}-${option.time ?? 'anytime'}`}>
              <input type="hidden" name="optionIndex" value={index} />
              <span className="schedule-choice-label">Option {index + 1}</span>
              <strong>{formatScheduleOption(option)}</strong>
              <textarea name="notes" rows={2} placeholder="Optional note" />
              <SaveButton pendingLabel="Choosing..." savedLabel="Chosen">Choose this time</SaveButton>
            </form>
          ))}
        </div>
      </section>

      <section className="panel workspace-section-card schedule-different-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Need a different time?</p>
          <h2>Request other dates or times</h2>
        </div>
        <form action={requestDifferentScheduleOptionsAction.bind(null, params.token)} className="form-grid">
          <div className="field full">
            <label htmlFor="different-notes">Optional notes</label>
            <textarea id="different-notes" name="notes" rows={4} placeholder="Share days or times that usually work better for you." />
          </div>
          <div className="field full">
            <SaveButton className="btn secondary" pendingLabel="Sending..." savedLabel="Sent">I need different dates/times</SaveButton>
          </div>
        </form>
      </section>

      <p className="job-meta schedule-choice-footer">
        <Link href="/sms-terms">SMS Terms</Link> &middot; <Link href="/privacy">Privacy Policy</Link>
      </p>
    </main>
  );
}
