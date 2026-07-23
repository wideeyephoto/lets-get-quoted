'use client';

import { useState, useTransition } from 'react';
import { LEAD_DECLINE_REASONS } from '@/lib/leads';
import { archiveLeadAction, blockLeadContactAction, declineLeadAction, snoozeLeadAction, unsnoozeLeadAction } from '../actions';
import styles from '../leads.module.css';

const DECLINE_LABELS: Record<string, string> = {
  out_of_area: 'Out of area',
  excluded_work: 'Not our work',
  below_minimum: 'Too small',
  fully_booked: 'Fully booked',
};

type LeadTriageActionsProps = {
  leadId: string;
  hasPhone: boolean;
  snoozed: boolean;
  archived: boolean;
  declinedReason: string | null;
};

// One-tap time-savers for a lead that isn't worth a call: decline with a
// polite templated text, snooze it off the board, archive it, or block the
// contact from submitting again.
export default function LeadTriageActions({ leadId, hasPhone, snoozed, archived, declinedReason }: LeadTriageActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [showReasons, setShowReasons] = useState(false);
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

  return (
    <div className={styles.triageBox}>
      <span className={styles.leadStatusActionsLabel}>Not a fit?</span>
      <div className={styles.triageRow}>
        {declinedReason ? (
          <span className={styles.triageDone}>Declined — {DECLINE_LABELS[declinedReason] || declinedReason}</span>
        ) : (
          <button type="button" className="btn secondary" disabled={isPending} onClick={() => setShowReasons((value) => !value)}>
            {hasPhone ? 'Decline & text back…' : 'Decline…'}
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
      {showReasons && !declinedReason && (
        <div className={styles.triageRow}>
          {Object.keys(LEAD_DECLINE_REASONS).map((key) => (
            <button
              key={key}
              type="button"
              className="btn secondary"
              disabled={isPending}
              onClick={() => run(async () => {
                const result = await declineLeadAction(leadId, key);
                setShowReasons(false);
                setNote(result.texted ? 'Declined — a polite text was sent.' : 'Declined. No text sent (no phone or opted out).');
              })}
            >
              {DECLINE_LABELS[key]}
            </button>
          ))}
        </div>
      )}
      {showReasons && !declinedReason && hasPhone && <small className={styles.triageHint}>Picking a reason texts them a polite close-out and marks the lead lost.</small>}
      {note && <small className={styles.triageNote} role="status">{note}</small>}
    </div>
  );
}
