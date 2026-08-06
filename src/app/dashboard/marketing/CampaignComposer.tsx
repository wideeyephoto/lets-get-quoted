'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import SaveButton from '@/components/save-button';
import {
  checkCampaign,
  rankFindings,
  hasBlockingFinding,
  type CampaignFinding,
} from '@/lib/campaign-guard';
import { previewCampaignEmailAction, readCampaignAction, sendCampaignAction, sendTestEmailAction } from './actions';

type Reach = { total: number; email: number; sms: number; either: number; missingContact: number; optedOut: number; excluded: number };

const EMPTY_REACH: Reach = { total: 0, email: 0, sms: 0, either: 0, missingContact: 0, optedOut: 0, excluded: 0 };

type Props = {
  audiences: { id: string; label: string; hint: string }[];
  reach: Record<string, Reach>;
  /**
   * A draft handed over from somewhere else — the seasonal calendar above, a
   * recommended campaign card, or the Quick Stops page, all of which know WHY
   * a message is worth sending but have no business owning how one gets sent.
   */
  initial?: {
    channel?: 'email' | 'sms' | 'both';
    audience?: string;
    subject?: string;
    subjectOptions?: string[];
    body?: string;
    beatId?: string;
    /** Which template card produced this draft, shown in the banner below. */
    templateName?: string;
    /** One-line "why this" shown alongside templateName. */
    templateExplanation?: string;
    /** Static display-only suggestion (e.g. "Tuesday mornings tend to open best") — not scheduling. */
    sendTimeHint?: string;
  };
  /** CAN-SPAM postal address, or null when there isn't one on file. */
  mailingAddress: string | null;
  daysSinceLastSend: number | null;
  unsubscribesSinceLastSend: number;
  /** Reports whether there's unsaved text in the box, so a caller can confirm before replacing it. */
  onDirtyChange?: (dirty: boolean) => void;
};

const CHANNELS = [
  { id: 'email', label: 'Email' },
  { id: 'sms', label: 'Text' },
  { id: 'both', label: 'Email + text' },
] as const;

const SEVERITY_LABEL: Record<CampaignFinding['severity'], string> = {
  high: 'Fix first',
  medium: 'Worth a look',
  low: 'Minor',
};

const SOURCE_LABEL: Record<CampaignFinding['source'], string> = {
  check: 'Checked',
  history: 'Your history',
  ai: 'Read by AI',
};

