'use client';

import { useState } from 'react';
import { sendMagicLinkAction } from './actions';
import { normalizeUsPhone } from '@/lib/phone';
import { supabase } from '@/lib/supabase';

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="4" y="10.5" width="16" height="10" rx="2" />
      <path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5" />
    </svg>
  );
}

function IdCardIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <circle cx="9" cy="12" r="2" />
      <path d="M6.5 16.2c.5-1.4 1.4-2.2 2.5-2.2s2 .8 2.5 2.2M14.5 10h4M14.5 13.5h4" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 5.5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H8l-4 3v-3H3a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z" transform="translate(0.5 0)" />
      <path d="M6 9.5h12M6 13h7" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47c-.28 1.48-1.13 2.73-2.4 3.58v2.98h3.89c2.28-2.1 3.56-5.2 3.56-8.8z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.9l-3.89-2.98c-1.08.72-2.46 1.15-4.04 1.15-3.1 0-5.73-2.09-6.67-4.9H1.3v3.07C3.26 21.3 7.3 24 12 24z" />
      <path fill="#FBBC05" d="M5.33 14.37A7.2 7.2 0 0 1 4.95 12c0-.82.14-1.62.38-2.37V6.56H1.3A11.98 11.98 0 0 0 0 12c0 1.94.47 3.77 1.3 5.44l4.03-3.07z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.45-3.45C17.94 1.19 15.24 0 12 0 7.3 0 3.26 2.7 1.3 6.56l4.03 3.07C6.27 6.84 8.9 4.75 12 4.75z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 23 23" width="16" height="16" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

export default function LoginPage() {
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [identifier, setIdentifier] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function sendEmailLink(value: string) {
    try {
      const redirectUrl = `${window.location.origin}/auth/callback?next=/dashboard`;
      await sendMagicLinkAction(value, redirectUrl);
      setMessage('Check your inbox for the magic-link sign-in email.');
      setIdentifier('');
    } catch (error) {
      console.error('Magic link error:', error);
      setMessage(error instanceof Error ? error.message : 'Unable to send the magic link.');
    } finally {
      setLoading(false);
    }
  }

  async function sendPhoneCode(e164: string, displayValue: string) {
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: e164, options: { channel: 'sms' } });
      if (error) throw error;
      setNormalizedPhone(e164);
      setStep('verify');
      setMessage(`We sent a six-digit sign-in code to ${displayValue}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to send the sign-in code.');
    } finally {
      setLoading(false);
    }
  }

  async function handleIdentifierSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = identifier.trim();
    if (!value) {
      setMessage('Enter your mobile number or email address.');
      return;
    }

    setLoading(true);
    setMessage('');

    if (value.includes('@')) {
      await sendEmailLink(value);
      return;
    }

    const e164 = normalizeUsPhone(value);
    if (!e164) {
      setLoading(false);
      setMessage('Enter a valid mobile number or email address.');
      return;
    }

    await sendPhoneCode(e164, value);
  }

  async function resendCode() {
    setLoading(true);
    setMessage('');
    await sendPhoneCode(normalizedPhone, identifier.trim());
  }

  async function verifyPhoneCodeValue(nextCode: string) {
    if (loading) return;
    if (!/^\d{6}$/.test(nextCode)) {
      setMessage('Enter the six-digit code from the text message.');
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      // Verify on the SERVER so the session cookies are written server-side and
      // are visible to the middleware/server components. The previous
      // client-side verifyOtp wrote a session the server never accepted, so the
      // dashboard bounced back to /login. Mirrors the email /auth/callback flow.
      const res = await fetch('/auth/verify-phone', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: normalizedPhone, code: nextCode }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setMessage(data.error || 'That code could not be verified.');
        setLoading(false);
        return;
      }
      // Cookies are set on the response — a full navigation carries them.
      window.location.assign('/dashboard');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'That code could not be verified.');
      setLoading(false);
    }
  }

  async function verifyPhoneCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await verifyPhoneCodeValue(code);
  }

  function updateCode(value: string) {
    const nextCode = value.replace(/\D/g, '').slice(0, 6);
    setCode(nextCode);
    if (nextCode.length === 6) void verifyPhoneCodeValue(nextCode);
  }

  function switchToRequest() {
    setStep('request');
    setCode('');
    setMessage('');
  }

  async function signInWithProvider(provider: 'google' | 'azure') {
    setMessage('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
    });
    if (error) setMessage(error.message);
  }

  return (
    <main className="page-shell">
      <section className="hero-card auth-card">
        <div className="auth-badge"><LockIcon /><span>Secure Sign-In</span></div>
        <h1>Sign in</h1>
        <p>Mobile number or email. No password.</p>

        {step === 'request' ? (
          <form onSubmit={handleIdentifierSubmit} className="auth-form">
            <label htmlFor="login-identifier">Mobile number or email</label>
            <div className="input-icon-group">
              <IdCardIcon />
              <input id="login-identifier" type="text" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="(248) 555-0117 or you@company.com" autoComplete="username" required />
            </div>
            <button type="submit" className="btn primary" disabled={loading}>{loading ? 'Sending…' : <>Continue <ArrowRightIcon /></>}</button>
          </form>
        ) : (
          <form onSubmit={verifyPhoneCode} className="auth-form">
            <label htmlFor="login-code">6-digit code</label>
            <div className="input-icon-group">
              <MessageIcon />
              <input id="login-code" className="otp-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => updateCode(event.target.value)} placeholder="000000" required />
            </div>
            <button type="submit" className="btn primary" disabled={loading}>{loading ? 'Verifying…' : <>Verify <ArrowRightIcon /></>}</button>
            <div className="auth-inline-actions"><button type="button" onClick={resendCode} disabled={loading}>Resend code</button><button type="button" onClick={switchToRequest} disabled={loading}>Start over</button></div>
          </form>
        )}

        <div className="auth-divider" role="separator"><span>Or continue with</span></div>
        <div className="auth-oauth-buttons">
          <button type="button" className="btn secondary" onClick={() => signInWithProvider('google')}><GoogleIcon /> Google</button>
          <button type="button" className="btn secondary" onClick={() => signInWithProvider('azure')}><MicrosoftIcon /> Microsoft</button>
        </div>

        {message ? <p className="auth-message" role="status">{message}</p> : null}

        <p className="auth-trust"><LockIcon /> Encrypted. We never store passwords.</p>
      </section>
    </main>
  );
}
