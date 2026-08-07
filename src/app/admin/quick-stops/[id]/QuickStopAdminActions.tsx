'use client';

import { permissionsFor, type StaffRole } from '@/lib/staff';
import { QUICK_STOP_OUTCOME, allowedQuickStopOutcomes } from '@/lib/quick-stop-outcomes';
import styles from '../../admin.module.css';
import { adminRefundQuickStopAction, adminResolveQuickStopAction } from './actions';

export default function QuickStopAdminActions({
  requestId,
  canRefund,
  feeLabel,
  role,
}: {
  requestId: string;
  /** Whether there is captured money to give back at all. */
  canRefund: boolean;
  feeLabel: string;
  role: StaffRole;
}) {
  // Two different questions that both gate the same form, and they read
  // differently on purpose: "there is nothing to refund" is about this request,
  // "you cannot issue refunds" is about you. Collapsing them into one message
  // would tell a finance user a payment does not exist when it does.
  const granted = permissionsFor(role);
  const mayRefund = granted.includes('money.refund');

  // The resolution dropdown is not one permission. Two of its four outcomes
  // issue a full refund, and no-show also locks the account — so each option is
  // offered only to somebody the server will accept it from. Listing an outcome
  // that throws on submit is how a staff member loses a typed note to a crash.
  // Read from the same map the server action gates on, so the two cannot drift.
  const outcomes = allowedQuickStopOutcomes(granted);

  return (
    <section className={styles.panel}>
      <p className={styles.panelTitle}>Governance</p>

      {!mayRefund ? (
        <p className={styles.muted} style={{ fontSize: '.82rem' }}>
          {/* This used to end "Everything else on this page still works", which
              was false: the resolution dropdown below carried two outcomes that
              refund in full, so the sentence reassured people about a boundary
              the page was not keeping. */}
          Refunds need the finance role, including the two resolutions that refund
          a Quick Stop in full.
        </p>
      ) : canRefund ? (
        <form action={adminRefundQuickStopAction.bind(null, requestId)} className={styles.formStack}>
          <label>Manual refund (blank = full remaining, fee was {feeLabel})</label>
          <div className={styles.searchRow} style={{ margin: 0 }}>
            <input className={styles.input} name="amount" inputMode="decimal" placeholder="$ amount (optional)" style={{ minWidth: 0, flex: '0 0 150px' }} />
            <button type="submit" className="btn secondary">Issue refund</button>
          </div>
        </form>
      ) : (
        <p className={styles.muted} style={{ fontSize: '.82rem' }}>No captured payment to refund.</p>
      )}

      <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1rem 0' }} />

      {outcomes.length === 0 ? (
        <p className={styles.muted} style={{ fontSize: '.82rem' }}>Resolving a Quick Stop is not part of your role.</p>
      ) : (
        <form action={adminResolveQuickStopAction.bind(null, requestId)} className={styles.formStack}>
          <label>Resolve / adjudicate</label>
          <select className={styles.input} name="outcome" defaultValue={outcomes[0]} style={{ minWidth: 0 }}>
            {outcomes.map((key) => <option key={key} value={key}>{QUICK_STOP_OUTCOME[key].label}</option>)}
          </select>
          <input className={styles.input} name="reason" placeholder="Note (internal)" />
          <button type="submit" className="btn primary">Apply resolution</button>
        </form>
      )}
    </section>
  );
}
