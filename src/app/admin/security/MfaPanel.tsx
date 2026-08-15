'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import styles from '../admin.module.css';

type Factor = { id: string; status: string; friendly_name?: string };

export default function MfaPanel({ stepUp }: { stepUp: boolean }) {
  const [factor, setFactor] = useState<Factor | null>(null);
  const [level, setLevel] = useState<string>('checking');
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [{ data: factors }, { data: assurance }] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    const totp = (factors?.totp ?? []) as Factor[];
    setFactor(totp.find((item) => item.status === 'verified') ?? totp[0] ?? null);
    setLevel(assurance?.currentLevel ?? 'aal1');
  }

  useEffect(() => { void refresh(); }, []);

  async function enroll() {
    setBusy(true); setMessage('');
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'LGQ staff console' });
    setBusy(false);
    if (error || !data) return setMessage(error?.message ?? 'Could not start enrollment.');
    setFactor({ id: data.id, status: 'unverified', friendly_name: 'LGQ staff console' });
    setQr(data.totp.qr_code); setSecret(data.totp.secret);
  }

  async function verify() {
    if (!factor || code.length !== 6) return;
    setBusy(true); setMessage('');
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (challengeError || !challenge) { setBusy(false); return setMessage(challengeError?.message ?? 'Could not start verification.'); }
    const { error } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.id, code });
    setBusy(false);
    if (error) return setMessage(error.message);
    setMessage('Verified. High-impact actions are unlocked for this session.');
    setQr(null); setSecret(null); setCode(''); await refresh();
  }

  async function resetEnrollment() {
    if (!factor) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    setBusy(false);
    if (error) return setMessage(error.message);
    setFactor(null); setQr(null); setSecret(null); setMessage('Authenticator removed.');
  }

  return <section className={styles.panel}>
    <h2 className={styles.panelTitle}>Authenticator security</h2>
    {stepUp && level !== 'aal2' ? <div className={`${styles.banner} ${styles.err}`}>This action needs an authenticator check before it can continue.</div> : null}
    <dl className={styles.kv}><dt>Current session</dt><dd><span className={`${styles.pill} ${level === 'aal2' ? styles.good : styles.warn}`}>{level === 'aal2' ? 'MFA verified' : level === 'checking' ? 'Checking…' : 'Password / link only'}</span></dd><dt>Authenticator</dt><dd>{factor ? `${factor.friendly_name ?? 'TOTP'} · ${factor.status}` : 'Not enrolled'}</dd></dl>
    {!factor ? <button type="button" className="btn primary" disabled={busy} onClick={enroll}>Set up authenticator</button> : null}
    {qr ? <div className={styles.mfaSetup}><p>Scan this QR code with your authenticator app, then enter its six-digit code.</p><Image src={qr} alt="Authenticator enrollment QR code" width={220} height={220} unoptimized /><p className={styles.muted}>Manual key: <code>{secret}</code></p></div> : null}
    {factor && level !== 'aal2' ? <div className={styles.formStack}><label htmlFor="mfa-code">Six-digit authenticator code</label><input id="mfa-code" className={styles.input} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" /><button type="button" className="btn primary" disabled={busy || code.length !== 6} onClick={verify}>Verify this session</button></div> : null}
    {factor && (factor.status !== 'verified' || level === 'aal2') ? <button type="button" className="btn secondary" disabled={busy} onClick={resetEnrollment}>Remove authenticator</button> : null}
    {factor?.status === 'verified' && level !== 'aal2' ? <p className={styles.muted}>Verify this session before removing the enrolled authenticator.</p> : null}
    {message ? <p role="status" className={styles.muted}>{message}</p> : null}
  </section>;
}
