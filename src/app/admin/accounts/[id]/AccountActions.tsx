'use client';

import { useState } from 'react';
import styles from '../../admin.module.css';
import {
  suspendAccountAction,
  unsuspendAccountAction,
  issueAccountCreditAction,
  lockQuickStopAction,
  unlockQuickStopAction,
  resetVerificationAction,
  restrictPayoutsAction,
  unrestrictPayoutsAction,
  changePlanAction,
  resendOnboardingAction,
  signOutAllSessionsAction,
  deleteAccountAction,
} from './actions';

export default function AccountActions({
  accountId,
  suspended,
  quickStopLockedUntil,
  businessName,
  plan,
  payoutsRestricted,
}: {
  accountId: string;
  suspended: boolean;
  quickStopLockedUntil: string | null;
  businessName: string;
  plan: string;
  payoutsRestricted: boolean;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <>
      <section className={styles.panel}>
        <p className={styles.panelTitle}>Staff actions</p>

        <div className={styles.formStack}>
          <form action={issueAccountCreditAction.bind(null, accountId)} className={styles.formStack}>
            <label>Issue account credit</label>
            <div className={styles.searchRow} style={{ margin: 0 }}>
              <input className={styles.input} name="amount" inputMode="decimal" placeholder="$ amount" style={{ minWidth: 0, flex: '0 0 120px' }} />
              <input className={styles.input} name="reason" placeholder="Reason (e.g. no-show goodwill)" />
            </div>
            <button type="submit" className="btn secondary">Issue credit</button>
          </form>
        </div>

        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1rem 0' }} />

        {quickStopLockedUntil ? (
          <form action={unlockQuickStopAction.bind(null, accountId)} className={styles.formStack}>
            <label>Quick Stop is locked until {new Date(quickStopLockedUntil).toLocaleDateString('en-US', { dateStyle: 'medium' })}</label>
            <button type="submit" className="btn secondary">Clear Quick Stop lock</button>
          </form>
        ) : (
          <form action={lockQuickStopAction.bind(null, accountId)} className={styles.formStack}>
            <label>Lock Quick Stop (no-show penalty)</label>
            <div className={styles.searchRow} style={{ margin: 0 }}>
              <input className={styles.input} name="days" type="number" min={1} max={365} defaultValue={10} style={{ minWidth: 0, flex: '0 0 90px' }} />
              <input className={styles.input} name="reason" placeholder="Reason" />
            </div>
            <button type="submit" className="btn secondary">Lock Quick Stop</button>
          </form>
        )}

        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1rem 0' }} />

        {suspended ? (
          <form action={unsuspendAccountAction.bind(null, accountId)} className={styles.formStack}>
            <label>This account is suspended.</label>
            <button type="submit" className="btn primary">Lift suspension</button>
          </form>
        ) : (
          <form action={suspendAccountAction.bind(null, accountId)} className={styles.formStack}>
            <label>Suspend account (blocks the owner dashboard)</label>
            <input className={styles.input} name="reason" placeholder="Reason (shown internally)" />
            <button type="submit" className="btn danger">Suspend account</button>
          </form>
        )}

        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1rem 0' }} />

        <form action={changePlanAction.bind(null, accountId)} className={styles.formStack}>
          <label>Plan</label>
          <div className={styles.searchRow} style={{ margin: 0 }}>
            <select name="plan" defaultValue={plan} className={styles.input} style={{ minWidth: 0, flex: '0 0 160px' }}>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="crew_plus">Crew+</option>
            </select>
            <button type="submit" className="btn secondary">Change plan</button>
          </div>
        </form>

        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1rem 0' }} />

        <form action={resetVerificationAction.bind(null, accountId)} className={styles.formStack}>
          <label>Reset payment verification (clears the Stripe Connect link; the owner must reconnect)</label>
          <button type="submit" className="btn secondary">Reset verification</button>
        </form>

        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1rem 0' }} />

        {payoutsRestricted ? (
          <form action={unrestrictPayoutsAction.bind(null, accountId)} className={styles.formStack}>
            <label>Payouts are restricted for this account.</label>
            <button type="submit" className="btn primary">Lift payout restriction</button>
          </form>
        ) : (
          <form action={restrictPayoutsAction.bind(null, accountId)} className={styles.formStack}>
            <label>Restrict payouts (keeps dashboard access, blocks Connect charges)</label>
            <input className={styles.input} name="reason" placeholder="Reason (shown internally)" />
            <button type="submit" className="btn danger">Restrict payouts</button>
          </form>
        )}

        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1rem 0' }} />

        <form action={resendOnboardingAction.bind(null, accountId)} className={styles.formStack}>
          <label>Resend the onboarding link to the owner&rsquo;s email</label>
          <button type="submit" className="btn secondary">Resend onboarding</button>
        </form>

        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1rem 0' }} />

        <form action={signOutAllSessionsAction.bind(null, accountId)} className={styles.formStack}>
          <label>Sign out everywhere (blocks new sign-ins for 24h; does not revoke a still-valid access token already in hand)</label>
          <button type="submit" className="btn secondary">Sign out all sessions</button>
        </form>

        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1rem 0' }} />

        <div className={styles.formStack}>
          <label>Securely view the customer experience</label>
          <button type="button" className="btn secondary" disabled title="Not available yet — impersonation hasn't been built.">
            View as customer (coming soon)
          </button>
        </div>
      </section>

      <section className={`${styles.panel} ${styles.dangerZone}`}>
        <p className={styles.panelTitle}>Danger zone</p>
        <div className={styles.actionRow} style={{ marginTop: 0 }}>
          <a href={`/admin/accounts/${accountId}/export`} className="btn secondary">Export account data (JSON)</a>
        </div>
        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1rem 0' }} />
        {confirmingDelete ? (
          <form action={deleteAccountAction.bind(null, accountId)} className={styles.formStack}>
            <label>Type the account number to permanently delete <strong>{businessName}</strong> and all its data. This cannot be undone.</label>
            <input className={styles.input} name="confirm" placeholder="Account number" autoComplete="off" />
            <div className={styles.actionRow} style={{ marginTop: 0 }}>
              <button type="submit" className="btn danger">Delete permanently</button>
              <button type="button" className="btn secondary" onClick={() => setConfirmingDelete(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn danger" onClick={() => setConfirmingDelete(true)}>Delete account…</button>
        )}
      </section>
    </>
  );
}
