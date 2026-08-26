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
  payoutsRestricted,
  synthetic,
  role,
}: {
  accountId: string;
  suspended: boolean;
  quickStopLockedUntil: string | null;
  businessName: string;
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
        <h2 className={styles.panelTitle}>Staff operations hub</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {/* Enforcement & Moderation */}
          {can('account.enforce') ? (
            <div className={styles.actionSection}>
              <h3 className={styles.actionSectionHead}>🛡️ Enforcement & Moderation</h3>

              {/* Suspension */}
              {suspended ? (
                <form action={unsuspendAccountAction.bind(null, accountId)} className={styles.formStack}>
                  <label htmlFor="unsuspend-reason" className={styles.formLabel}>Account is currently suspended (owner blocked from dashboard)</label>
                  <input id="unsuspend-reason" className={styles.input} name="reason" required minLength={4} placeholder="Reason for lifting the suspension" />
                  <button type="submit" className="btn primary">Lift suspension</button>
                </form>
              ) : (
                <form action={suspendAccountAction.bind(null, accountId)} className={styles.formStack}>
                  <label htmlFor="suspend-reason" className={styles.formLabel}>Suspend account (blocks owner from the dashboard)</label>
                  <input id="suspend-reason" className={styles.input} name="reason" required minLength={4} placeholder="Reason for suspension (shown internally)" />
                  <ConfirmSubmit phrase="SUSPEND" label="Suspend account" danger />
                </form>
              )}

              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

              {/* Quick Stop Lock */}
              {quickStopLockedUntil ? (
                <form action={unlockQuickStopAction.bind(null, accountId)} className={styles.formStack}>
                  <label htmlFor="unlock-quick-stop-reason" className={styles.formLabel}>
                    Quick Stop is locked until {new Date(quickStopLockedUntil).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                  </label>
                  <input id="unlock-quick-stop-reason" className={styles.input} name="reason" required minLength={4} placeholder="Reason for clearing the lock" />
                  <button type="submit" className="btn secondary">Clear Quick Stop lock</button>
                </form>
              ) : (
                <form action={lockQuickStopAction.bind(null, accountId)} className={styles.formStack}>
                  <label htmlFor="quick-stop-days" className={styles.formLabel}>Lock Quick Stop (no-show penalty)</label>
                  <div className={styles.searchRow} style={{ margin: 0 }}>
                    <input id="quick-stop-days" className={styles.input} name="days" type="number" min={1} max={365} defaultValue={10} style={{ minWidth: 0, flex: '0 0 90px' }} />
                    <label className={styles.srOnly} htmlFor="quick-stop-reason">Reason</label>
                    <input id="quick-stop-reason" className={styles.input} name="reason" required minLength={4} placeholder="Reason for locking" />
                  </div>
                  <button type="submit" className="btn secondary">Lock Quick Stop</button>
                </form>
              )}
            </div>
          ) : null}

          {/* Payment Rails & Stripe */}
          {can('money.payouts') || can('account.enforce') || can('money.credit') ? (
            <div className={styles.actionSection}>
              <h3 className={styles.actionSectionHead}>💳 Payment Rails & Credit</h3>

              {/* Issue Account Credit */}
              {can('money.credit') ? (
                <form action={issueAccountCreditAction.bind(null, accountId)} className={styles.formStack}>
                  <label htmlFor="credit-amount" className={styles.formLabel}>Issue account credit</label>
                  <div className={styles.searchRow} style={{ margin: 0 }}>
                    <input id="credit-amount" className={styles.input} name="amount" required inputMode="decimal" placeholder="$ amount" style={{ minWidth: 0, flex: '0 0 120px' }} />
                    <label className={styles.srOnly} htmlFor="credit-reason">Reason</label>
                    <input id="credit-reason" className={styles.input} name="reason" required minLength={4} placeholder="Reason (e.g. no-show goodwill)" />
                  </div>
                  <button type="submit" className="btn secondary">Issue credit</button>
                </form>
              ) : null}

              {/* Payout Restriction */}
              {can('money.payouts') ? (
                <>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
                  {payoutsRestricted ? (
                    <form action={unrestrictPayoutsAction.bind(null, accountId)} className={styles.formStack}>
                      <label htmlFor="unrestrict-reason" className={styles.formLabel}>Payouts are restricted for this account.</label>
                      <input id="unrestrict-reason" className={styles.input} name="reason" required minLength={4} placeholder="Reason for lifting restriction" />
                      <button type="submit" className="btn primary">Lift payout restriction</button>
                    </form>
                  ) : (
                    <form action={restrictPayoutsAction.bind(null, accountId)} className={styles.formStack}>
                      <label htmlFor="restrict-payouts-reason" className={styles.formLabel}>Restrict payouts (keeps dashboard access, blocks Connect charges)</label>
                      <input id="restrict-payouts-reason" className={styles.input} name="reason" required minLength={4} placeholder="Reason (shown internally)" />
                      <ConfirmSubmit phrase="RESTRICT" label="Restrict payouts" danger />
                    </form>
                  )}
                </>
              ) : null}

              {/* Reset Verification */}
              {can('account.enforce') ? (
                <>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
                  <form action={resetVerificationAction.bind(null, accountId)} className={styles.formStack}>
                    <label htmlFor="reset-verification-reason" className={styles.formLabel}>Reset payment verification (clears the Stripe Connect link; owner must reconnect)</label>
                    <input id="reset-verification-reason" className={styles.input} name="reason" required minLength={4} placeholder="Reason for resetting verification" />
                    <ConfirmSubmit phrase="RESET" label="Reset verification" />
                  </form>
                </>
              ) : null}
            </div>
          ) : null}

          {/* Access & Sessions */}
          {can('account.support') || can('account.enforce') ? (
            <div className={styles.actionSection}>
              <h3 className={styles.actionSectionHead}>🔑 Access & Sessions</h3>

              {/* Resend Onboarding */}
              {can('account.support') ? (
                <form action={resendOnboardingAction.bind(null, accountId)} className={styles.formStack}>
                  <p className={styles.formLabel}>Resend the onboarding link to the owner&rsquo;s email</p>
                  <button type="submit" className="btn secondary">Resend onboarding</button>
                </form>
              ) : null}

              {/* Force Sign Out */}
              {can('account.enforce') ? (
                <>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
                  <form action={signOutAllSessionsAction.bind(null, accountId)} className={styles.formStack}>
                    <label htmlFor="sign-out-reason" className={styles.formLabel}>Sign out everywhere (blocks new sign-ins for 24h)</label>
                    <input id="sign-out-reason" className={styles.input} name="reason" required minLength={4} placeholder="Reason for forcing sign-out" />
                    <ConfirmSubmit phrase="SIGN OUT" label="Sign out all sessions" />
                  </form>
                </>
              ) : null}

              {/* Impersonation Placeholder */}
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
              <div className={styles.formStack}>
                <p className={styles.formLabel}>Securely view customer experience</p>
                <button type="button" className="btn secondary" disabled title="Not available yet — impersonation hasn't been built.">
                  View as customer (coming soon)
                </button>
              </div>
            </div>
          ) : null}

          {/* Governance & Classification */}
          <div className={styles.actionSection}>
            <h3 className={styles.actionSectionHead}>⚙️ Governance & Classification</h3>

            {can('money.plan') ? (
              <div className={styles.formStack}>
                <p className={styles.formLabel}>Plan changes are read-only in the admin console</p>
                <p className={styles.muted} style={{ margin: 0, fontSize: '0.78rem' }}>
                  The effective plan is controlled by the workspace entitlement and must change through a verified billing lifecycle.
                  Manual paid-plan grants are disabled until an audited operation can update both authorities safely.
                </p>
              </div>
            ) : null}

            {can('account.support') ? (
              <>
                <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
                <form action={setAccountSyntheticAction.bind(null, accountId)} className={styles.formStack}>
                  <input type="hidden" name="synthetic" value={synthetic ? 'false' : 'true'} />
                  <label htmlFor="synthetic-reason" className={styles.formLabel}>{synthetic ? 'Return this account to production reporting' : 'Exclude this synthetic account from production reporting'}</label>
                  <input id="synthetic-reason" className={styles.input} name="reason" required minLength={4} placeholder="Reason for changing reporting classification" />
                  <button type="submit" className="btn secondary">{synthetic ? 'Mark as production' : 'Mark as synthetic'}</button>
                </form>
              </>
            ) : null}
          </div>
        </div>
      </section>

      {/* Danger Zone */}
      {can('account.export') || can('account.delete') ? (
        <section className={`${styles.panel} ${styles.dangerZone}`}>
          <h2 className={styles.panelTitle} style={{ color: '#f87171' }}>⚠️ Danger zone</h2>
          <div className={styles.formStack}>
            {can('account.export') ? (
              <div>
                <p className={styles.formLabel} style={{ marginBottom: '0.4rem' }}>Export account data</p>
                <a href={`/admin/accounts/${accountId}/export`} className="btn secondary">Export account data (JSON)</a>
              </div>
            ) : null}

            {!can('account.delete') ? null : (
              <>
                {can('account.export') ? <div style={{ height: 1, background: 'rgba(248,113,113,0.15)', margin: '0.5rem 0' }} /> : null}
                {confirmingDelete ? (
                  <form action={deleteAccountAction.bind(null, accountId)} className={styles.formStack}>
                    <label htmlFor="delete-confirmation" className={styles.formLabel}>Type the account number to permanently delete <strong>{businessName}</strong> and all its data. This cannot be undone.</label>
                    <input id="delete-confirmation" className={styles.input} name="confirm" placeholder="Account number" autoComplete="off" />
                    <div className={styles.actionRow} style={{ marginTop: '0.3rem' }}>
                      <button type="submit" className="btn danger">Delete permanently</button>
                      <button type="button" className="btn secondary" onClick={() => setConfirmingDelete(false)}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  <div>
                    <p className={styles.formLabel} style={{ marginBottom: '0.4rem' }}>Permanent erasure</p>
                    <button type="button" className="btn danger" onClick={() => setConfirmingDelete(true)}>Delete account…</button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      ) : null}
    </>
  );
}
