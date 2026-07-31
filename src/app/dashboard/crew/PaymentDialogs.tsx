'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useFormState } from 'react-dom';
import SaveButton from '@/components/save-button';
import {
  PAYMENT_METHODS,
  PAY_WARNING_HELP,
  PAY_WARNING_LABEL,
  UNDO_DISCLAIMER,
  buildPayConfirmation,
  hoursLabel,
  payMoney,
  type CrewPayRow,
  type PaymentMethod,
} from '@/lib/crew-pay';
import type { PayActionState } from './pay-actions';
import PayModal, { ActionResult } from './PayModal';
import styles from './crew.module.css';

const IDLE: PayActionState = { ok: false, message: '' };

// The method somebody used last time is almost always the method they'll use
// again, so it's remembered per browser. It is a default, never a silent
// choice: it's shown selected in the field before anything is recorded.
const METHOD_KEY = 'lgq_last_payment_method';

function rememberedMethod(): PaymentMethod | '' {
  if (typeof window === 'undefined') return '';
  const saved = window.localStorage.getItem(METHOD_KEY);
  return PAYMENT_METHODS.some((method) => method.id === saved) ? (saved as PaymentMethod) : '';
}

/**
 * Record a payment against the people named.
 *
 * Everything that could make this the wrong thing to do is on screen before the
 * button is: who is included, who is excluded and why, what it comes to, and
 * any warning attached to the hours. A warning has to be acknowledged out loud.
 */
