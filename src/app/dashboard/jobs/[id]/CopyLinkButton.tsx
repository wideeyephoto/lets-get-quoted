'use client';

import { useState } from 'react';

// Small clipboard button for handing off a link (e.g. a /pay payment link) that
// was created without an SMS, so the owner doesn't have to select a tiny raw URL.
export default function CopyLinkButton({ url, label = 'Copy link' }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      className="btn secondary compact"
      onClick={copy}
      title={url}
      style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
    >
      {copied ? 'Copied ✓' : label}
    </button>
  );
}
