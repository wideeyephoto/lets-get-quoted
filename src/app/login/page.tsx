'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendMagicLinkAction } from './actions';
import { normalizeUsPhone } from '@/lib/phone';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [method, setMethod] = useState<'email' | 'phone'>('email');
  const [phoneStep, setPhoneStep] = useState<'request' | 'verify'>('request');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const redirectUrl = `${window.location.origin}/auth/callback?next=/dashboard`;
      await sendMagicLinkAction(email, redirectUrl);
      setMessage('Check your inbox for the magic-link sign-in email.');
      setEmail('');
    } catch (error) {
      console.error('Magic link error:', error);
      setMessage(error instanceof Error ? error.message : 'Unable to send the magic link.');
    } finally {
      setLoading(false);
    }
  }

  async function requestPhoneCode(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const e164 = normalizeUsPhone(phone);
    if (!e164) {
      setMessage('Enter a valid phone number, including the country code if outside the US.');
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: e164, options: { channel: 'sms' } });
      if (error) throw error;
      setNormalizedPhone(e164);
      setPhoneStep('verify');
      setMessage(`We sent a six-digit sign-in code to ${phone}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to send the sign-in code.');
    } finally {
      setLoading(false);
    }
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

  function switchMethod(nextMethod: 'email' | 'phone') {
    setMethod(nextMethod);
    setPhoneStep('request');
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
        <p>Use your work email or mobile number. No password required.</p>
        <div className="auth-method-tabs" role="tablist" aria-label="Sign-in method">
          <button type="button" role="tab" aria-selected={method === 'email'} className={method === 'email' ? 'active' : ''} onClick={() => switchMethod('email')}>Email</button>
          <button type="button" role="tab" aria-selected={method === 'phone'} className={method === 'phone' ? 'active' : ''} onClick={() => switchMethod('phone')}>Text message</button>
        </div>

        {method === 'email' ? (
          <form onSubmit={handleEmailSubmit} className="auth-form">
            <label htmlFor="login-email">Work email</label>
            <input id="login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" autoComplete="email" required />
            <button type="submit" className="btn primary" disabled={loading}>{loading ? 'Sending...' : 'Send magic link'}</button>
          </form>
        ) : phoneStep === 'request' ? (
          <form onSubmit={requestPhoneCode} className="auth-form">
            <label htmlFor="login-phone">Mobile number</label>
            <input id="login-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(248) 555-0117" autoComplete="tel" required />
            <p className="auth-help">We&apos;ll text a one-time code. Message and data rates may apply.</p>
            <button type="submit" className="btn primary" disabled={loading}>{loading ? 'Sending...' : 'Text me a code'}</button>
          </form>
        ) : (
          <form onSubmit={verifyPhoneCode} className="auth-form">
            <label htmlFor="login-code">Six-digit code</label>
            <input id="login-code" className="otp-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" required />
            <button type="submit" className="btn primary" disabled={loading}>{loading ? 'Verifying...' : 'Verify and sign in'}</button>
            <div className="auth-inline-actions"><button type="button" onClick={() => requestPhoneCode()} disabled={loading}>Resend code</button><button type="button" onClick={() => setPhoneStep('request')} disabled={loading}>Change number</button></div>
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
