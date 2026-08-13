'use client';

import { useMemo, useState } from 'react';
import SaveButton from '@/components/save-button';
import {
  LINK_PLACEHOLDER,
  MAX_OFFER_MESSAGE,
  offerMessageProblem,
  personalizeOfferMessage,
} from '@/lib/subcontractor-dispatch';
import styles from '../../dispatch.module.css';

// Pick who gets the offer, read what they will get, then send.
//
// THE ONE RULE THIS COMPONENT ENFORCES: ticking a box sends nothing. Selection
// is local state and the only thing that reaches a phone is the submit at the
// bottom, which is a server action on a form. There is no onChange that posts,
// no debounce that saves, and no optimistic anything — because the cost of
// getting that wrong is a real subcontractor receiving a real text about a job
// the owner was still thinking about.

export type Recipient = {
  crewId: string;
  name: string;
  companyName: string | null;
  displayName: string;
  trades: string[];
  distanceLabel: string;
  availability: string;
  ratingLabel: string;
  completed: number;
  complianceLabel: string;
  complianceTone: string;
  subStatus: string | null;
  reasons: string[];
  blockers: string[];
  eligible: boolean;
  recommended: boolean;
  /** Already has an offer on this request — shown, and not selectable again. */
  alreadyOffered: boolean;
};

export default function RecipientPicker({
  recipients,
  defaultMessage,
  action,
  sampleLink,
}: {
  recipients: Recipient[];
  defaultMessage: string;
  action: (formData: FormData) => void;
  /** What a real link looks like, for the preview. Never a live token. */
  sampleLink: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(recipients.filter((entry) => entry.recommended && !entry.alreadyOffered).map((entry) => entry.crewId)),
  );
  const [message, setMessage] = useState(defaultMessage);

  const selectable = recipients.filter((entry) => entry.eligible && !entry.alreadyOffered);
  const problem = offerMessageProblem(message);
  const count = selected.size;

  const preview = useMemo(() => personalizeOfferMessage(message, sampleLink), [message, sampleLink]);
  // Segment arithmetic, not a character count for its own sake: an owner who
  // adds one sentence and pushes a 1-segment text to 2 has doubled what the
  // send costs, and nothing else on the page would tell them.
  const segments = Math.max(1, Math.ceil(preview.length / 160));

  function toggle(crewId: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(crewId)) next.delete(crewId);
      else next.add(crewId);
      return next;
    });
  }

  return (
    <form action={action}>
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">Recipients</p>
        <h2>Choose who gets the offer</h2>
      </div>

      <p className={styles.formNote}>
        {selectable.length} {selectable.length === 1 ? 'match' : 'matches'} for this job, best first. Everybody is
        listed — where a firm cannot be sent this one, the reason is on their row.
      </p>

      <div className={styles.requestActions} style={{ marginBottom: '0.75rem' }}>
        <button
          type="button"
          className="btn ghost"
          onClick={() => setSelected(new Set(selectable.map((entry) => entry.crewId)))}
        >
          Select all {selectable.length}
        </button>
        <button type="button" className="btn ghost" onClick={() => setSelected(new Set())}>
          Clear selection
        </button>
      </div>

      <ul className={styles.matchList}>
        {recipients.map((entry, index) => {
          const disabled = !entry.eligible || entry.alreadyOffered;
          const inputId = `recipient-${entry.crewId}`;
          return (
            <li key={entry.crewId} className={styles.matchRow}>
              <label className={styles.matchLabel} htmlFor={inputId}>
                <input
                  id={inputId}
                  className={styles.matchCheck}
                  type="checkbox"
                  name="crewIds"
                  value={entry.crewId}
                  disabled={disabled}
                  checked={selected.has(entry.crewId)}
                  onChange={() => toggle(entry.crewId)}
                  aria-describedby={`${inputId}-facts`}
                />
                <span className={styles.matchBody}>
                  <span className={styles.matchName}>
                    {entry.displayName}
                    {entry.companyName ? <small>{entry.name}</small> : null}
                    <span className={styles.chip} data-tone={entry.complianceTone}>
                      {entry.complianceLabel}
                    </span>
                    {entry.subStatus ? (
                      <span className={styles.chip} data-tone={entry.subStatus === 'Preferred' ? 'ok' : 'muted'}>
                        {entry.subStatus}
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.matchFacts} id={`${inputId}-facts`}>
                    <span>{entry.trades.join(' · ') || 'No trades listed'}</span>
                    <span>{entry.distanceLabel}</span>
                    <span>{entry.availability}</span>
                    <span>{entry.ratingLabel}</span>
                    <span>{entry.completed} completed</span>
                  </span>
                  {entry.blockers.length > 0 ? (
                    <span className={styles.matchBlockers}>{entry.blockers.join(' · ')}</span>
                  ) : null}
                  {entry.alreadyOffered ? (
                    <span className={styles.matchBlockers}>Already sent this offer</span>
                  ) : null}
                </span>
                <span className={styles.matchSide}>
                  <span className={styles.matchRank}>#{index + 1}</span>
                  <span>{entry.reasons.slice(0, 2).join(' · ')}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="section-heading workspace-section-heading" style={{ marginTop: '1.5rem' }}>
        <p className="eyebrow">Message</p>
        <h2>What each of them receives</h2>
      </div>

      <div className={styles.previewCard}>
        <label htmlFor="messageBody">
          <strong>Text message</strong>
        </label>
        <textarea
          id="messageBody"
          name="messageBody"
          className={styles.messageBox}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={MAX_OFFER_MESSAGE + 80}
          aria-describedby="message-help"
        />
        <p id="message-help" className={styles.formNote}>
          Keep <code>{LINK_PLACEHOLDER}</code> in the message. Each recipient&rsquo;s copy gets their own private link
          there — one link per firm, so an offer cannot be forwarded and accepted by somebody who was never asked.
        </p>

        <div className={styles.previewBubble} aria-live="polite">
          {preview}
        </div>
        <p className={styles.previewMeta}>
          <span>
            {preview.length} characters · {segments} {segments === 1 ? 'segment' : 'segments'}
          </span>
          <span>
            {count} personalized secure {count === 1 ? 'link' : 'links'}
          </span>
        </p>
        {problem ? (
          <p className={styles.previewProblem} role="alert">
            {problem}
          </p>
        ) : null}
      </div>

      <div className={styles.requestActions} style={{ marginTop: '1.25rem' }}>
        <SaveButton
          className="btn primary"
          disabled={count === 0 || problem !== null}
          pendingLabel="Sending…"
          savedLabel="Sent ✓"
          aria-label={count === 0 ? 'Send job offers — pick at least one subcontractor first' : undefined}
        >
          {count === 0 ? 'Send job offers' : `Send ${count} job ${count === 1 ? 'offer' : 'offers'} →`}
        </SaveButton>
      </div>
      <p className={styles.formNote}>
        Nothing has been sent yet. Pressing this creates one offer and one private link per selected firm, and texts
        them once.
      </p>
    </form>
  );
}
