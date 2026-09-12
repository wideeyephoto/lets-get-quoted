'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { browserSupportsWebAuthn, startAuthentication, startRegistration, WebAuthnAbortService } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { supabase } from '@/lib/supabase';
import styles from '../admin.module.css';

type Factor = { id: string; status: string; friendly_name?: string; factor_type: string };
type Passkey = { id: string; label: string; createdAt: string; lastUsedAt: string | null };
type SecurityState = { userId: string; providerLevel: string | null; passkeys: Passkey[]; verified: boolean; verifiedUntil: string | null; passkeysUnavailable?: boolean };
const TOTP_ISSUER = 'app.letsgetquoted.com';
const endpoint = '/api/admin/security/passkeys';
async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Could not check your security session.');
  return body as T;
}
function messageFor(error: unknown) {
  if (error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'AbortError' || /ceremony.*cancel|timed out|cancelled/i.test(error.message))) return 'Passkey prompt closed. Try again or use an authenticator code.';
  return error instanceof Error ? error.message : 'Verification failed. Please try again.';
}

export default function MfaPanel({ stepUp, accountEmail, accountId }: { stepUp: boolean; accountEmail: string; accountId: string }) {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [security, setSecurity] = useState<SecurityState | null>(null);
  const [busy, setBusy] = useState(true);
  const [locked, setLocked] = useState(false);
  const [supported, setSupported] = useState(false);
  const [message, setMessage] = useState('');
  const [waitingForPasskey, setWaitingForPasskey] = useState(false);
  const [label, setLabel] = useState('My passkey');
  const [selectedTotp, setSelectedTotp] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const generation = useRef(0);
  const running = useRef(false);
  const identityLocked = useRef(false);
  const cancelPasskey = useRef<(() => void) | null>(null);
  const clearSetup = useCallback(() => { setSetup(null); setCode(''); setCopied(false); }, []);
  const invalidateIdentity = useCallback(() => {
    generation.current += 1; identityLocked.current = true;
    cancelPasskey.current?.();
    WebAuthnAbortService.cancelCeremony();
    clearSetup(); setFactors([]); setSecurity(null); setSelectedTotp(''); setLocked(true); setBusy(false);
    setMessage('Your signed-in account changed. Reload Security before continuing.');
  }, [clearSetup]);
  const assertAccount = useCallback(async (version: number) => {
    const { data, error } = await supabase.auth.getUser();
    if (generation.current !== version || identityLocked.current) throw new Error('Reload Security before continuing.');
    if (error || data.user?.id !== accountId) {
      invalidateIdentity(); throw new Error('Your signed-in account changed. Reload Security before continuing.');
    }
  }, [accountId, invalidateIdentity]);
  const refresh = useCallback(async (version: number) => {
    await assertAccount(version);
    const [{ data, error }, state] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      fetch(endpoint, { cache: 'no-store', credentials: 'same-origin' }).then(readJson<SecurityState>),
    ]);
    if (error) throw error;
    if (state.userId !== accountId) { invalidateIdentity(); throw new Error('Your signed-in account changed. Reload Security.'); }
    if (generation.current !== version || identityLocked.current) throw new Error('Reload Security before continuing.');
    const all = (data?.all ?? []) as Factor[];
    setFactors(all); setSecurity(state);
    setSelectedTotp(current => all.some(f => f.id === current && f.factor_type === 'totp') ? current : all.find(f => f.factor_type === 'totp')?.id ?? '');
    return state;
  }, [accountId, assertAccount, invalidateIdentity]);
  useEffect(() => {
    identityLocked.current = false;
    const version = ++generation.current;
    clearSetup(); setFactors([]); setSecurity(null); setSelectedTotp(''); setLocked(false); setBusy(true); setMessage('');
    setSupported(window.isSecureContext && browserSupportsWebAuthn());
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (session && session.user.id !== accountId)) invalidateIdentity();
      else if (event === 'TOKEN_REFRESHED' || event === 'MFA_CHALLENGE_VERIFIED') {
        // Supabase holds an auth lock inside this callback; defer async reads.
        setTimeout(() => {
          if (!running.current && !identityLocked.current && generation.current === version) void refresh(version).catch(() => { setSecurity(null); setMessage('Could not check your security session. Reload to try again.'); });
        }, 0);
      }
    });
    void refresh(version).catch(error => {
      if (generation.current === version) { setSecurity(null); setMessage(messageFor(error)); }
    }).finally(() => { if (generation.current === version) setBusy(false); });
    return () => { generation.current += 1; subscription.subscription.unsubscribe(); cancelPasskey.current?.(); WebAuthnAbortService.cancelCeremony(); };
  }, [accountId, clearSetup, invalidateIdentity, refresh]);
  useEffect(() => {
    if (!security?.verifiedUntil) return;
    const delay = Math.max(0, new Date(security.verifiedUntil).getTime() - Date.now());
    const timer = setTimeout(() => setSecurity(current => current ? { ...current, verified: false, verifiedUntil: null } : current), delay);
    return () => clearTimeout(timer);
  }, [security?.verifiedUntil]);
  async function run(action: (version: number) => Promise<void>) {
    if (running.current || identityLocked.current) return;
    running.current = true; setBusy(true); setMessage('');
    const version = generation.current;
    try { await assertAccount(version); await action(version); }
    catch (error) { if (generation.current === version) setMessage(messageFor(error)); }
    finally { running.current = false; if (generation.current === version) setBusy(false); }
  }
  function post<T>(action: string, data: Record<string, unknown> = {}) {
    return fetch(endpoint, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, action, expectedUserId: accountId }) }).then(readJson<T>);
  }
  function unlocked(state: SecurityState) { return state.providerLevel === 'aal2' || state.verified; }
  async function nativePrompt<T>(start: () => Promise<T>) {
    setWaitingForPasskey(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancelled = new Promise<never>((_, reject) => {
      cancelPasskey.current = () => {
        reject(new DOMException('Passkey prompt cancelled.', 'AbortError'));
        WebAuthnAbortService.cancelCeremony();
      };
      // Password-manager extensions can ignore WebAuthn's requested timeout.
      // Race the native call so a late result can never reach verification.
      timer = setTimeout(() => cancelPasskey.current?.(), 60_000);
    });
    try { return await Promise.race([start(), cancelled]); }
    finally { clearTimeout(timer); cancelPasskey.current = null; setWaitingForPasskey(false); }
  }
  async function passkey(register: boolean) {
    await run(async version => {
      if (!supported) throw new Error('This browser cannot use passkeys here. Use an authenticator code or a supported browser.');
      if (register) {
        const start = await post<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }>('register-options', { label });
        await assertAccount(version);
        const response = await nativePrompt(() => startRegistration({ optionsJSON: start.options }));
        await assertAccount(version);
        await post('register-verify', { challengeId: start.challengeId, response });
      } else {
        const start = await post<{ challengeId: string; options: PublicKeyCredentialRequestOptionsJSON }>('authenticate-options');
        await assertAccount(version);
        const response = await nativePrompt(() => startAuthentication({ optionsJSON: start.options }));
        await assertAccount(version);
        await post('authenticate-verify', { challengeId: start.challengeId, response });
      }
      const state = await refresh(version);
      setMessage(register ? 'Passkey added. Keep your authenticator codes available as backup.' : unlocked(state) ? 'Passkey verified. High-impact actions are unlocked for 15 minutes.' : 'Your session still needs verification. Try an authenticator code.');
    });
  }
  async function enrollTotp() {
    await run(async version => {
      let friendlyName = 'Authenticator app';
      for (let suffix = 2; factors.some(f => f.friendly_name === friendlyName); suffix += 1) friendlyName = `Authenticator app ${suffix}`;
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName, issuer: TOTP_ISSUER });
      if (error || !data) throw error || new Error('Could not start authenticator setup.');
      await assertAccount(version);
      setSetup({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setSelectedTotp(data.id); setCode(''); setCopied(false);
      await refresh(version);
    });
  }
  async function verifyTotp(factorId: string) {
    if (code.length !== 6) return;
    await run(async version => {
      if (!factors.some(f => f.id === factorId && f.factor_type === 'totp')) throw new Error('Choose an authenticator for this account.');
      const { data, error } = await supabase.auth.mfa.challenge({ factorId });
      if (error || !data) throw error || new Error('Could not start verification.');
      await assertAccount(version);
      const result = await supabase.auth.mfa.verify({ factorId, challengeId: data.id, code });
      if (result.error) throw result.error;
      await assertAccount(version); clearSetup();
      const state = await refresh(version);
      setMessage(state.providerLevel === 'aal2' ? 'Authenticator verified. High-impact actions are unlocked for this session.' : 'Your session still needs verification. Enter a new code to try again.');
    });
  }
  async function removeFactor(factorId: string) {
    await run(async version => {
      const factor = factors.find(f => f.id === factorId);
      if (!factor || (factor.status === 'verified' && security?.providerLevel !== 'aal2')) throw new Error('Verify an authenticator code before removing this authenticator.');
      if (factor.status === 'verified' && factors.filter(f => f.factor_type === 'totp' && f.status === 'verified').length <= 1 && (security?.passkeys.length || security?.passkeysUnavailable)) throw new Error('Add and verify a replacement authenticator before removing your last backup.');
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      await assertAccount(version);
      if (setup?.id === factorId) clearSetup();
      // Unenrollment does not refresh the provider JWT's assurance.
      setSecurity(null);
      const result = await supabase.auth.refreshSession();
      if (result.error || !result.data.session) throw new Error('Authenticator removed, but your session could not refresh. Sign in again before continuing.');
      await refresh(version); setMessage('Authenticator removed.');
    });
  }
  async function removePasskey(id: string) {
    await run(async version => { await post('remove', { credentialId: id }); setSecurity(null); await refresh(version); setMessage('Passkey removed. Its active passkey verifications have been revoked.'); });
  }
  async function copySetupKey() {
    if (!setup) return;
    try { await navigator.clipboard.writeText(setup.secret); setCopied(true); }
    catch { setMessage('Select and copy the setup key below.'); }
  }
  const totpFactors = factors.filter(f => f.factor_type === 'totp');
  const selected = totpFactors.find(f => f.id === selectedTotp);
  const hasTotp = totpFactors.some(f => f.status === 'verified');
  const providerVerified = security?.providerLevel === 'aal2';
  const verified = !!security && unlocked(security);
  const disabled = busy || locked || !security;
  const preserveBackup = !!(security?.passkeys.length || security?.passkeysUnavailable) && totpFactors.filter(f => f.status === 'verified').length <= 1;

  return <section className={styles.panel} aria-busy={busy}>
    <h2 className={styles.panelTitle}>Two-factor authentication</h2>
    <p className={styles.muted}>Use a passkey from Apple Passwords, Dashlane, or your device. Authenticator codes remain available as backup.</p>
    {stepUp && !verified ? <div role="status" className={`${styles.banner} ${styles.err}`}>This action needs an authenticator check before it can continue.</div> : null}
    <dl className={styles.kv}>
      <dt>Current session</dt><dd><span className={`${styles.pill} ${verified ? styles.good : styles.warn}`}>{verified ? 'MFA verified' : busy ? 'Checking…' : 'Verification required'}</span></dd>
      <dt>Passkeys</dt><dd>{security?.passkeysUnavailable ? 'Temporarily unavailable' : security?.passkeys.length ? `${security.passkeys.length} enrolled` : 'Not enrolled'}</dd>
      <dt>Authenticator backup</dt><dd>{hasTotp ? 'Enrolled' : 'Not enrolled'}</dd>
    </dl>
    {waitingForPasskey ? <div className={styles.mfaActionGroup}>
      <p role="status" className={styles.muted}>Waiting for your password manager or device. Check its prompt or unlock your password manager. If no prompt appears, cancel and use your authenticator code.</p>
      <button type="button" className="btn secondary" onClick={() => cancelPasskey.current?.()}>Cancel passkey prompt</button>
    </div> : null}
    {message ? <p role="status" className={styles.mfaStatusMessage}>{message}</p> : null}
    {security?.verifiedUntil && security.verified ? <p className={styles.muted}>Passkey verification expires at {new Date(security.verifiedUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</p> : null}
    {security?.passkeys.length ? <div className={styles.mfaActionGroup}>
      <button type="button" className="btn primary" disabled={disabled || !supported} onClick={() => passkey(false)}>Verify with passkey</button>
      <p className={styles.muted}>Choose your saved passkey in the browser prompt.</p>
    </div> : null}
    {!supported && !busy ? <p className={styles.muted}>Passkeys need a supported browser and a secure connection. You can still use authenticator codes.</p> : null}
    <div className={styles.mfaSection}>
      <h3 className={styles.mfaSectionTitle}>Passkeys</h3>
      {security?.passkeysUnavailable ? <p role="status" className={styles.muted}>Passkeys are temporarily unavailable. Use your authenticator backup below.</p> : null}
      {!providerVerified || !hasTotp ? <p className={styles.muted}>Set up and verify your authenticator backup below before adding a passkey. This protects enrollment if someone learns your password.</p> : null}
      <div className={styles.formStack}>
        <label htmlFor="passkey-label">Passkey name</label>
        <input id="passkey-label" className={styles.input} value={label} maxLength={80} onChange={e => setLabel(e.target.value)} placeholder="e.g. Dashlane or Apple Passwords" disabled={disabled} />
        <button type="button" className="btn primary" disabled={disabled || security?.passkeysUnavailable || !supported || !providerVerified || !hasTotp || !label.trim()} onClick={() => passkey(true)}>Add passkey</button>
      </div>
      <p className={styles.muted}>Your browser chooses which password managers to offer. Select Apple Passwords, Dashlane, or another available device when prompted.</p>
      {security?.passkeys.length ? <div className={styles.mfaList}>{security.passkeys.map(p => <div key={p.id} className={styles.mfaItem}>
        <div className={styles.mfaItemLead}><span className={styles.mfaItemIcon}>🔑</span><div><div className={styles.mfaItemName}>{p.label}</div><div className={styles.mfaItemMeta}>Passkey · verified</div></div></div>
        <button type="button" className={`btn secondary ${styles.mfaBtnSmall}`} disabled={disabled || !verified} onClick={() => removePasskey(p.id)} aria-label={`Remove passkey ${p.label}`}>Remove</button>
      </div>)}</div> : null}
    </div>
    <div className={styles.mfaSection}>
      <h3 className={styles.mfaSectionTitle}>Authenticator backup</h3>
      <p className={styles.muted}>Use six-digit codes from Apple Passwords, Dashlane, Google Authenticator, or another authenticator app.</p>
      {setup ? <div className={styles.mfaSetup}>
        <p className={styles.mfaPromptText}>Scan this QR code, then enter a six-digit code to finish activating your backup.</p>
        <div className={styles.mfaQrCard}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={setup.qr} alt="Authenticator enrollment QR code" className={styles.mfaQrImg} /></div>
        <dl className={`${styles.kv} ${styles.mfaSetupDetails}`}><dt>Website</dt><dd>{TOTP_ISSUER}</dd><dt>Account</dt><dd>{accountEmail}</dd><dt>Setup key</dt><dd><code className={styles.mfaSetupKey}>{setup.secret}</code></dd></dl>
        <button type="button" className="btn secondary" onClick={copySetupKey} disabled={locked}>{copied ? 'Setup key copied' : 'Copy setup key'}</button>
        <details className={styles.mfaInstructions}><summary>Using Apple Passwords?</summary><p>Open your saved login for {TOTP_ISSUER} in Passwords. Choose Edit, then Set Up Code, and paste the setup key. Return here with the six-digit code to finish activation.</p></details>
      </div> : null}
      {totpFactors.length ? <form className={styles.formStack} onSubmit={event => { event.preventDefault(); if (!disabled && selected) void verifyTotp(selected.id); }} aria-label="Verify authenticator code">
        <label htmlFor="totp-factor">Authenticator</label>
        <select id="totp-factor" className={styles.input} value={selectedTotp} disabled={disabled || !!setup} onChange={e => { setSelectedTotp(e.target.value); setCode(''); setMessage(''); }}>
          {totpFactors.map(f => <option key={f.id} value={f.id}>{f.friendly_name || 'Authenticator app'}{f.status !== 'verified' ? ' (incomplete setup)' : ''}</option>)}
        </select>
        {selected?.status === 'unverified' && !setup ? <p className={styles.muted}>Already saved this setup? Enter its current code to finish. Otherwise discard it and start again.</p> : null}
        <label htmlFor="mfa-code">Six-digit authenticator code</label>
        <input id="mfa-code" className={styles.input} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" disabled={disabled} />
        <div className={styles.mfaActionGroup}>
          <button type="submit" className="btn primary" disabled={disabled || code.length !== 6}>{selected?.status === 'unverified' ? 'Verify & activate' : 'Verify authenticator code'}</button>
          {selected?.status === 'unverified' ? <button type="button" className="btn secondary" disabled={disabled} onClick={() => removeFactor(selected.id)}>{setup ? 'Cancel setup' : 'Discard unverified setup'}</button> : null}
        </div>
      </form> : null}
      {!setup ? <button type="button" className="btn secondary" disabled={disabled || (factors.some(f => f.status === 'verified') && !providerVerified)} onClick={enrollTotp}>{hasTotp ? 'Add another authenticator app' : 'Set up authenticator backup'}</button> : null}
      {totpFactors.length ? <div className={styles.mfaList}>{totpFactors.map(f => <div key={f.id} className={styles.mfaItem}>
        <div className={styles.mfaItemLead}><span className={styles.mfaItemIcon}>📱</span><div><div className={styles.mfaItemName}>{f.friendly_name || 'Authenticator app'}</div><div className={styles.mfaItemMeta}>Six-digit code · {f.status}</div></div></div>
        <button type="button" className={`btn secondary ${styles.mfaBtnSmall}`} disabled={disabled || (f.status === 'verified' && (!providerVerified || preserveBackup))} onClick={() => removeFactor(f.id)} aria-label={`Remove authenticator ${f.friendly_name || f.id}`}>Remove</button>
      </div>)}</div> : null}
      {hasTotp ? <p className={styles.muted}>Keep a working authenticator as your recovery backup. Verify a code before adding or removing an authenticator app. {preserveBackup ? 'Add and verify a replacement before removing your last backup.' : ''}</p> : null}
    </div>
    {locked || (!security && !busy) ? <button type="button" className="btn secondary" onClick={() => window.location.reload()}>Reload Security</button> : null}
  </section>;
}
