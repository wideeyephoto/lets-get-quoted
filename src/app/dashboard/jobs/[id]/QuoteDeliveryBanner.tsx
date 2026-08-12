'use client';

import { useState } from 'react';

// Shown at the top of the job page right after a quote is sent from a lead, so
// the owner sees the TRUE delivery outcome instead of assuming it went through.
// A "no_contact" / "failed" outcome pairs the warning with a copy-link so they
// can still hand the quote off manually.
type Props = {
  delivery: string;
  clientLink: string | null;
  clientName: string;
  clientEmail: string | null;
};

function CopyLinkRow({ clientLink }: { clientLink: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(clientLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="quote-delivery-copy-row">
      <input className="quote-delivery-link" value={clientLink} readOnly onFocus={(event) => event.currentTarget.select()} aria-label="Client quote link" />
      <button type="button" className="btn secondary" onClick={copy}>{copied ? 'Copied ✓' : 'Copy link'}</button>
    </div>
  );
}

export default function QuoteDeliveryBanner({ delivery, clientLink, clientName, clientEmail }: Props) {
  if (delivery === 'sms') {
    return (
      <div className="payment-banner success quote-delivery-banner">
        <p><strong>Quote texted to {clientName}.</strong> They&apos;ll get a link to view and approve it.</p>
      </div>
    );
  }

  if (delivery === 'email') {
    return (
      <div className="payment-banner success quote-delivery-banner">
        <p><strong>Quote emailed to {clientEmail}.</strong> They&apos;ll get a link to view and approve it.</p>
        {clientLink ? <CopyLinkRow clientLink={clientLink} /> : null}
      </div>
    );
  }

  /* The text bounced and the email caught it. Told plainly rather than dressed
     up as a clean send: the number on file is wrong and that is worth knowing
     before the appointment reminder goes to the same place. */
  if (delivery === 'sms_failed_emailed') {
    return (
      <div className="payment-banner success quote-delivery-banner">
        <p>
          <strong>Quote emailed to {clientEmail ?? clientName}.</strong> The text didn&apos;t go through, so it went by
          email instead — worth checking the mobile number on file.
        </p>
        {clientLink ? <CopyLinkRow clientLink={clientLink} /> : null}
      </div>
    );
  }

  if (delivery === 'failed') {
    return (
      <div className="payment-banner warning quote-delivery-banner">
        <p><strong>Quote created — but the text or email didn&apos;t go through.</strong> Copy the link below and send it to your client manually.</p>
        {clientLink ? <CopyLinkRow clientLink={clientLink} /> : null}
      </div>
    );
  }

  // Every way a quote can fail to go out, each with its own fix.
  //
  // These were one branch saying "this lead has no mobile number or email on
  // file" — which is true for exactly one of them. An owner whose client is set
  // to email-only, with a mobile right there on the record, was sent looking for
  // a missing detail that was not missing. The strings are ClientChannelReason
  // values, so the sentence follows the decision rather than guessing at it.
  const blocked: Record<string, string> = {
    no_contact: 'This lead has no mobile number or email on file, so we couldn’t deliver it automatically.',
    preference_off: `Automatic messages are switched off for ${clientName}, so nothing was sent.`,
    opted_out: `${clientName} replied STOP to a previous text and has no email on file, so nothing was sent.`,
    no_mobile: `${clientName} is set to text only and has no mobile on file, so nothing was sent.`,
    no_email: `${clientName} is set to email only and has no email address on file, so nothing was sent.`,
  };

  if (blocked[delivery]) {
    return (
      <div className="payment-banner warning quote-delivery-banner">
        <p><strong>Quote created — but NOT sent.</strong> {blocked[delivery]} Copy the link and send it to your client.</p>
        {clientLink ? <CopyLinkRow clientLink={clientLink} /> : null}
      </div>
    );
  }

  return null;
}
