'use client';

import { useState } from 'react';
import { sendCrewMagicLinkAction } from './actions';

export default function CrewLoginForm({ initialError }: { initialError: string | null }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState(initialError ?? '');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = email.trim();
    if (!value) {
      setMessage('Enter the email your manager has on file for you.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      await sendCrewMagicLinkAction(value);
      setSent(true);
      setMessage('Check your email for a sign-in link. It expires in 60 minutes.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send the sign-in link.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="field-login-form">
      <label htmlFor="crew-email">Your email</label>
      <input
        id="crew-email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@email.com"
        required
      />
      <button type="submit" className="btn primary" disabled={loading || sent}>
        {loading ? 'Sending…' : sent ? 'Link sent ✓' : 'Send my sign-in link'}
      </button>
      {message ? <p className="field-login-message" role="status">{message}</p> : null}
    </form>
  );
}
