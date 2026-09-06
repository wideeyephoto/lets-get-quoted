'use client';

import { useState } from 'react';
import { sendCrewMagicLinkAction, preflightCrewPhoneAction } from './actions';
import { normalizeUsPhone, displayPhone } from '@/lib/phone';
import { supabase } from '@/lib/supabase';

export default function CrewLoginForm({ initialError }: { initialError: string | null }) {
  const [identifier, setIdentifier] = useState('');
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [code, setCode] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [message, setMessage] = useState(initialError ?? '');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

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
      try {
        await sendCrewMagicLinkAction(value);
        setSent(true);
        setMessage('Check your email for a sign-in link. It expires in 7 days.');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not send the sign-in link.');
      } finally {
        setLoading(false);
      }
      return;
    }

    const e164 = normalizeUsPhone(value);
    if (!e164) {
      setLoading(false);
      setMessage('Enter a valid 10-digit mobile number or email address.');
      return;
    }

    try {
      await preflightCrewPhoneAction(e164);
      const { error } = await supabase.auth.signInWithOtp({ phone: e164, options: { channel: 'sms' } });
      if (error) throw error;
      setNormalizedPhone(e164);
      setStep('verify');
      setMessage(`We sent a six-digit sign-in code to ${displayPhone(e164)}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send the sign-in code.');
    } finally {
      setLoading(false);
    }
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
      const res = await fetch('/auth/crew-verify-phone', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: normalizedPhone, code: nextCode }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; redirect?: string; error?: string };
      if (!res.ok || !data.ok) {
        setMessage(data.error || 'That code could not be verified.');
        setLoading(false);
        return;
      }
      window.location.assign(data.redirect || '/field');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'That code could not be verified.');
      setLoading(false);
    }
  }

  async function handleVerifySubmit(event: React.FormEvent<HTMLFormElement>) {
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
    setSent(false);
  }

  if (step === 'verify') {
    return (
      <form onSubmit={handleVerifySubmit} className="field-login-form">
        <label htmlFor="crew-code">Six-digit code</label>
        <input
          id="crew-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="123456"
          value={code}
          onChange={(event) => updateCode(event.target.value)}
          required
          autoFocus
        />
        <button type="submit" className="btn primary" disabled={loading || code.length < 6}>
          {loading ? 'Verifying…' : 'Sign in to field app'}
        </button>
        <button
          type="button"
          className="btn text"
          style={{ background: 'none', border: 'none', color: 'var(--ink-sky-1)', cursor: 'pointer', padding: '0.5rem', fontSize: '0.88rem' }}
          onClick={switchToRequest}
        >
          ← Use a different number or email
        </button>
        {message ? <p className="field-login-message" role="status">{message}</p> : null}
      </form>
    );
  }

  return (
    <form onSubmit={handleIdentifierSubmit} className="field-login-form">
      <label htmlFor="crew-identifier">Mobile number or email</label>
      <input
        id="crew-identifier"
        type="text"
        inputMode="email"
        autoComplete="username"
        value={identifier}
        onChange={(event) => setIdentifier(event.target.value)}
        placeholder="(248) 555-0123 or you@email.com"
        required
      />
      <button type="submit" className="btn primary" disabled={loading || sent}>
        {loading ? 'Sending…' : sent ? 'Link sent ✓' : 'Send sign-in code or link'}
      </button>
      {message ? <p className="field-login-message" role="status">{message}</p> : null}
    </form>
  );
}

