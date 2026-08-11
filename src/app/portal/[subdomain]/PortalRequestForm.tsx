'use client';

import { useState, useTransition } from 'react';
import { requestPortalLinkAction } from './actions';

/**
 * "Email me a link to my jobs."
 *
 * The acknowledgement is identical whether or not the address matched — and the
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
      <label htmlFor="portal-email">Enter your email address</label>
      <input
        id="portal-email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="customer@email.com"
      />
      <button type="submit" className="portal-request-submit" disabled={pending}>
        {pending ? 'Sending…' : 'Send secure lookup link'}
      </button>
      <small className="portal-request-fine">
        We&apos;ll email you a private link if we find a match — no password to remember. It opens your jobs for 90
        days.
      </small>
    </form>
  );
}
