'use client';

import { useState } from 'react';
import { permissionsFor, type Permission, type StaffRole } from '@/lib/staff';
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
  setAccountSyntheticAction,
  deleteAccountAction,
} from './actions';

function ConfirmSubmit({ phrase, label, danger = false }: { phrase: string; label: string; danger?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return <button type="button" className={danger ? 'btn danger' : 'btn secondary'} onClick={() => setConfirming(true)}>{label}…</button>;
  }
  return (
    <div className={styles.confirmRow} role="group" aria-label={`Confirm ${label}`}>
      <span>Confirm this action:</span>
      <button type="submit" name="confirm" value={phrase} className={danger ? 'btn danger' : 'btn primary'}>{label}</button>
      <button type="button" className="btn secondary" onClick={() => setConfirming(false)}>Cancel</button>
    </div>
  );
}

export default function AccountActions({
  accountId,
  suspended,
  quickStopLockedUntil,
  businessName,
  plan,
  payoutsRestricted,
  synthetic,
  role,
}: {
  accountId: string;
  suspended: boolean;
  quickStopLockedUntil: string | null;
  businessName: string;
  plan: string;
  payoutsRestricted: boolean;
  synthetic: boolean;
  role: StaffRole;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Hiding a control is an affordance, never the boundary — every one of these
  // actions calls requirePermission on the server, because a server action is a
  // public endpoint and a button that is not rendered is not a check. What this
  // buys is a console that shows you your job instead of a wall of things that
  // will refuse you.
  const granted = permissionsFor(role);
  const can = (permission: Permission) => granted.includes(permission);


  return (
    <>
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Staff actions</h2>

        {can('money.credit') ? (
        <div className={styles.formStack}>
          <form action={issueAccountCreditAction.bind(null, accountId)} className={styles.formStack}>
            <label htmlFor="credit-amount">Issue account credit</label>
            <div className={styles.searchRow} style={{ margin: 0 }}>
              <input id="credit-amount" className={styles.input} name="amount" required inputMode="decimal" placeholder="$ amount" style={{ minWidth: 0, flex: '0 0 120px' }} />
              <label className={styles.srOnly} htmlFor="credit-reason">Reason</label>
              <input id="credit-reason" className={styles.input} name="reason" required minLength={4} placeholder="Reason (e.g. no-show goodwill)" />
            </div>
            <button type="submit" className="btn secondary">Issue credit</button>
          </form>
        </div>
        ) : null}


        {can('account.enforce') ? (quickStopLockedUntil ? (
          <form action={unlockQuickStopAction.bind(null, accountId)} className={styles.formStack}>
            <label htmlFor="unlock-quick-stop-reason">Quick Stop is locked until {new Date(quickStopLockedUntil).toLocaleDateString('en-US', { dateStyle: 'medium' })}</label>
            <input id="unlock-quick-stop-reason" className={styles.input} name="reason" required minLength={4} placeholder="Reason for clearing the lock" />
            <button type="submit" className="btn secondary">Clear Quick Stop lock</button>
          </form>
        ) : (
          <form action={lockQuickStopAction.bind(null, accountId)} className={styles.formStack}>
            <label htmlFor="quick-stop-days">Lock Quick Stop (no-show penalty)</label>
            <div className={styles.searchRow} style={{ margin: 0 }}>
              <input id="quick-stop-days" className={styles.input} name="days" type="number" min={1} max={365} defaultValue={10} style={{ minWidth: 0, flex: '0 0 90px' }} />
              <label className={styles.srOnly} htmlFor="quick-stop-reason">Reason</label>
              <input id="quick-stop-reason" className={styles.input} name="reason" required minLength={4} placeholder="Reason" />
            </div>
            <button type="submit" className="btn secondary">Lock Quick Stop</button>
          </form>
        )) : null}

        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1rem 0' }} />

        {can('account.enforce') ? (suspended ? (
          <form action={unsuspendAccountAction.bind(null, accountId)} className={styles.formStack}>
            <label htmlFor="unsuspend-reason">This account is suspended.</label>
            <input id="unsuspend-reason" className={styles.input} name="reason" required minLength={4} placeholder="Reason for lifting the suspension" />
            <button type="submit" className="btn primary">Lift suspension</button>
          </form>
        ) : (
          <form action={suspendAccountAction.bind(null, accountId)} className={styles.formStack}>
            <label htmlFor="suspend-reason">Suspend account (blocks the owner dashboard)</label>
            <input id="suspend-reason" className={styles.input} name="reason" required minLength={4} placeholder="Reason (shown internally)" />
            <ConfirmSubmit phrase="SUSPEND" label="Suspend account" danger />
          </form>
        )) : null}

        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1rem 0' }} />

        {can('money.plan') ? (
        <form action={changePlanAction.bind(null, accountId)} className={styles.formStack}>
          {/* htmlFor, because a <label> attached to nothing is decoration. It
              read correctly on screen and was inert everywhere else: no
              accessible name on the select, and clicking the word did not focus
              it. */}
          <label htmlFor="account-plan">Plan</label>
          <div className={styles.searchRow} style={{ margin: 0 }}>
            <select id="account-plan" name="plan" defaultValue={plan} className={styles.input} style={{ minWidth: 0, flex: '0 0 160px' }}>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="crew_plus">Crew+</option>
            </select>
            <label className={styles.srOnly} htmlFor="plan-change-reason">Reason</label>
            <input id="plan-change-reason" className={styles.input} name="reason" required minLength={4} placeholder="Reason for plan change" />
            <button type="submit" className="btn secondary">Change plan</button>
          </div>
        </form>
        ) : null}

        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1rem 0' }} />

        {can('account.enforce') ? (
        <form action={resetVerificationAction.bind(null, accountId)} className={styles.formStack}>
          <label htmlFor="reset-verification-reason">Reset payment verification (clears the Stripe Connect link; the owner must reconnect)</label>
          <input id="reset-verification-reason" className={styles.input} name="reason" required minLength={4} placeholder="Reason for resetting verification" />
          <ConfirmSubmit phrase="RESET" label="Reset verification" />
        </form>
        ) : null}

        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1rem 0' }} />

        {can('money.payouts') ? (payoutsRestricted ? (
          <form action={unrestrictPayoutsAction.bind(null, accountId)} className={styles.formStack}>
            <label htmlFor="unrestrict-reason">Payouts are restricted for this account.</label>
            <input id="unrestrict-reason" className={styles.input} name="reason" required minLength={4} placeholder="Reason for lifting the restriction" />
            <button type="submit" className="btn primary">Lift payout restriction</button>
          </form>
        ) : (
          <form action={restrictPayoutsAction.bind(null, accountId)} className={styles.formStack}>
            <label htmlFor="restrict-payouts-reason">Restrict payouts (keeps dashboard access, blocks Connect charges)</label>
            <input id="restrict-payouts-reason" className={styles.input} name="reason" required minLength={4} placeholder="Reason (shown internally)" />
            <ConfirmSubmit phrase="RESTRICT" label="Restrict payouts" danger />
          </form>
        )) : null}

        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1rem 0' }} />

        {can('account.support') ? (
        <form action={resendOnboardingAction.bind(null, accountId)} className={styles.formStack}>
          <p className={styles.formLabel}>Resend the onboarding link to the owner&rsquo;s email</p>
          <button type="submit" className="btn secondary">Resend onboarding</button>
        </form>
        ) : null}

        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1rem 0' }} />

        {can('account.enforce') ? (
        <form action={signOutAllSessionsAction.bind(null, accountId)} className={styles.formStack}>
          <label htmlFor="sign-out-reason">Sign out everywhere (blocks new sign-ins for 24h; does not revoke a still-valid access token already in hand)</label>
          <input id="sign-out-reason" className={styles.input} name="reason" required minLength={4} placeholder="Reason for forcing sign-out" />
          <ConfirmSubmit phrase="SIGN OUT" label="Sign out all sessions" />
        </form>
        ) : null}

        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1rem 0' }} />

        {can('account.support') ? (
          <form action={setAccountSyntheticAction.bind(null, accountId)} className={styles.formStack}>
            <input type="hidden" name="synthetic" value={synthetic ? 'false' : 'true'} />
            <label htmlFor="synthetic-reason">{synthetic ? 'Return this account to production reporting' : 'Exclude this synthetic account from production reporting'}</label>
            <input id="synthetic-reason" className={styles.input} name="reason" required minLength={4} placeholder="Reason for changing its reporting classification" />
            <button type="submit" className="btn secondary">{synthetic ? 'Mark as production' : 'Mark as synthetic'}</button>
          </form>
        ) : null}

        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1rem 0' }} />

        <div className={styles.formStack}>
          <p className={styles.formLabel}>Securely view the customer experience</p>
          <button type="button" className="btn secondary" disabled title="Not available yet — impersonation hasn't been built.">
            View as customer (coming soon)
          </button>
        </div>
      </section>

      {can('account.export') || can('account.delete') ? (
      <section className={`${styles.panel} ${styles.dangerZone}`}>
        <h2 className={styles.panelTitle}>Danger zone</h2>
        {can('account.export') ? (
        <div className={styles.actionRow} style={{ marginTop: 0 }}>
          <a href={`/admin/accounts/${accountId}/export`} className="btn secondary">Export account data (JSON)</a>
        </div>
        ) : null}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1rem 0' }} />
        {!can('account.delete') ? null : confirmingDelete ? (
          <form action={deleteAccountAction.bind(null, accountId)} className={styles.formStack}>
            <label htmlFor="delete-confirmation">Type the account number to permanently delete <strong>{businessName}</strong> and all its data. This cannot be undone.</label>
            <input id="delete-confirmation" className={styles.input} name="confirm" placeholder="Account number" autoComplete="off" />
            <div className={styles.actionRow} style={{ marginTop: 0 }}>
              <button type="submit" className="btn danger">Delete permanently</button>
              <button type="button" className="btn secondary" onClick={() => setConfirmingDelete(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn danger" onClick={() => setConfirmingDelete(true)}>Delete account…</button>
        )}
      </section>
      ) : null}
    </>
  );
}
