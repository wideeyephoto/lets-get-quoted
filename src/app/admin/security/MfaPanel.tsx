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

interface WebAuthnMfaClient {
  register: (options: {
    friendlyName?: string;
    webauthn?: { rpId?: string; rpOrigins?: string[]; signal?: AbortSignal };
  }) => Promise<{ data: unknown; error: { message?: string } | null }>;
  authenticate: (options: {
    factorId: string;
    webauthn?: { rpId?: string; rpOrigins?: string[]; signal?: AbortSignal };
  }) => Promise<{ data: unknown; error: { message?: string } | null }>;
}

export default function MfaPanel({ stepUp }: { stepUp: boolean }) {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [level, setLevel] = useState<string>('checking');
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [totpFactorId, setTotpFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [enrollNotice, setEnrollNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [supportsWebAuthn, setSupportsWebAuthn] = useState(true);

  async function refresh() {
    const [{ data: factorsData }, { data: assurance }] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    const all = (factorsData?.all ?? []) as Factor[];
    setFactors(all);
    setLevel(assurance?.currentLevel ?? 'aal1');
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSupportsWebAuthn(Boolean(window.PublicKeyCredential));
    }
    void refresh();
  }, []);

  async function enrollPasskey() {
    setBusy(true);
    setMessage('');
    setEnrollNotice(null);
    try {
      const webauthn = (supabase.auth.mfa as unknown as { webauthn?: WebAuthnMfaClient })?.webauthn;
      if (!webauthn?.register) {
        throw new Error('WebAuthn MFA is not available on this client.');
      }
      const { error } = await webauthn.register({
        friendlyName: 'Passkey',
      });
      if (error) {
        const errMsg = error.message || '';
        if (errMsg.toLowerCase().includes('disabled for webauthn') || errMsg.toLowerCase().includes('mfa enroll is disabled')) {
          setEnrollNotice(
            'WebAuthn MFA enrollment is disabled in your Supabase project settings. In your Supabase Dashboard, navigate to Authentication → Multi-Factor Authentication and enable WebAuthn / Security Keys.'
          );
        } else {
          setMessage(errMsg || 'Passkey setup was cancelled or failed.');
        }
        return;
      }
      setMessage('Passkey registered and verified! High-impact actions are unlocked for this session.');
      setQr(null);
      setSecret(null);
      setTotpFactorId(null);
      await refresh();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Passkey registration error.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyPasskey(factorId?: string) {
    setBusy(true);
    setMessage('');
    setEnrollNotice(null);
    try {
      const targetFactor = factorId
        ? factors.find((f) => f.id === factorId && f.factor_type === 'webauthn')
        : factors.find((f) => f.factor_type === 'webauthn' && f.status === 'verified');

      if (!targetFactor) {
        setMessage('No verified passkey factor found.');
        return;
      }

      const webauthn = (supabase.auth.mfa as unknown as { webauthn?: WebAuthnMfaClient })?.webauthn;
      if (!webauthn?.authenticate) {
        throw new Error('WebAuthn MFA is not available on this client.');
      }

      const { error } = await webauthn.authenticate({
        factorId: targetFactor.id,
      });

      if (error) {
        setMessage(error.message || 'Passkey verification was cancelled or failed.');
        return;
      }

      setMessage('Verified with passkey. High-impact actions are unlocked for this session.');
      await refresh();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Passkey verification failed.');
    } finally {
      setBusy(false);
    }
  }

  async function enrollTotp() {
    setBusy(true);
    setMessage('');
    setEnrollNotice(null);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Authenticator app',
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
      setMessage('Verified with authenticator app. High-impact actions are unlocked for this session.');
      setQr(null);
      setSecret(null);
      setCode('');
      setTotpFactorId(null);
      await refresh();
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
      <h2 className={styles.panelTitle}>Authenticator security</h2>

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
            Scan this QR code with your authenticator app, then enter its six-digit code.
          </p>
          <div className={styles.mfaQrCard}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="Authenticator enrollment QR code" className={styles.mfaQrImg} />
          </div>
          <p className={styles.muted}>
            Manual key: <code>{secret}</code>
          </p>
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
                onClick={() => verifyTotp(totpFactorId ?? unverifiedTotp?.id ?? '')}
              >
                {busy ? 'Verifying…' : 'Verify & activate'}
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => {
                  const idToRemove = totpFactorId ?? unverifiedTotp?.id;
                  if (idToRemove) void removeFactor(idToRemove);
                  else {
                    setQr(null);
                    setSecret(null);
                    setTotpFactorId(null);
                  }
                }}
              >
                Cancel setup
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Incomplete setup cleanup prompt */}
      {unverifiedTotp && !qr ? (
        <div className={styles.mfaWarningCard}>
          <p className={styles.mfaPromptText}>
            You have an incomplete authenticator setup ({unverifiedTotp.friendly_name ?? 'TOTP'} · unverified).
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

      {/* Enrollment error notice (e.g. if WebAuthn MFA is disabled in project settings) */}
      {enrollNotice ? (
        <div className={`${styles.mfaNoticeBox} ${styles.error}`}>
          <div className={styles.mfaNoticeTitle}>⚠️ Action required in Supabase Dashboard</div>
          <p className={styles.mfaNoticeText}>{enrollNotice}</p>
        </div>
      ) : null}

      {/* Enrollment buttons (when no QR code is active) */}
      {!qr ? (
        <div className={styles.mfaStack}>
          <p className={styles.mfaPromptText} style={{ fontWeight: 600 }}>
            {hasVerified ? 'Add another authenticator' : 'Set up two-factor authentication'}
          </p>
          <div className={styles.mfaActionGroup}>
            <button
              type="button"
              className="btn primary"
              disabled={busy || !supportsWebAuthn}
              onClick={enrollPasskey}
            >
              {busy ? 'Opening prompt…' : '🔑 Set up Passkey'}
            </button>
            <button type="button" className="btn secondary" disabled={busy} onClick={enrollTotp}>
              📱 Set up Authenticator App (TOTP)
            </button>
          </div>
          {!supportsWebAuthn ? (
            <p className={styles.muted}>
              Passkeys / WebAuthn are not supported by this browser.
            </p>
          ) : null}
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
            <p className={styles.muted} style={{ marginTop: '0.65rem' }}>
              Verify this session before removing an enrolled authenticator.
            </p>
          ) : null}
        </div>
      ) : null}

      {message ? (
        <p role="status" className={styles.muted} style={{ marginTop: '1rem' }}>
          {message}
        </p>
      ) : null}
    </section>
  );
}

