'use client';

import { useState } from 'react';
import { Download, Loader2, Check } from 'lucide-react';

export default function SaveFieldContactButton({
  className = '',
  label = 'Save Contact Card (.vcf)',
  size = 'default',
}: {
  className?: string;
  label?: string;
  size?: 'small' | 'default';
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const handleDownload = () => {
    setDownloading(true);
    // Direct browser navigation to download the vCard
    window.location.href = '/api/contacts/field-vcard';
    setTimeout(() => {
      setDownloading(false);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 3000);
    }, 1200);
  };

  const isSmall = size === 'small';

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={downloading}
      className={`save-field-contact-btn ${isSmall ? 'sm' : ''} ${className}`}
      title="Download .vcf contact card to save your company's field texting line with 1 tap"
    >
      {downloading ? (
        <Loader2 size={13} className="spin-icon" aria-hidden="true" />
      ) : downloaded ? (
        <Check size={13} aria-hidden="true" />
      ) : (
        <Download size={13} aria-hidden="true" />
      )}
      <span>{downloading ? 'Saving contact…' : downloaded ? 'Contact Saved' : label}</span>
    </button>
  );
}

