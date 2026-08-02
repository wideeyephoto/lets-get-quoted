'use client';

import styles from '../../admin.module.css';
import { adminRefundQuickStopAction, adminResolveQuickStopAction } from './actions';

export default function QuickStopAdminActions({
  requestId,
  canRefund,
  feeLabel,
}: {
  requestId: string;
  canRefund: boolean;
  feeLabel: string;
}) {
  return (
    <section className={styles.panel}>
      <p className={styles.panelTitle}>Governance</p>

      {canRefund ? (
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

      <form action={adminResolveQuickStopAction.bind(null, requestId)} className={styles.formStack}>
        <label>Resolve / adjudicate</label>
        <select className={styles.input} name="outcome" defaultValue="no_show" style={{ minWidth: 0 }}>
          <option value="no_show">No-show (full refund + record)</option>
          <option value="contractor_cancel">Contractor cancel (full refund)</option>
          <option value="completed">Mark completed</option>
          <option value="disputed">Flag as disputed</option>
        </select>
        <input className={styles.input} name="reason" placeholder="Note (internal)" />
        <button type="submit" className="btn primary">Apply resolution</button>
      </form>
    </section>
  );
}
