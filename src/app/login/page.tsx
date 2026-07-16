'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendMagicLinkAction } from './actions';
import { normalizeUsPhone } from '@/lib/phone';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
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

  async function verifyPhoneCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setMessage('Enter the six-digit code from the text message.');
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      const { error } = await supabase.auth.verifyOtp({ phone: normalizedPhone, token: code, type: 'sms' });
      if (error) throw error;
      router.replace('/dashboard');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'That code could not be verified.');
    } finally {
      setLoading(false);
    }
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
      <section className="hero-card">
        <p className="eyebrow">Secure sign-in</p>
        <h1>Sign in to your workspace</h1>
        <p>Enter your mobile number or email. No password required.</p>

        {step === 'request' ? (
          <form onSubmit={handleIdentifierSubmit} className="auth-form">
            <label htmlFor="login-identifier">Mobile number or email</label>
            <input id="login-identifier" type="text" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="(248) 555-0117 or you@company.com" autoComplete="username" required />
            <p className="auth-help">We&apos;ll text a one-time code or email a magic link, whichever matches.</p>
            <button type="submit" className="btn primary" disabled={loading}>{loading ? 'Sending...' : 'Continue'}</button>
          </form>
        ) : (
          <form onSubmit={verifyPhoneCode} className="auth-form">
            <label htmlFor="login-code">Six-digit code</label>
            <input id="login-code" className="otp-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" required />
            <button type="submit" className="btn primary" disabled={loading}>{loading ? 'Verifying...' : 'Verify and sign in'}</button>
            <div className="auth-inline-actions"><button type="button" onClick={resendCode} disabled={loading}>Resend code</button><button type="button" onClick={switchToRequest} disabled={loading}>Start over</button></div>
          </form>
        )}

        <div className="auth-divider" role="separator"><span>or continue with</span></div>
        <div className="auth-oauth-buttons">
          <button type="button" className="btn secondary" onClick={() => signInWithProvider('google')}>Continue with Google</button>
          <button type="button" className="btn secondary" onClick={() => signInWithProvider('azure')}>Continue with Microsoft</button>
        </div>

        {message ? <p className="auth-message" role="status">{message}</p> : null}
      </section>
    </main>
  );
}
