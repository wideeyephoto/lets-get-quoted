'use client';

import { useState, useTransition } from 'react';
import { requestPortalLinkAction } from './actions';

/**
 * "Send me a link to my jobs" — by email or by text.
 *
 * ONE FIELD, NOT TWO AND NOT A TOGGLE. A homeowner knows how their contractor
 * reaches them; they should not have to first tell us which kind of thing they
 * are about to type. The server decides from the shape of it — an "@" is an
 * email, ten digits are a phone — so a box that accepts both is strictly easier
 * than a choice, and there is no wrong tab to be on.
 *
 * type="text", deliberately, not "email": type="email" makes the browser refuse
 * to submit a phone number, and it would do so with its own popup that we
 * cannot word — "Please include an '@'" over a number the page is supposed to
 * accept. inputMode is left at the default for the same reason; forcing a
 * numeric keypad would be a bet on which one they are typing.
 *
 * The acknowledgement is identical whether or not anything matched — and the
 * form is REPLACED by it rather than staying open. Leaving the field there
 * invites a second attempt with a variant address, which is the behavior a
 * page that leaks would reward.
 *
 * Its own classes rather than the dashboard's `.btn primary`: this renders on
 * the contractor's white, accent-tinted site shell, not in the workspace.
 */
export default function PortalRequestForm({ subdomain, businessName }: { subdomain: string; businessName: string }) {
  const [sent, setSent] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <div className="portal-request-done">
        <p>{sent}</p>
        <p className="portal-request-fine">
          Check your spam folder if it doesn&apos;t arrive. Still nothing? Give {businessName} a call — they can send
          it to you directly.
        </p>
      </div>
    );
  }

  return (
    <form
      className="portal-request-form"
      action={(formData) => {
        startTransition(async () => {
          const result = await requestPortalLinkAction(subdomain, formData);
          setSent(result.message);
        });
      }}
    >
      <label htmlFor="portal-contact">Enter your email address or mobile number</label>
      <input
        id="portal-contact"
        name="contact"
        type="text"
        required
        autoComplete="email tel"
        placeholder="customer@email.com or (248) 555-0117"
      />
      <button type="submit" className="portal-request-submit" disabled={pending}>
        {pending ? 'Sending…' : 'Send secure lookup link'}
      </button>
      <small className="portal-request-fine">
        We&apos;ll send a private link to whichever you use — no password to remember. It opens your jobs for 90
        days.
      </small>
    </form>
  );
}
