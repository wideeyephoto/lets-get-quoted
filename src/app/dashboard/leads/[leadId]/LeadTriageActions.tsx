'use client';

import { useId, useState, useTransition } from 'react';
import { LEAD_DECLINE_REASONS } from '@/lib/leads';
import { archiveLeadAction, blockLeadContactAction, declineLeadAction, snoozeLeadAction, unsnoozeLeadAction } from '../actions';
import styles from '../leads.module.css';

const DECLINE_LABELS: Record<string, string> = {
  out_of_area: 'Out of area',
  excluded_work: 'Not our work',
  below_minimum: 'Too small',
  fully_booked: 'Fully booked',
};

// Mirrors sendLeadDeclineSms() so the owner previews the exact text the
// homeowner would receive before choosing to send it.
function declineTextPreview(businessName: string, leadName: string, reasonPhrase: string): string {
  return `Hi ${leadName || 'there'}, thanks for reaching out to ${businessName}. Unfortunately ${reasonPhrase}, so we won't be able to take this one on. We appreciate you thinking of us! Reply STOP to opt out.`;
}

type LeadTriageActionsProps = {
  leadId: string;
  hasPhone: boolean;
  snoozed: boolean;
  archived: boolean;
  declinedReason: string | null;
  leadName: string;
  businessName: string;
};

// One-tap time-savers for a lead that isn't worth a call: decline (optionally
// texting a polite close-out), snooze it off the board, archive it, or block
// the contact from submitting again.
export default function LeadTriageActions({ leadId, hasPhone, snoozed, archived, declinedReason, leadName, businessName }: LeadTriageActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [showDecline, setShowDecline] = useState(false);
  const declineId = useId();
  const [reason, setReason] = useState<string | null>(null);
  const [notify, setNotify] = useState(hasPhone);
  const [note, setNote] = useState<string | null>(null);

  const run = (fn: () => Promise<unknown>, doneNote?: string) => {
    setNote(null);
    startTransition(async () => {
      try {
        await fn();
        if (doneNote) setNote(doneNote);
      } catch (error) {
        setNote(error instanceof Error ? error.message : 'Something went wrong.');
      }
    });
  };

  function confirmDecline() {
    if (!reason) return;
    const willText = notify && hasPhone;
    run(async () => {
      const result = await declineLeadAction(leadId, reason, willText);
      setShowDecline(false);
      setNote(result.texted ? 'Declined — a polite text was sent.' : 'Declined. No text sent.');
    });
  }

  return (
    <div className={styles.triageBox}>
      <span className={styles.leadStatusActionsLabel}>Not a fit?</span>
      <div className={styles.triageRow}>
        {declinedReason ? (
          <span className={styles.triageDone}>Declined — {DECLINE_LABELS[declinedReason] || declinedReason}</span>
        ) : (
          <button
            type="button"
            className="btn secondary"
            disabled={isPending}
            onClick={() => setShowDecline((value) => !value)}
            aria-expanded={showDecline}
            // The panel is also gated on declinedReason, so the trigger must
            // not claim to control something the render is withholding.
            aria-controls={showDecline && !declinedReason ? declineId : undefined}
          >
            🚫 Decline job
          </button>
        )}
        {snoozed ? (
          <button type="button" className="btn ghost" disabled={isPending} onClick={() => run(() => unsnoozeLeadAction(leadId), 'Back on the board.')}>Unsnooze</button>
        ) : (
          <button type="button" className="btn ghost" disabled={isPending} onClick={() => run(() => snoozeLeadAction(leadId, 3), 'Snoozed for 3 days.')}>Snooze 3 days</button>
        )}
        <button type="button" className="btn ghost" disabled={isPending} onClick={() => run(() => archiveLeadAction(leadId, !archived), archived ? 'Restored.' : 'Archived.')}>{archived ? 'Unarchive' : 'Archive'}</button>
        <button
          type="button"
          className={`btn ghost ${styles.triageDanger}`}
          disabled={isPending}
          onClick={() => {
            if (window.confirm('Block this phone/email from submitting new website leads? Their future requests are silently dropped.')) {
              run(() => blockLeadContactAction(leadId), 'Contact blocked — future submissions are dropped.');
            }
          }}
        >
          Block contact
        </button>
      </div>

      {showDecline && !declinedReason ? (
        <div id={declineId} className={styles.declinePop}>
          <p className={styles.declineTitle}>Why are you declining?</p>
          <div className={styles.declineReasons}>
            {Object.keys(LEAD_DECLINE_REASONS).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={reason === key}
                className={`${styles.declineChip} ${reason === key ? styles.declineChipActive : ''}`}
                disabled={isPending}
                onClick={() => setReason(key)}
              >
                {DECLINE_LABELS[key]}
              </button>
            ))}
          </div>

          {hasPhone ? (
            <label className={styles.declineNotify}>
              <input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} />
              <span>
                <strong>Text the homeowner a polite decline</strong>
                <small>{notify ? 'They’ll get the message below.' : 'No text will be sent — the lead is declined silently.'}</small>
              </span>
            </label>
          ) : (
            <p className={styles.declineNoPhone}>No phone on file — the homeowner can’t be texted. The lead will be declined silently.</p>
          )}

          {reason && notify && hasPhone ? (
            <div className={styles.declinePreview}>
              <span>Text preview</span>
              <p>{declineTextPreview(businessName, leadName, LEAD_DECLINE_REASONS[reason])}</p>
            </div>
          ) : null}

          <div className={styles.declineActions}>
            <button type="button" className="btn ghost" disabled={isPending} onClick={() => setShowDecline(false)}>Cancel</button>
            <button type="button" className="btn primary" disabled={!reason || isPending} onClick={confirmDecline}>
              {notify && hasPhone ? '🚫 Decline & text' : '🚫 Decline job'}
            </button>
          </div>
        </div>
      ) : null}
      {note && <small className={styles.triageNote} role="status">{note}</small>}
    </div>
  );
}