export function PaymentConfirmDialog({
  rows,
  rangeLabel,
  todayKey,
  periodFields,
  action,
  onDone,
  onClose,
  onReviewFirst,
}: {
  rows: CrewPayRow[];
  rangeLabel: string;
  todayKey: string;
  periodFields: ReactNode;
  action: (prev: PayActionState, formData: FormData) => Promise<PayActionState>;
  onDone: (state: PayActionState) => void;
  onClose: () => void;
  onReviewFirst: () => void;
}) {
  const [state, formAction] = useFormState(action, IDLE);
  const [approveFirst, setApproveFirst] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [method, setMethod] = useState<PaymentMethod | ''>('');

  useEffect(() => setMethod(rememberedMethod()), []);
  useEffect(() => {
    if (!state.ok) return;
    if (method) window.localStorage.setItem(METHOD_KEY, method);
    onDone(state);
    // onDone closes this dialog; re-running on every render would fight it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const ids = useMemo(() => rows.map((row) => row.crewId ?? 'unassigned'), [rows]);
  // What the server will do, computed the same way. Shown, not sent — the
  // amounts recorded are always the ones the server derives for itself.
  const preview = useMemo(
    () => buildPayConfirmation(approveFirst ? rows.map((row) => (row.blockers.length === 0 && row.hours > 0 && row.eligible ? { ...row, review: 'approved' as const } : row)) : rows, ids),
    [rows, ids, approveFirst],
  );
  const unapproved = rows.filter((row) => row.eligible && row.hours > 0 && row.blockers.length === 0 && row.review !== 'approved');

  return (
    <PayModal
      title={preview.crewCount === 1 ? `Mark ${preview.rows[0]?.name ?? 'this crew member'} paid` : 'Mark as paid'}
      lead={`${rangeLabel} · recorded here only — this doesn’t move any money.`}
      onClose={onClose}
      dismissOnBackdrop={false}
      wide
    >
      <form action={formAction} className={styles.payForm}>
        {periodFields}
        {ids.map((id) => (
          <input key={id} type="hidden" name="crewIds" value={id} />
        ))}
        {approveFirst ? <input type="hidden" name="approveFirst" value="1" /> : null}

        <div className={styles.paySummaryStrip}>
          <div>
            <small>Crew members</small>
            <strong>{preview.crewCount}</strong>
          </div>
          <div>
            <small>Hours</small>
            <strong>{hoursLabel(preview.hours)}</strong>
          </div>
          <div className={styles.payTotalCell}>
            <small>Total</small>
            <strong>{payMoney(preview.amount)}</strong>
          </div>
        </div>

        {unapproved.length > 0 ? (
          <div className={styles.payNotice} data-tone="warn">
            <strong>
              {unapproved.length} {unapproved.length === 1 ? 'person’s hours have' : 'people’s hours have'} not been approved yet
            </strong>
            <p>{unapproved.map((row) => row.name).join(', ')}. Approving is where you agree the hours and what they come to.</p>
            <div className={styles.payNoticeActions}>
              <label className={styles.payCheck}>
                <input type="checkbox" checked={approveFirst} onChange={(event) => setApproveFirst(event.target.checked)} />
                <span>Approve these hours as part of this payment</span>
              </label>
              <button type="button" className="btn ghost" onClick={onReviewFirst}>
                Review first
              </button>
            </div>
          </div>
        ) : null}

        {preview.warnings.length > 0 ? (
          <div className={styles.payNotice} data-tone="warn">
            <strong>Worth a look before you record this</strong>
            <ul>
              {preview.warnings.map((item) => (
                <li key={item.warning}>
                  <b>{PAY_WARNING_LABEL[item.warning]}</b> — {item.names.join(', ')}. {PAY_WARNING_HELP[item.warning]}
                </li>
              ))}
            </ul>
            <label className={styles.payCheck}>
              <input
                type="checkbox"
                name="acknowledged"
                value="1"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              <span>I’ve reviewed these and want to record the payment anyway</span>
            </label>
          </div>
        ) : null}

        {preview.excluded.length > 0 ? (
          <div className={styles.payNotice}>
            <strong>Not included ({preview.excluded.length})</strong>
            <ul>
              {preview.excluded.map((item) => (
                <li key={item.name}>{item.reason}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className={styles.payGrid}>
          <label className={styles.payField}>
            <span>Payment date *</span>
            {/* Defaults to today because that's usually right, and is editable
                because a check written on Friday is often recorded on Monday. */}
            <input type="date" name="paymentDate" defaultValue={todayKey} max={todayKey} required />
            <em>The day the money went out.</em>
          </label>
          <label className={styles.payField}>
            <span>Method</span>
            <select name="paymentMethod" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod | '')}>
              <option value="">Not recorded</option>
              {PAYMENT_METHODS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.payField}>
            <span>Reference</span>
            <input name="paymentReference" maxLength={60} placeholder="Check #1042, batch id…" />
          </label>
          <label className={`${styles.payField} ${styles.payFieldWide}`}>
            <span>Internal note</span>
            <input name="paymentNote" maxLength={200} placeholder="Weekly payroll" />
          </label>
        </div>

        <ul className={styles.payWhoList}>
          {preview.rows.map((row) => (
            <li key={row.crewId}>
              <span>{row.name}</span>
              <span className={styles.payWhoHours}>{hoursLabel(row.hours)}</span>
              <strong>{payMoney(row.estimatedPay)}</strong>
            </li>
          ))}
        </ul>

        <ActionResult state={state.message ? state : null} />

        <div className={styles.payActions}>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <SaveButton
            className="btn primary"
            pendingLabel="Recording…"
            savedLabel="Recorded ✓"
            /* The count and the total belong in the accessible name: a screen
               reader user has to hear what they're confirming, not just the
               word "confirm". */
            aria-label={`Confirm and mark ${preview.crewCount} ${preview.crewCount === 1 ? 'crew member' : 'crew members'} paid, total ${payMoney(preview.amount)}`}
          >
            Confirm and mark paid
          </SaveButton>
        </div>
        <p className={styles.payFinePrint}>
          This records that you paid them. Let’s Get Quoted does not move money, calculate tax or file anything.
        </p>
      </form>
    </PayModal>
  );
}

/**
 * Anything that needs a reason on the record: undoing a paid status, reopening
 * a closed period, unlocking a paid entry.
 *
 * The reason isn't decoration. Six months later the only thing that explains
 * why a paid week went back to unpaid is the sentence somebody typed here.
 */
export function ReasonDialog({
  title,
  lead,
  disclaimer,
  confirmLabel,
  fields,
  action,
  onDone,
  onClose,
}: {
  title: string;
  lead?: ReactNode;
  disclaimer?: string;
  confirmLabel: string;
  fields: ReactNode;
  action: (prev: PayActionState, formData: FormData) => Promise<PayActionState>;
  onDone: (state: PayActionState) => void;
  onClose: () => void;
}) {
  const [state, formAction] = useFormState(action, IDLE);

  useEffect(() => {
    if (state.ok) onDone(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <PayModal title={title} lead={lead} onClose={onClose} dismissOnBackdrop={false}>
      <form action={formAction} className={styles.payForm}>
        {fields}
        <label className={styles.payField}>
          <span>Reason *</span>
          <textarea name="reason" rows={3} required maxLength={300} placeholder="Paid the wrong week — recorded against Jul 19 by mistake." />
        </label>
        {disclaimer ? <p className={styles.payDisclaimer}>{disclaimer}</p> : null}
        <ActionResult state={state.message ? state : null} />
        <div className={styles.payActions}>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <SaveButton className="btn primary" pendingLabel="Saving…" savedLabel="Done ✓">
            {confirmLabel}
          </SaveButton>
        </div>
      </form>
    </PayModal>
  );
}

export { UNDO_DISCLAIMER };
