'use client';

import { useState, useTransition } from 'react';
import { requestGlobalPortalLinkAction } from './global-actions';

export default function GlobalPortalRequestForm() {
  const [sent, setSent] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <div className="portal-request-done">
        <p>{sent}</p>
        <p className="portal-request-fine">
          Check your spam folder or text messages. If you don&apos;t receive a link within a few minutes,
          contact your service contractor directly to have a fresh sign-off link texted to you.
        </p>
      </div>
    );
  }

  return (
    <form
      className="portal-request-form"
      action={(formData) => {
        startTransition(async () => {
          const result = await requestGlobalPortalLinkAction(formData);
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
        placeholder="customer@email.com or (555) 012-3456"
      />
      <button type="submit" className="portal-request-submit" disabled={pending}>
        {pending ? 'Sending…' : 'Send secure lookup link'}
      </button>
      <small className="portal-request-fine">
        We&apos;ll send a private link to whichever you use — no password to remember. It opens your active quotes, invoices, and jobs for 90 days.
      </small>
    </form>
  );
}
