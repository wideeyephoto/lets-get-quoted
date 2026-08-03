'use client';

import { useState, useTransition } from 'react';
import { requestPortalLinkAction } from './actions';

/**
 * "Email me a link to my jobs."
 *
 * The acknowledgement is identical whether or not the address matched — and the
 * form is REPLACED by it rather than staying open. Leaving the field there
 * invites a second attempt with a variant address, which is the behaviour a
 * page that leaks would reward.
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
      <label htmlFor="portal-email">The email address {businessName} has for you</label>
      <input id="portal-email" name="email" type="email" required autoComplete="email" placeholder="jane@email.com" />
      <button type="submit" className="btn primary" disabled={pending}>
        {pending ? 'Sending…' : 'Email me my link'}
      </button>
      <small className="portal-request-fine">
        No password to remember. We&apos;ll email you a link that opens your jobs for 90 days.
      </small>
    </form>
  );
}
