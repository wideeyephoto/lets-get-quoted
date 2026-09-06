'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import styles from '../admin.module.css';

type Factor = {
  id: string;
  status: 'verified' | 'unverified' | string;
  friendly_name?: string;
  factor_type?: 'totp' | 'phone' | 'webauthn' | string;
};

type PasskeyItem = {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
};

export default function MfaPanel({ stepUp }: { stepUp: boolean }) {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([]);
  const [level, setLevel] = useState<string>('checking');
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [totpFactorId, setTotpFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [supportsWebAuthn, setSupportsWebAuthn] = useState(true);

  async function refresh() {
    const [{ data: factorsData }, { data: assurance }, passkeysResult] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.passkey.list().catch(() => ({ data: null })),
    ]);
    const all = (factorsData?.all ?? []) as Factor[];
    setFactors(all);
    setPasskeys(((passkeysResult?.data as PasskeyItem[]) ?? []));
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
    try {
      const { error } = await supabase.auth.registerPasskey();
      if (error) {
        setMessage(error.message || 'Passkey setup was cancelled or failed.');
        return;
      }
      setMessage('Passkey registered and saved to your device / password manager!');
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

  async function verifyPasskey() {
    setBusy(true);
    setMessage('');
    try {
      const { error } = await supabase.auth.signInWithPasskey();
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

  async function removePasskey(passkeyId: string) {
    setBusy(true);
    setMessage('');
    try {
      const { error } = await supabase.auth.passkey.delete({ passkeyId });
      setBusy(false);
      if (error) return setMessage(error.message);
      setMessage('Passkey removed.');
      await refresh();
    } catch (err: unknown) {
      setBusy(false);
      setMessage(err instanceof Error ? err.message : 'Could not remove passkey.');
    }
  }

  async function enrollTotp() {
    setBusy(true);
    setMessage('');
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'LGQ staff console',
    });
    setBusy(false);
    if (error || !data) {
      return setMessage(error?.message ?? 'Could not start TOTP enrollment.');
    }
    setTotpFactorId(data.id);
    setQr(data.totp.qr_code);
    setSecret(data.totp.secret);
    await refresh();
  }

  async function verifyTotp(factorId: string) {
    if (code.length !== 6) return;
    setBusy(true);
    setMessage('');
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError || !challenge) {
      setBusy(false);
      return setMessage(challengeError?.message ?? 'Could not start verification.');
    }
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
    setBusy(false);
    if (error) return setMessage(error.message);
    setMessage('Verified. High-impact actions are unlocked for this session.');
    setQr(null);
    setSecret(null);
    setCode('');
    setTotpFactorId(null);
    await refresh();
  }

  async function removeFactor(factorId: string) {
    setBusy(true);
    setMessage('');
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setBusy(false);
    if (error) return setMessage(error.message);
    if (totpFactorId === factorId) {
      setTotpFactorId(null);
      setQr(null);
      setSecret(null);
    }
    setMessage('Authenticator removed.');
    await refresh();
  }

  const verifiedTotp = factors.find((f) => f.factor_type === 'totp' && f.status === 'verified');
  const unverifiedTotp = factors.find((f) => f.factor_type === 'totp' && f.status === 'unverified');
  const hasPasskeys = passkeys.length > 0;
  const hasVerified = Boolean(hasPasskeys || verifiedTotp);

  const enrolledLabels = [
    ...passkeys.map((p) => p.friendly_name || 'Passkey (active)'),
    ...factors.map((f) => `${f.friendly_name || 'TOTP'} (${f.status})`),
  ];

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
        <div style={{ marginTop: '1.2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {hasPasskeys ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-start' }}>
              <p style={{ margin: 0, fontSize: '0.88rem' }}>
                Verify with your passkey, biometrics, or security key:
              </p>
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={verifyPasskey}
              >
                {busy ? 'Verifying…' : '🔑 Verify with Passkey'}
              </button>
            </div>
          ) : null}

          {verifiedTotp ? (
            <div className={styles.formStack}>
              {hasPasskeys ? (
                <p className={styles.muted} style={{ margin: '0.2rem 0' }}>
                  — or enter a six-digit code from your authenticator app —
                </p>
              ) : null}
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
        <div className={styles.mfaSetup} style={{ marginTop: '1.2rem' }}>
          <p>Scan this QR code with your authenticator app, then enter its six-digit code.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Authenticator enrollment QR code" width={220} height={220} />
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
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.4rem' }}>
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

      {/* Unverified factor cleanup prompt (e.g. if page reloaded during enrollment) */}
      {unverifiedTotp && !qr ? (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.8rem 1rem',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '0.6rem',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem' }}>
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

      {/* Enrollment buttons (when no QR code is active) */}
      {!qr ? (
        <div style={{ marginTop: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600 }}>
            {hasVerified ? 'Add another authenticator' : 'Set up two-factor authentication'}
          </p>
          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
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
            <p className={styles.muted} style={{ fontSize: '0.78rem' }}>
              Passkeys / WebAuthn are not supported by this browser.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Configured Authenticators List & Management */}
      {factors.length > 0 || passkeys.length > 0 ? (
        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <h3
            style={{
              fontSize: '0.72rem',
              fontWeight: 800,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(247, 245, 239, 0.65)',
              margin: '0 0 0.75rem',
            }}
          >
            Enrolled Authenticators
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {passkeys.map((pk) => (
              <div
                key={pk.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.6rem 0.85rem',
                  background: 'rgba(255, 255, 255, 0.025)',
                  borderRadius: '0.55rem',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <span style={{ fontSize: '1.15rem' }}>🔑</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                      {pk.friendly_name || 'Passkey'}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'rgba(247, 245, 239, 0.5)' }}>
                      FIDO2 / WebAuthn · <span style={{ color: '#34d399' }}>active</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn secondary"
                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem' }}
                  disabled={busy}
                  onClick={() => removePasskey(pk.id)}
                >
                  Remove
                </button>
              </div>
            ))}

            {factors.map((f) => {
              const isWebAuthn = f.factor_type === 'webauthn';
              const isVerified = f.status === 'verified';
              const canRemove = !isVerified || level === 'aal2';

              return (
                <div
                  key={f.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.6rem 0.85rem',
                    background: 'rgba(255, 255, 255, 0.025)',
                    borderRadius: '0.55rem',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <span style={{ fontSize: '1.15rem' }}>{isWebAuthn ? '🔑' : '📱'}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        {f.friendly_name || (isWebAuthn ? 'Passkey' : 'Authenticator app')}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'rgba(247, 245, 239, 0.5)' }}>
                        {isWebAuthn ? 'WebAuthn / Passkey' : 'TOTP 6-digit code'} ·{' '}
                        <span style={{ color: isVerified ? '#34d399' : '#fbbf24' }}>
                          {isVerified ? 'verified' : 'unverified'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {canRemove ? (
                    <button
                      type="button"
                      className="btn secondary"
                      style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem' }}
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

          {factors.some((f) => f.status === 'verified') && level !== 'aal2' ? (
            <p className={styles.muted} style={{ marginTop: '0.65rem', fontSize: '0.75rem' }}>
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
