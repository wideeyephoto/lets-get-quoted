'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import styles from '../admin.module.css';

type Factor = {
  id: string;
  status: 'verified' | 'unverified' | string;
  friendly_name?: string;
  factor_type: 'totp' | 'webauthn' | 'phone' | string;
  created_at?: string;
  updated_at?: string;
};

// Use the website domain instead of Supabase's project hostname in the otpauth
// issuer so password managers can associate codes with the saved website login.
const TOTP_ISSUER = 'app.letsgetquoted.com';

export default function MfaPanel({ stepUp, accountEmail }: { stepUp: boolean; accountEmail: string }) {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [level, setLevel] = useState<string>('checking');
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [totpFactorId, setTotpFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [copiedSetupKey, setCopiedSetupKey] = useState(false);
  const [busy, setBusy] = useState(true);

  async function refresh() {
    const [{ data: factorsData, error: factorsError }, { data: assurance, error: assuranceError }] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (factorsError) throw factorsError;
    if (assuranceError) throw assuranceError;
    const all = (factorsData?.all ?? []) as Factor[];
    setFactors(all);
    setLevel(assurance?.currentLevel ?? 'aal1');
    return assurance?.currentLevel ?? 'aal1';
  }

  useEffect(() => {
    void refresh()
      .catch(() => setMessage('Could not load your authenticators. Refresh this page to try again.'))
      .finally(() => setBusy(false));
  }, []);

  async function copySetupKey() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopiedSetupKey(true);
    } catch {
      setCopiedSetupKey(false);
      setMessage('Could not copy automatically. Select and copy the setup key shown below the QR code.');
    }
  }

  async function verifyPasskey(factorId?: string) {
    setBusy(true);
    setMessage('');
    try {
      const targetFactor = factorId
        ? factors.find((f) => f.id === factorId && f.factor_type === 'webauthn')
        : factors.find((f) => f.factor_type === 'webauthn' && f.status === 'verified');

      if (!targetFactor) {
        setMessage('No verified passkey factor found.');
        return;
      }

      // Keep verification available for previously enrolled WebAuthn factors.
      // New enrollment is not offered: passkey sign-in and WebAuthn MFA are
      // separate provider features, and this project only enables the former.
      const { error } = await supabase.auth.mfa.webauthn.authenticate({
        factorId: targetFactor.id,
      });

      if (error) {
        setMessage(error.message || 'Passkey verification was cancelled or failed.');
        return;
      }

      const currentLevel = await refresh();
      setMessage(currentLevel === 'aal2'
        ? 'Verified with passkey. High-impact actions are unlocked for this session.'
        : 'Your session still needs two-factor verification. Try your authenticator app.');
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Passkey verification failed.');
    } finally {
      setBusy(false);
    }
  }

  async function enrollTotp() {
    setBusy(true);
    setMessage('');
    setCopiedSetupKey(false);
    setCode('');
    try {
      let friendlyName = 'Authenticator app';
      for (let suffix = 2; factors.some((factor) => factor.friendly_name === friendlyName); suffix += 1) {
        friendlyName = `Authenticator app ${suffix}`;
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName,
        issuer: TOTP_ISSUER,
      });
      if (error || !data) {
        setMessage(error?.message ?? 'Could not start TOTP enrollment.');
        return;
      }
      setTotpFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
      await refresh();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'TOTP enrollment error.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyTotp(factorId: string) {
    if (code.length !== 6) return;
    setBusy(true);
    setMessage('');
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError || !challenge) {
        setMessage(challengeError?.message ?? 'Could not start verification challenge.');
        return;
      }
      const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
      if (error) {
        setMessage(error.message);
        return;
      }
      setQr(null);
      setSecret(null);
      setCode('');
      setTotpFactorId(null);
      setCopiedSetupKey(false);
      const currentLevel = await refresh();
      setMessage(currentLevel === 'aal2'
        ? 'Verified with authenticator app. High-impact actions are unlocked for this session.'
        : 'Your session still needs two-factor verification. Enter a new code to try again.');
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'TOTP verification failed.');
    } finally {
      setBusy(false);
    }
  }

  async function removeFactor(factorId: string) {
    setBusy(true);
    setMessage('');
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) {
        setMessage(error.message);
        return;
      }
      if (totpFactorId === factorId) {
        setTotpFactorId(null);
        setQr(null);
        setSecret(null);
        setCode('');
        setCopiedSetupKey(false);
      }
      setMessage('Authenticator removed.');
      await refresh();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Could not remove authenticator.');
    } finally {
      setBusy(false);
    }
  }

  const verifiedFactors = factors.filter((f) => f.status === 'verified');
  const verifiedTotp = factors.find((f) => f.factor_type === 'totp' && f.status === 'verified');
  const verifiedWebAuthn = factors.find((f) => f.factor_type === 'webauthn' && f.status === 'verified');
  const unverifiedTotp = factors.find((f) => f.factor_type === 'totp' && f.status === 'unverified');
  const hasVerified = verifiedFactors.length > 0;

  const enrolledLabels = factors.map(
    (f) => `${f.friendly_name || (f.factor_type === 'webauthn' ? 'Passkey' : 'TOTP')} (${f.status})`
  );

  return (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>Two-factor authentication</h2>
      <p className={styles.muted}>
        Use six-digit verification codes from Google Authenticator, Apple Passwords, or another authenticator app.
      </p>

      {stepUp && level !== 'aal2' ? (
        <div className={`${styles.banner} ${styles.err}`}>
          This action needs an authenticator check before it can continue.
        </div>
      ) : null}

      <dl className={styles.kv}>
        <dt>Current session</dt>
        <dd>
          <span className={`${styles.pill} ${level === 'aal2' ? styles.good : styles.warn}`}>
            {level === 'aal2' ? 'MFA verified' : level === 'checking' ? 'Checking…' : 'Password / link only'}
          </span>
        </dd>
        <dt>Authenticators</dt>
        <dd>
          {enrolledLabels.length === 0 ? 'Not enrolled' : enrolledLabels.join(', ')}
        </dd>
      </dl>

      {/* Step-up verification for verified factors when session is AAL1 */}
      {hasVerified && level !== 'aal2' ? (
        <div className={styles.mfaStepUpPrompt}>
          {verifiedWebAuthn ? (
            <div className={styles.mfaActionGroup}>
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={() => verifyPasskey(verifiedWebAuthn.id)}
              >
                {busy ? 'Verifying…' : '🔑 Verify with Passkey'}
              </button>
            </div>
          ) : null}

          {verifiedTotp ? (
            <div className={styles.formStack}>
              {verifiedWebAuthn ? (
                <p className={styles.muted}>
                  — or enter a six-digit code from your authenticator app —
                </p>
              ) : (
                <p className={styles.mfaPromptText}>
                  Enter a six-digit code from your authenticator app:
                </p>
              )}
              <label htmlFor="mfa-code">Six-digit authenticator code</label>
              <input
                id="mfa-code"
                className={styles.input}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
              />
              <button
                type="button"
                className="btn primary"
                disabled={busy || code.length !== 6}
                onClick={() => verifyTotp(verifiedTotp.id)}
              >
                {busy ? 'Verifying…' : 'Verify this session'}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Active TOTP QR enrollment */}
      {qr ? (
        <div className={styles.mfaSetup}>
          <p className={styles.mfaPromptText}>
            Scan this QR code, then enter a six-digit code below to finish activating two-factor authentication.
          </p>
          <div className={styles.mfaQrCard}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="Authenticator enrollment QR code" className={styles.mfaQrImg} />
          </div>
          <dl className={`${styles.kv} ${styles.mfaSetupDetails}`}>
            <dt>Website</dt><dd>{TOTP_ISSUER}</dd>
            <dt>Account</dt><dd>{accountEmail}</dd>
            <dt>Setup key</dt><dd><code className={styles.mfaSetupKey}>{secret}</code></dd>
          </dl>
          <div className={styles.mfaActionGroup}>
            <button type="button" className="btn secondary" onClick={copySetupKey}>
              {copiedSetupKey ? 'Setup key copied' : 'Copy setup key'}
            </button>
            <span role="status" className={styles.muted}>{copiedSetupKey ? 'Ready to paste into your authenticator.' : ''}</span>
          </div>
          <details className={styles.mfaInstructions}>
            <summary>Using Apple Passwords?</summary>
            <p>
              Apple Passwords attaches verification codes to a saved login. After scanning, select your
              {' '}<strong>{TOTP_ISSUER}</strong> account; it may ask you to choose it instead of filling it automatically.
            </p>
            <ol>
              <li>In Passwords, open All and find your saved login for {TOTP_ISSUER} using {accountEmail}. Add the website login first if it is missing.</li>
              <li>Open that login, tap Edit, then Set Up Code. Paste the setup key above and choose Use Setup Key.</li>
              <li>Return here and enter the six-digit verification code from Passwords to activate 2FA.</li>
            </ol>
            <p>
              On the same iPhone, you can also touch and hold the QR code and choose Add Verification in Passwords.
            </p>
          </details>
          <div className={styles.formStack}>
            <label htmlFor="mfa-code-enroll">Six-digit authenticator code</label>
            <input
              id="mfa-code-enroll"
              className={styles.input}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
            />
            <div className={styles.mfaCancelRow}>
              <button
                type="button"
                className="btn primary"
                disabled={busy || code.length !== 6}
                onClick={() => { if (totpFactorId) void verifyTotp(totpFactorId); }}
              >
                {busy ? 'Verifying…' : 'Verify & activate'}
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => {
                  const idToRemove = totpFactorId;
                  if (idToRemove) void removeFactor(idToRemove);
                  else {
                    setQr(null);
                    setSecret(null);
                    setTotpFactorId(null);
                    setCode('');
                    setCopiedSetupKey(false);
                  }
                }}
              >
                Cancel setup
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* A saved factor can be verified after navigation without its original QR. */}
      {unverifiedTotp && !qr ? (
        <div className={styles.mfaWarningCard}>
          <p className={styles.mfaPromptText}>
            You have an incomplete authenticator setup ({unverifiedTotp.friendly_name ?? 'TOTP'} · unverified).
          </p>
          <p id="mfa-resume-help" className={styles.mfaPromptText}>
            Already added it to your authenticator? Enter its current six-digit code to finish setup.
            You do not need to scan the QR code again.
          </p>
          <form
            aria-label="Complete authenticator setup"
            className={styles.formStack}
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy) void verifyTotp(unverifiedTotp.id);
            }}
          >
            <label htmlFor="mfa-code-resume">Six-digit authenticator code</label>
            <input
              id="mfa-code-resume"
              className={styles.input}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-describedby="mfa-resume-help"
              placeholder="000000"
            />
            <button type="submit" className="btn primary" disabled={busy || code.length !== 6}>
              {busy ? 'Verifying…' : 'Verify & activate'}
            </button>
          </form>
          <p className={styles.muted}>
            If you never saved it or no longer have its codes, discard this setup and start again.
          </p>
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={() => removeFactor(unverifiedTotp.id)}
          >
            Discard unverified setup
          </button>
        </div>
      ) : null}

      {/* Enrollment buttons (when no QR code is active) */}
      {!qr && !unverifiedTotp ? (
        <div className={styles.mfaStack}>
          <p className={styles.mfaPromptHeading}>
            {hasVerified ? 'Add another authenticator' : 'Set up two-factor authentication'}
          </p>
          <div className={styles.mfaActionGroup}>
            <button type="button" className="btn primary" disabled={busy || level === 'checking'} onClick={enrollTotp}>
              {busy ? 'Please wait…' : '📱 Set up Authenticator App (TOTP)'}
            </button>
          </div>
        </div>
      ) : null}

      {/* Configured Authenticators List & Management */}
      {factors.length > 0 ? (
        <div className={styles.mfaSection}>
          <h3 className={styles.mfaSectionTitle}>
            Enrolled Authenticators
          </h3>
          <div className={styles.mfaList}>
            {factors.map((f) => {
              const isWebAuthn = f.factor_type === 'webauthn';
              const isVerified = f.status === 'verified';
              const canRemove = !isVerified || level === 'aal2';

              return (
                <div key={f.id} className={styles.mfaItem}>
                  <div className={styles.mfaItemLead}>
                    <span className={styles.mfaItemIcon}>{isWebAuthn ? '🔑' : '📱'}</span>
                    <div>
                      <div className={styles.mfaItemName}>
                        {f.friendly_name || (isWebAuthn ? 'Passkey' : 'Authenticator app')}
                      </div>
                      <div className={styles.mfaItemMeta}>
                        {isWebAuthn ? 'FIDO2 / WebAuthn' : 'TOTP 6-digit code'} ·{' '}
                        <span className={isVerified ? styles.mfaBadgeVerified : styles.mfaBadgeUnverified}>
                          {isVerified ? 'verified' : 'unverified'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {canRemove ? (
                    <button
                      type="button"
                      className={`btn secondary ${styles.mfaBtnSmall}`}
                      disabled={busy}
                      onClick={() => removeFactor(f.id)}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>

          {verifiedFactors.length > 0 && level !== 'aal2' ? (
            <p className={styles.mfaMutedNote}>
              Verify this session before removing an enrolled authenticator.
            </p>
          ) : null}
        </div>
      ) : null}

      {message ? (
        <p role="status" className={styles.mfaStatusMessage}>
          {message}
        </p>
      ) : null}
    </section>
  );
}

