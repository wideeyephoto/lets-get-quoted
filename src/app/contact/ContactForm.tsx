'use client';

import { useEffect, useRef, useState } from 'react';
import { submitContactMessage, type ContactState } from './actions';
import styles from './contact.module.css';

// Cloudflare Turnstile. The site key is public (safe in client source); an env
// override is honored if present. The server only *enforces* verification when
// TURNSTILE_SECRET is set, so local/dev without the secret still works.
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '0x4AAAAAAEA3fh-yPeyQKTP3';
// Analytics attribution marker (see the data-action on the widget host below).
const TURNSTILE_ACTION = 'turnstile-spin-v2';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

function loadTurnstile(): Promise<TurnstileApi> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('no window'));
    if (window.turnstile) return resolve(window.turnstile);
    const done = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing')));
    const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
    if (existing) {
      existing.addEventListener('load', done, { once: true });
      existing.addEventListener('error', () => reject(new Error('load error')), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.dataset.turnstile = '1';
    s.onload = done;
    s.onerror = () => reject(new Error('load error'));
    document.head.appendChild(s);
  });
}

export default function ContactForm() {
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<ContactState | null>(null);
  const [token, setToken] = useState('');
  const [widgetFailed, setWidgetFailed] = useState(false);
  const widgetHost = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    let active = true;
    loadTurnstile()
      .then((ts) => {
        if (!active || !widgetHost.current || widgetId.current) return;
        widgetId.current = ts.render(widgetHost.current, {
          sitekey: SITE_KEY,
          action: TURNSTILE_ACTION,
          theme: 'auto',
          callback: (t: string) => setToken(t),
          'expired-callback': () => setToken(''),
          'error-callback': () => setToken(''),
        });
      })
      .catch(() => {
        // Widget couldn't load (network/adblock) — don't lock the user out; let
        // them submit and the server decides (and still catches bots via honeypot).
        if (active) setWidgetFailed(true);
      });
    return () => {
      active = false;
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          /* already gone */
        }
        widgetId.current = null;
      }
    };
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setPending(true);
    const res = await submitContactMessage(data);
    setPending(false);
    setState(res);
    if (res.ok) {
      form.reset();
    } else if (widgetId.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetId.current);
      } catch {
        /* noop */
      }
      setToken('');
    }
  }

  if (state?.ok) {
    return (
      <div className={styles.done} role="status">
        <p className={styles.doneH}>Thanks — your message is on its way.</p>
        <p>A real person will get back to you. In the meantime, feel free to <a href="/demo">explore the live demo</a>.</p>
      </div>
    );
  }

  const canSubmit = !pending && (!SITE_KEY || !!token || widgetFailed);

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {/* Honeypot — visually hidden, off the tab order; bots fill it, humans don't. */}
      <div className={styles.hp} aria-hidden="true">
        <label>
          Company
          <input name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className={styles.field}>
        <label htmlFor="cf-name">Your name</label>
        <input id="cf-name" name="name" required autoComplete="name" />
      </div>
      <div className={styles.field}>
        <label htmlFor="cf-email">Email</label>
        <input id="cf-email" name="email" type="email" required autoComplete="email" inputMode="email" />
      </div>
      <div className={styles.field}>
        <label htmlFor="cf-subject">Subject <span className={styles.opt}>(optional)</span></label>
        <input id="cf-subject" name="subject" autoComplete="off" />
      </div>
      <div className={styles.field}>
        <label htmlFor="cf-message">How can we help?</label>
        <textarea id="cf-message" name="message" rows={6} required />
      </div>

      {SITE_KEY ? (
        <div ref={widgetHost} className={`cf-turnstile ${styles.turnstile}`} data-action={TURNSTILE_ACTION} />
      ) : null}

      {state?.error ? <p className={styles.err} role="alert">{state.error}</p> : null}

      <button type="submit" className="btn primary" disabled={!canSubmit}>
        {pending ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}