export default function CampaignComposer({
  audiences,
  reach,
  initial,
  mailingAddress,
  daysSinceLastSend,
  unsubscribesSinceLastSend,
  onDirtyChange,
}: Props) {
  const [channel, setChannel] = useState<'email' | 'sms' | 'both'>(initial?.channel ?? 'email');
  const [audience, setAudience] = useState(initial?.audience ?? audiences[0]?.id ?? 'past');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [aiFindings, setAiFindings] = useState<CampaignFinding[] | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [checking, startChecking] = useTransition();
  const [previewing, startPreviewing] = useTransition();

  const subjectOptions = initial?.subjectOptions ?? [];

  useEffect(() => {
    onDirtyChange?.(subject.trim() !== '' || body.trim() !== '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, body]);

  const wantEmail = channel === 'email' || channel === 'both';
  const wantSms = channel === 'sms' || channel === 'both';

  const audienceReach = reach[audience] ?? EMPTY_REACH;
  const reachCount = channel === 'email' ? audienceReach.email : channel === 'sms' ? audienceReach.sms : audienceReach.either;
  const unreachable = audienceReach.total - reachCount;

  /**
   * The deterministic half of the guard, live.
   *
   * Pure, so it runs on every keystroke with no server round trip. The
   * contractor sees "{first_name} won't be filled in" while they are still
   * writing rather than after two hundred people have received it.
   */
  const checks = useMemo(
    () =>
      checkCampaign({
        channel,
        subject,
        body,
        reachCount,
        mailingAddress,
        daysSinceLastSend,
        unsubscribesSinceLastSend,
      }),
    [channel, subject, body, reachCount, mailingAddress, daysSinceLastSend, unsubscribesSinceLastSend],
  );

  const findings = useMemo(() => rankFindings([...checks, ...(aiFindings ?? [])]), [checks, aiFindings]);
  const serious = hasBlockingFinding(findings);

  function runRead() {
    setAiFindings(null);
    startChecking(async () => {
      setAiFindings(await readCampaignAction({ channel, subject, body }));
    });
  }

  function runPreview() {
    startPreviewing(async () => {
      setPreview(await previewCampaignEmailAction(subject, body));
    });
  }

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
    // A serious finding gets named in the confirm rather than left in a panel
    // above the fold that somebody has already scrolled past.
    if (serious) {
      const worst = findings.filter((finding) => finding.severity === 'high').map((finding) => `• ${finding.title}`).join('\n');
      if (!window.confirm(`Before this goes to ${reachCount}:\n\n${worst}\n\nSend anyway?`)) {
        event.preventDefault();
        return;
      }
    }
    const noun = reachCount === 1 ? 'client' : 'clients';
    if (!window.confirm(`Send this to ${reachCount} ${noun}? This goes out right away.`)) {
      event.preventDefault();
    }
  }

  return (
    <form action={sendCampaignAction} onSubmit={handleSubmit} className="campaign-form">
      {/* Which topic this came from, so the send is recorded against it and the
          calendar card above can say "emailed on the 3rd". Validated server-side
          against the known topics — it arrives from the browser. */}
      {initial?.beatId ? <input type="hidden" name="beatId" value={initial.beatId} /> : null}

      {initial?.templateName ? (
        <div className="campaign-template-banner">
          <strong>{initial.templateName}</strong>
          {initial.templateExplanation ? <p>{initial.templateExplanation}</p> : null}
          {initial.sendTimeHint ? <p className="campaign-template-banner-hint">{initial.sendTimeHint}</p> : null}
        </div>
      ) : null}

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
            const r = reach[option.id] ?? EMPTY_REACH;
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
          <input
            id="campaign-subject"
            name="subject"
            type="text"
            maxLength={140}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Booking spring projects now — a little something for past customers"
          />
          {/* Alternatives to CHOOSE between, not to test. We deliberately don't
              track opens, so there is nothing to measure and the wording must
              not pretend otherwise. */}
          {subjectOptions.length > 0 ? (
            <div className="campaign-subject-options">
              <span className="campaign-subject-options-label">Or try:</span>
              {subjectOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`campaign-subject-option${subject === option ? ' is-active' : ''}`}
                  onClick={() => setSubject(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}
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
            <span className={body.length + 40 > 160 ? ' warn' : ''}>
              {' '}Texts: ~{Math.max(1, Math.ceil((body.length + 40) / 160))} segment
              {Math.max(1, Math.ceil((body.length + 40) / 160)) > 1 ? 's' : ''} each (business name &amp; opt-out line are
              added automatically).
            </span>
          ) : null}
        </p>
      </div>

      {/* Campaign Guard. The checks are already on screen before anybody asks
          for them — a check you have to remember to run is a check that runs
          after the mistake. */}
      {body.trim() ? (
        <div className={`campaign-guard${serious ? ' has-serious' : ''}`}>
          <div className="campaign-guard-head">
            <strong>
              {findings.length === 0
                ? 'Nothing flagged'
                : `${findings.length} thing${findings.length === 1 ? '' : 's'} to look at`}
            </strong>
            <button type="button" className="btn ghost" onClick={runRead} disabled={checking}>
              {checking ? 'Reading…' : aiFindings ? 'Read it again' : 'Have AI read it'}
            </button>
          </div>

          {findings.length === 0 && aiFindings === null ? (
            <p className="campaign-guard-empty">
              The mechanical checks pass. &ldquo;Have AI read it&rdquo; looks for what the message is missing — a
              reason it&apos;s arriving now, something useful to someone who&apos;ll never book, a clear single ask.
            </p>
          ) : null}

          {findings.map((finding) => (
            <div key={finding.id} className={`campaign-guard-finding sev-${finding.severity}`}>
              <div className="campaign-guard-finding-top">
                <strong>{finding.title}</strong>
                <span className="campaign-guard-tag">
                  {SEVERITY_LABEL[finding.severity]} · {SOURCE_LABEL[finding.source]}
                </span>
              </div>
              <p>{finding.detail}</p>
            </div>
          ))}

          {aiFindings !== null && aiFindings.length === 0 ? (
            <p className="campaign-guard-empty">
              The read found nothing missing. It only ever says what&apos;s absent — it never rewrites your message.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="campaign-reach">
        <div>
          <strong>{reachCount}</strong> reachable now
          {unreachable > 0 ? <span className="muted"> · {unreachable} skipped (no {wantSms && !wantEmail ? 'opted-in number' : wantEmail && !wantSms ? 'email' : 'email or opted-in number'})</span> : null}
        </div>
        <ul className="campaign-eligibility-breakdown">
          <li>{audienceReach.total} selected</li>
          <li>{audienceReach.email} valid email</li>
          <li>{audienceReach.sms} valid text</li>
          <li>{audienceReach.missingContact} missing contact info</li>
          <li>{audienceReach.optedOut} opted out</li>
          <li>{audienceReach.excluded} excluded</li>
        </ul>
        <div className="campaign-actions">
          {wantEmail ? (
            <button type="button" className="btn ghost" onClick={runPreview} disabled={previewing || !body.trim()}>
              {previewing ? 'Rendering…' : 'Preview the email'}
            </button>
          ) : null}
          <SaveButton className="btn secondary" formAction={sendTestEmailAction} pendingLabel="Sending…" savedLabel="Test sent ✓" aria-label="Send a test email to yourself">
            Send test to myself
          </SaveButton>
          <SaveButton className="btn primary" pendingLabel="Sending…" savedLabel="Sent ✓">
            Send campaign
          </SaveButton>
        </div>
      </div>

      {/* Rendered by the same function that builds the real email, in a sandboxed
          frame. srcDoc rather than a URL so nothing is stored to preview it, and
          allow-same-origin is deliberately absent — the email is the owner's own
          text but it is still rendered markup, and it has no business reaching
          anything on the page around it. */}
      {preview ? (
        <div className="campaign-preview">
          <div className="campaign-preview-head">
            <strong>This is the email</strong>
            <button type="button" className="btn ghost" onClick={() => setPreview(null)}>Close</button>
          </div>
          <iframe title="Email preview" className="campaign-preview-frame" sandbox="" srcDoc={preview} />
          <p className="field-note">
            The unsubscribe link and postal address at the bottom are added to every marketing email — they&apos;re
            what makes it lawful to send.
          </p>
        </div>
      ) : null}
    </form>
  );
}
