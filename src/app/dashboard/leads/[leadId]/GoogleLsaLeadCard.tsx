import SaveButton from '@/components/save-button';
import Link from 'next/link';
import type { GoogleLsaLeadDetail } from '@/lib/google-lsa/lead-detail';

function label(value: string | null): string {
  if (!value) return 'Not reported';
  return value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function duration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

export default function GoogleLsaLeadCard({
  detail,
  ownerControls,
  submitFeedback,
}: {
  detail: GoogleLsaLeadDetail;
  ownerControls: boolean;
  submitFeedback: (formData: FormData) => Promise<void>;
}) {
  const feedbackKnown = detail.feedbackSubmitted || detail.feedbackStatus === 'succeeded';
  const feedbackOutcomeUnknown = detail.feedbackSubmitted && detail.feedbackStatus === 'pending';
  return (
    <section className="panel workspace-section-card" id="google-lsa-lead">
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">Google Local Services Ads</p>
        <h2>Provider activity</h2>
      </div>
      <p className="workspace-details-copy">
        Google classifies this as <strong>{label(detail.leadType)}</strong> with status <strong>{label(detail.leadStatus)}</strong>.
        {' '}It was <strong>{detail.leadCharged ? 'reported as charged' : 'not reported as charged'}</strong>
        {detail.creditState ? <> and its credit state is <strong>{label(detail.creditState)}</strong></> : null}.
        Google does not expose an individual dollar cost or credit amount for this lead.
      </p>
      {detail.note ? <p className="workspace-details-copy"><strong>Google note:</strong> {detail.note}</p> : null}

      {detail.conversations.length ? (
        <div style={{ display: 'grid', gap: '0.65rem', marginTop: '1rem' }}>
          {detail.conversations.map((conversation) => (
            <div key={conversation.id} className="empty-state" style={{ textAlign: 'left' }}>
              <strong>{label(conversation.channel)}</strong>
              {conversation.eventAt ? <> · {new Date(conversation.eventAt).toLocaleString()}</> : null}
              {duration(conversation.callDurationSeconds) ? <> · {duration(conversation.callDurationSeconds)}</> : null}
              {conversation.messageText ? <p style={{ margin: '0.35rem 0 0' }}>{conversation.messageText}</p> : null}
              {conversation.hasRecording ? <small>Google reports a recording. It stays private because playback requires your authorized Google login.</small> : null}
            </div>
          ))}
        </div>
      ) : <p className="empty-state">No conversation events have been returned for this lead yet.</p>}

      {feedbackOutcomeUnknown ? (
        <p className="empty-state" style={{ marginTop: '1rem' }}>
          Google reports that feedback exists for this lead, but it does not expose the accepted answer.
          This app&rsquo;s last submission outcome is still unconfirmed, so it will not send a duplicate.
        </p>
      ) : feedbackKnown ? (
        <p className="form-success" style={{ marginTop: '1rem' }}>
          Lead feedback was submitted{detail.feedback?.answer ? <>: <strong>{label(detail.feedback.answer)}</strong></> : ' in Google'}.
          {detail.feedback?.creditIssuanceDecision ? <> Bonus-credit decision: {label(detail.feedback.creditIssuanceDecision)}.</> : null}
        </p>
      ) : detail.feedbackStatus === 'pending' ? (
        <p className="empty-state" style={{ marginTop: '1rem' }}>Lead feedback is currently being sent to Google.</p>
      ) : ownerControls && detail.canSubmitFeedback ? (
        <form action={submitFeedback} className="form-grid compact-form" style={{ marginTop: '1rem' }}>
          {detail.feedbackStatus === 'failed' ? (
            <p className="form-error field full">The previous send failed{detail.feedbackError ? `: ${detail.feedbackError}` : '.'} You can retry below.</p>
          ) : null}
          <div className="field full">
            <label htmlFor="googleLsaFeedbackOutcome">Was this a useful lead?</label>
            <select id="googleLsaFeedbackOutcome" name="outcome" required defaultValue="">
              <option value="" disabled>Choose the closest outcome</option>
              <optgroup label="Good lead">
                <option value="satisfied:BOOKED_CUSTOMER">Booked this customer</option>
                <option value="very_satisfied:HIGH_VALUE_SERVICE">High-value service</option>
                <option value="satisfied:LIKELY_BOOKED_CUSTOMER">Likely to book</option>
                <option value="satisfied:SERVICE_RELATED">Relevant service request</option>
                <option value="satisfied:OTHER_SATISFIED_REASON">Other good lead</option>
              </optgroup>
              <option value="neutral">Neutral</option>
              <optgroup label="Poor lead">
                <option value="dissatisfied:DUPLICATE">Duplicate</option>
                <option value="dissatisfied:GEO_MISMATCH">Outside service area</option>
                <option value="dissatisfied:JOB_TYPE_MISMATCH">Wrong job type</option>
                <option value="dissatisfied:NOT_READY_TO_BOOK">Not ready to book</option>
                <option value="very_dissatisfied:SOLICITATION">Solicitation</option>
                <option value="very_dissatisfied:SPAM">Spam</option>
                <option value="dissatisfied:OTHER_DISSATISFIED_REASON">Other poor lead</option>
              </optgroup>
            </select>
          </div>
          <div className="field full">
            <label htmlFor="googleLsaFeedbackComment">Details</label>
            <textarea id="googleLsaFeedbackComment" name="comment" rows={3} maxLength={1000} placeholder="Required when you choose an Other outcome" />
          </div>
          <div className="form-actions">
            <SaveButton pendingLabel="Sending to Google…" savedLabel="Feedback sent ✓">Send lead feedback</SaveButton>
          </div>
        </form>
      ) : ownerControls ? (
        <p className="empty-state" style={{ marginTop: '1rem' }}>
          Reconnect Google Local Services in <Link href="/dashboard/settings#google-local-services">Connected apps</Link> to send lead feedback.
        </p>
      ) : null}
    </section>
  );
}
