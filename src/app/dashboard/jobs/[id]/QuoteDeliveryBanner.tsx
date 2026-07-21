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

  if (delivery === 'failed') {
    return (
      <div className="payment-banner warning quote-delivery-banner">
        <p><strong>Quote created — but the text or email didn&apos;t go through.</strong> Copy the link below and send it to your client manually.</p>
        {clientLink ? <CopyLinkRow clientLink={clientLink} /> : null}
      </div>
    );
  }

  if (delivery === 'no_contact') {
    return (
      <div className="payment-banner warning quote-delivery-banner">
        <p><strong>Quote created — but NOT sent.</strong> This lead has no mobile number or email on file, so we couldn&apos;t deliver it automatically. Copy the link and send it to your client.</p>
        {clientLink ? <CopyLinkRow clientLink={clientLink} /> : null}
      </div>
    );
  }

  return null;
}
