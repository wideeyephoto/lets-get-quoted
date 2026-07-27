'use client';

import { useState } from 'react';
import styles from '../leads.module.css';

// "Require a deposit" toggle for the Send-the-quote form. When on, reveals the
// amount ($ or % of the quote) and when it's due. On submit, convertLeadAction
// creates a matching deposit payment request the client can pay right away.
export default function DepositField() {
  const [on, setOn] = useState(false);
  return (
    <div className={styles.depositField}>
      <label className={`sms-consent-check ${styles.depositCheck}`}>
        <input type="checkbox" name="requireDeposit" checked={on} onChange={(event) => setOn(event.target.checked)} />
        <span>
          <strong>Require a deposit</strong>
          <small>Client pays this up front through Stripe before the job proceeds.</small>
        </span>
      </label>
      {on ? (
        <div className={styles.depositRow}>
          <div className={styles.depositAmount}>
            <input name="depositValue" type="number" min="1" step="1" inputMode="decimal" placeholder="25" aria-label="Deposit amount" />
            <select name="depositUnit" aria-label="Deposit unit" defaultValue="percent">
              <option value="percent">% of quote</option>
              <option value="fixed">$ fixed</option>
            </select>
          </div>
          <select name="depositTiming" aria-label="When the deposit is due" defaultValue="before_schedule">
            <option value="before_schedule">Due before scheduling</option>
            <option value="before_work">Due before work starts</option>
          </select>
        </div>
      ) : null}
    </div>
  );
}
