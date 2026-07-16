'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { UserIdentity } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type Props = {
  email: string | null;
  phone: string | null;
  providers: string[];
};

type ProviderKey = 'phone' | 'email' | 'google' | 'azure' | 'apple';

const METHOD_LABEL: Record<ProviderKey, string> = {
  phone: 'Phone number',
  email: 'Email',
  google: 'Google',
  azure: 'Microsoft',
  apple: 'Apple',
};

export default function SignInMethods({ email, phone, providers }: Props) {
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
        <div>
          <span className="method-name">{METHOD_LABEL[provider]}</span>
          <span className="method-detail">{detail || 'Not linked'}</span>
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
    <div>
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

      {message ? (
        <p className="workspace-card-copy" style={{ color: message.type === 'error' ? '#ffd166' : undefined, marginTop: '1rem' }} role="status">
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
