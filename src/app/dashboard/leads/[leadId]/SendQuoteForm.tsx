'use client';

// useFormState, not useActionState: this app is on React 18, where
// useActionState doesn't exist yet. It typechecks either way (the React 19
// types are present), and only fails at runtime — matching the rest of the
// codebase is what keeps that from happening again.
import { useEffect, useRef, type ReactNode } from 'react';
import { useFormState } from 'react-dom';
import type { SendQuoteState } from '../actions';
import styles from '../leads.module.css';

// The "Send the quote" form, wrapped so the server's own words land on screen.
//
// It was a plain `action={convertLead}` form, and every rejection — a $0 line
// item, a plan-only quote, Stripe not connected — threw. A thrown error in a
// server action renders the whole route as "Application error: a server-side
// exception has occurred (Digest: …)", so three different, perfectly ordinary
// mistakes all looked identical, looked like a crash, and said nothing about
// what to change. The messages were always there; nobody could read them.

export default function SendQuoteForm({
  action,
  className,
  children,
}: {
  action: (previous: SendQuoteState, formData: FormData) => Promise<SendQuoteState>;
  className?: string;
  children: ReactNode;
}) {
  const [state, formAction] = useFormState(action, null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // The submit button can sit below the fold on a long quote, so an error
  // rendered next to it would be announced and never seen.
  useEffect(() => {
    if (state?.error) errorRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [state]);

  return (
    <form id="send-quote-form" action={formAction} className={className}>
      {children}
      {state?.error ? (
        <p ref={errorRef} className={styles.sendQuoteError} role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
