'use client';

import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { UserIdentity } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type Props = {
  email: string | null;
  phone: string | null;
  providers: string[];
  stripeOnboarded: boolean;
  connectStripeAction: () => Promise<void>;
};

type ProviderKey = 'phone' | 'email' | 'google' | 'azure' | 'apple';

const METHOD_LABEL: Record<ProviderKey, string> = {
  phone: 'Phone number',
  email: 'Email',
  google: 'Google',
  azure: 'Microsoft',
  apple: 'Apple',
};

const METHOD_ICON: Record<ProviderKey | 'stripe', ReactNode> = {
  phone: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.5.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.7 21 3 13.3 3 4c0-.6.4-1 1-1h3.2c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.5.1.4 0 .8-.2 1L6.6 10.8z" />
    </svg>
  ),
  email: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M3 5h18a1 1 0 011 1v12a1 1 0 01-1 1H3a1 1 0 01-1-1V6a1 1 0 011-1zm1.4 2L12 12.5 19.6 7H4.4zM20 8.4l-7.4 5.5a1 1 0 01-1.2 0L4 8.4V18h16V8.4z" />
    </svg>
  ),
  google: (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.85A10.99 10.99 0 0012 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 010-4.2V7.05H2.18a11 11 0 000 9.9l3.66-2.85z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a10.99 10.99 0 00-9.82 6.05l3.66 2.85C6.71 7.3 9.14 5.38 12 5.38z" />
    </svg>
  ),
  azure: (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <rect x="2" y="2" width="9" height="9" fill="#F35325" />
      <rect x="13" y="2" width="9" height="9" fill="#81BC06" />
      <rect x="2" y="13" width="9" height="9" fill="#05A6F0" />
      <rect x="13" y="13" width="9" height="9" fill="#FFBA08" />
    </svg>
  ),
  apple: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M16.4 1c.1 1.1-.3 2.2-1 3-.7.8-1.8 1.5-2.9 1.4-.1-1.1.4-2.2 1-3 .8-.8 1.9-1.4 2.9-1.4zm3.9 16.9c-.5 1.2-.8 1.7-1.5 2.8-1 1.5-2.3 3.4-4 3.4-1.5 0-1.9-1-3.9-1s-2.5 1-3.9 1c-1.7 0-3-1.7-4-3.2C1 17.7.2 13.6 1.9 10.8c1.2-2 3.3-3.2 5.2-3.2 1.5 0 2.9 1 3.9 1 1 0 2.6-1.2 4.4-1 .8 0 3 .3 4.4 2.4-.1.1-2.6 1.6-2.6 4.6 0 3.6 3.1 4.9 3.1 4.9-.1.2-.5 1.7-1 3.4z" />
    </svg>
  ),
  stripe: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="#635bff" aria-hidden="true">
      <path d="M13.6 9.1c-1.4-.5-2.2-.9-2.2-1.5 0-.5.5-.8 1.3-.8 1.5 0 3.1.6 4.2 1.1l.6-3.8C16.7 3.3 15 2.8 13 2.8c-1.7 0-3.1.4-4.1 1.3-1 .8-1.6 2-1.6 3.4 0 2.6 1.6 3.7 4.1 4.6 1.6.6 2.2 1 2.2 1.6 0 .6-.5.9-1.4.9-1.2 0-3.1-.6-4.5-1.4l-.6 3.8c1.2.7 3 1.2 4.9 1.2 1.8 0 3.3-.4 4.3-1.3 1.1-.9 1.7-2.2 1.7-3.7 0-2.6-1.6-3.7-4.5-4.8z" />
    </svg>
  ),
};

