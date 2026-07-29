'use client';

import { useState, useTransition } from 'react';
import { submitContactMessage, type ContactState } from './actions';
import styles from './contact.module.css';

export default function ContactForm() {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ContactState | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      const res = await submitContactMessage(data);
      setState(res);
      if (res.ok) form.reset();
    });
  }

  if (state?.ok) {
    return (
      <div className={styles.done} role="status">
        <p className={styles.doneH}>Thanks — your message is on its way.</p>
        <p>A real person will get back to you. In the meantime, feel free to <a href="/demo">explore the live demo</a>.</p>
      </div>
    );
  }

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

      {state?.error ? <p className={styles.err} role="alert">{state.error}</p> : null}

      <button type="submit" className="btn primary" disabled={pending}>
        {pending ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}
