'use client';

import { useState } from 'react';
import SaveButton from '@/components/save-button';
import { sendCampaignAction, sendTestEmailAction } from './actions';

type Reach = { total: number; email: number; sms: number; either: number };

type Props = {
  audiences: { id: string; label: string; hint: string }[];
  reach: Record<string, Reach>;
  /**
   * A draft handed over from somewhere else — today, the Extra Stops page,
   * which knows why the message is worth sending and how many people it
   * reaches, but has no business owning how a campaign is sent.
   */
  initial?: { channel?: 'email' | 'sms' | 'both'; audience?: string; subject?: string; body?: string };
};

const CHANNELS = [
  { id: 'email', label: 'Email' },
  { id: 'sms', label: 'Text' },
  { id: 'both', label: 'Email + text' },
] as const;

// Rough SMS segment guide: 160 GSM-7 chars per part. We prefix the business name
// and " Reply STOP to opt out." so the usable body is a bit less — surface a
// warning once the owner's text is long enough to bill as multiple segments.
const SMS_SEGMENT = 160;

export default function CampaignComposer({ audiences, reach, initial }: Props) {
  const [channel, setChannel] = useState<'email' | 'sms' | 'both'>(initial?.channel ?? 'email');
  const [audience, setAudience] = useState(initial?.audience ?? audiences[0]?.id ?? 'past');
  const [body, setBody] = useState(initial?.body ?? '');

  const wantEmail = channel === 'email' || channel === 'both';
  const wantSms = channel === 'sms' || channel === 'both';

  const audienceReach = reach[audience] ?? { total: 0, email: 0, sms: 0, either: 0 };
  const reachCount = channel === 'email' ? audienceReach.email : channel === 'sms' ? audienceReach.sms : audienceReach.either;
  const unreachable = audienceReach.total - reachCount;

  const smsSegments = Math.max(1, Math.ceil((body.length + 40) / SMS_SEGMENT));

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    // The test button is the only submitter with its own formAction; it routes
    // to a different action and never needs a reach warning or confirm.
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.hasAttribute('formaction')) return;
    if (reachCount === 0) {
      event.preventDefault();
      window.alert('No one in this audience is reachable on the channel you picked. Try a different audience or channel.');
      return;
    }
    const noun = reachCount === 1 ? 'client' : 'clients';
    if (!window.confirm(`Send this to ${reachCount} ${noun}? This goes out right away.`)) {
      event.preventDefault();
    }
  }

  return (
    <form action={sendCampaignAction} onSubmit={handleSubmit} className="campaign-form">
      <div className="field">
        <label>Reach them by</label>
        <div className="channel-toggle" role="radiogroup" aria-label="Channel">
          {CHANNELS.map((option) => (
            <label key={option.id} className={`channel-option${channel === option.id ? ' is-active' : ''}`}>
              <input
                type="radio"
                name="channel"
                value={option.id}
                checked={channel === option.id}
                onChange={() => setChannel(option.id)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Send to</label>
        <div className="audience-grid">
          {audiences.map((option) => {
            const r = reach[option.id] ?? { total: 0, email: 0, sms: 0, either: 0 };
            const count = channel === 'email' ? r.email : channel === 'sms' ? r.sms : r.either;
            return (
              <label key={option.id} className={`audience-card${audience === option.id ? ' is-active' : ''}`}>
                <input
                  type="radio"
                  name="audience"
                  value={option.id}
                  checked={audience === option.id}
                  onChange={() => setAudience(option.id)}
                />
                <span className="audience-card-top">
                  <strong>{option.label}</strong>
                  <span className="audience-count">{count}</span>
                </span>
                <span className="audience-hint">{option.hint}</span>
              </label>
            );
          })}
        </div>
      </div>

      {wantEmail ? (
        <div className="field">
          <label htmlFor="campaign-subject">Email subject</label>
          <input id="campaign-subject" name="subject" type="text" maxLength={140} defaultValue={initial?.subject ?? ''} placeholder="Booking spring projects now — a little something for past customers" />
        </div>
      ) : (
        // Keep the field in the form so switching channel client-side doesn't drop a typed subject.
        <input type="hidden" name="subject" value="" />
      )}

      <div className="field">
        <label htmlFor="campaign-body">Message</label>
        <textarea
          id="campaign-body"
          name="body"
          rows={6}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={"Hi {name}, it's been a while! We're booking projects for the season and wanted to offer past customers 10% off. Reply or call to grab a spot."}
          required
        />
        <p className="field-note">
          Use <code>{'{name}'}</code> to drop in each customer&apos;s first name.
          {wantSms ? (
            <span className={smsSegments > 1 ? ' warn' : ''}>
              {' '}Texts: ~{smsSegments} segment{smsSegments > 1 ? 's' : ''} each (business name &amp; opt-out line are added automatically).
            </span>
          ) : null}
        </p>
      </div>

      <div className="campaign-reach">
        <div>
          <strong>{reachCount}</strong> reachable now
          {unreachable > 0 ? <span className="muted"> · {unreachable} skipped (no {wantSms && !wantEmail ? 'opted-in number' : wantEmail && !wantSms ? 'email' : 'email or opted-in number'})</span> : null}
        </div>
        <div className="campaign-actions">
          <SaveButton className="btn secondary" formAction={sendTestEmailAction} pendingLabel="Sending…" savedLabel="Test sent ✓" aria-label="Send a test email to yourself">
            Send test to myself
          </SaveButton>
          <SaveButton className="btn primary" pendingLabel="Sending…" savedLabel="Sent ✓">
            Send campaign
          </SaveButton>
        </div>
      </div>
    </form>
  );
}