export default function SignInMethods({ email, phone, providers, stripeOnboarded, connectStripeAction }: Props) {
  const [identities, setIdentities] = useState<UserIdentity[]>([]);
  const [loadingIdentities, setLoadingIdentities] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busyProvider, setBusyProvider] = useState<ProviderKey | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneOtpStep, setPhoneOtpStep] = useState(false);
  const [phoneOtpCode, setPhoneOtpCode] = useState('');
  const [openForm, setOpenForm] = useState<'email' | 'phone' | null>(null);

  async function refreshIdentities() {
    setLoadingIdentities(true);
    const { data, error } = await supabase.auth.getUserIdentities();
    if (!error) setIdentities(data?.identities ?? []);
    setLoadingIdentities(false);
  }

  useEffect(() => {
    refreshIdentities();
  }, []);

  // Fall back to the server-provided provider list until the client-side
  // fetch resolves, so the page doesn't flash "Not linked" on first paint.
  const linkedProviders = loadingIdentities ? new Set(providers) : new Set(identities.map((i) => i.provider));

  async function linkOAuth(provider: 'google' | 'azure' | 'apple') {
    setMessage(null);
    setBusyProvider(provider);
    const { error } = await supabase.auth.linkIdentity({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/dashboard/settings` },
    });
    if (error) {
      setMessage({ type: 'error', text: error.message });
      setBusyProvider(null);
    }
    // On success the browser navigates away to the provider's consent page.
  }

  async function unlink(provider: ProviderKey) {
    const identity = identities.find((i) => i.provider === provider);
    if (!identity) return;
    if (identities.length <= 1) {
      setMessage({ type: 'error', text: 'You must keep at least one sign-in method linked.' });
      return;
    }
    setMessage(null);
    setBusyProvider(provider);
    const { error } = await supabase.auth.unlinkIdentity(identity);
    setBusyProvider(null);
    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }
    setMessage({ type: 'success', text: `${METHOD_LABEL[provider]} unlinked.` });
    refreshIdentities();
  }

  async function addEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setBusyProvider('email');
    const { error } = await supabase.auth.updateUser({ email: emailInput });
    setBusyProvider(null);
    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }
    setMessage({ type: 'success', text: `Check ${emailInput} for a confirmation link to finish adding email sign-in.` });
    setOpenForm(null);
    setEmailInput('');
  }

  async function requestPhoneAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setBusyProvider('phone');
    const { error } = await supabase.auth.updateUser({ phone: phoneInput });
    setBusyProvider(null);
    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }
    setPhoneOtpStep(true);
    setMessage({ type: 'success', text: `We texted a six-digit code to ${phoneInput}.` });
  }

  async function verifyPhoneAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setBusyProvider('phone');
    const { error } = await supabase.auth.verifyOtp({ phone: phoneInput, token: phoneOtpCode, type: 'phone_change' });
    setBusyProvider(null);
    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }
    setMessage({ type: 'success', text: 'Phone number added as a sign-in method.' });
    setOpenForm(null);
    setPhoneOtpStep(false);
    setPhoneInput('');
    setPhoneOtpCode('');
    refreshIdentities();
  }

  function renderRow(provider: ProviderKey, detail: string | null, onAdd?: () => void) {
    const linked = linkedProviders.has(provider);
    const canUnlink = linked && identities.some((i) => i.provider === provider) && identities.length > 1;
    return (
      <div className="sign-in-method-row" key={provider}>
        <div className="method-info">
          <span className={`method-icon method-icon-${provider}`}>{METHOD_ICON[provider]}</span>
          <div>
            <span className="method-name">{METHOD_LABEL[provider]}</span>
            <span className="method-detail">{detail || 'Not linked'}</span>
          </div>
        </div>
        <div className="actions">
          <span className={`sign-in-method-badge ${linked ? 'linked' : 'unlinked'}`}>{linked ? 'Linked' : 'Not linked'}</span>
          {linked ? (
            canUnlink ? (
              <button type="button" className="btn secondary" disabled={busyProvider === provider} onClick={() => unlink(provider)}>Unlink</button>
            ) : null
          ) : onAdd ? (
            <button type="button" className="btn secondary" disabled={busyProvider === provider} onClick={onAdd}>Link {METHOD_LABEL[provider]}</button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="settings-sections">
      <div className="settings-section">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Payments</p>
          <h2>Payout account</h2>
        </div>
        <div className="sign-in-methods-list">
          <div className="sign-in-method-row">
            <div className="method-info">
              <span className="method-icon method-icon-stripe">{METHOD_ICON.stripe}</span>
              <div>
                <span className="method-name">Stripe</span>
                <span className="method-detail">{stripeOnboarded ? 'Payouts active' : 'Not connected'}</span>
              </div>
            </div>
            <div className="actions">
              <span className={`sign-in-method-badge ${stripeOnboarded ? 'linked' : 'unlinked'}`}>{stripeOnboarded ? 'Connected' : 'Not connected'}</span>
              {stripeOnboarded ? (
                <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer" className="btn secondary">Manage on Stripe</a>
              ) : (
                <form action={connectStripeAction}>
                  <button type="submit" className="btn secondary">Connect Stripe</button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Security</p>
          <h2>Sign-in methods</h2>
        </div>
        <div className="sign-in-methods-list">
          {renderRow('phone', phone, () => setOpenForm(openForm === 'phone' ? null : 'phone'))}
          {openForm === 'phone' && !linkedProviders.has('phone') ? (
            !phoneOtpStep ? (
              <form onSubmit={requestPhoneAdd} className="auth-form">
                <label htmlFor="add-phone">Mobile number</label>
                <input id="add-phone" type="tel" required value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} placeholder="(248) 555-0117" />
                <button type="submit" className="btn primary" disabled={busyProvider === 'phone'}>Text me a code</button>
              </form>
            ) : (
              <form onSubmit={verifyPhoneAdd} className="auth-form">
                <label htmlFor="add-phone-code">Six-digit code</label>
                <input id="add-phone-code" className="otp-input" inputMode="numeric" maxLength={6} required value={phoneOtpCode} onChange={(e) => setPhoneOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" />
                <button type="submit" className="btn primary" disabled={busyProvider === 'phone'}>Verify and link</button>
              </form>
            )
          ) : null}

          {renderRow('email', email, () => setOpenForm(openForm === 'email' ? null : 'email'))}
          {openForm === 'email' && !linkedProviders.has('email') ? (
            <form onSubmit={addEmail} className="auth-form">
              <label htmlFor="add-email">Email address</label>
              <input id="add-email" type="email" required value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="you@company.com" />
              <button type="submit" className="btn primary" disabled={busyProvider === 'email'}>Send confirmation link</button>
            </form>
          ) : null}

          {renderRow('google', linkedProviders.has('google') ? 'Connected' : null, () => linkOAuth('google'))}
          {renderRow('azure', linkedProviders.has('azure') ? 'Connected' : null, () => linkOAuth('azure'))}
          {renderRow('apple', linkedProviders.has('apple') ? 'Connected' : null, () => linkOAuth('apple'))}
        </div>
      </div>

      {message ? (
        <p className="workspace-card-copy" style={{ color: message.type === 'error' ? '#ffd166' : undefined, marginTop: '1rem' }} role="status">
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
