'use client';

import { useState } from 'react';

export default function SaveFieldContactButton({
  className = '',
  label = 'Save Field Line to Contacts',
  size = 'default',
}: {
  className?: string;
  label?: string;
  size?: 'small' | 'default';
}) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = () => {
    setDownloading(true);
    // Direct browser navigation to download the vCard
    window.location.href = '/api/contacts/field-vcard';
    setTimeout(() => setDownloading(false), 2000);
  };

  const isSmall = size === 'small';

  return (
    <button
      type="button"
      onClick={handleDownload}
      className={`inline-flex items-center gap-1.5 font-medium rounded-lg transition-colors ${
        isSmall
          ? 'text-xs px-2.5 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/25'
          : 'text-sm px-3 py-1.5 bg-blue-600/15 hover:bg-blue-600/25 text-blue-300 border border-blue-500/30'
      } ${className}`}
      title="Download .vcf contact card to save your company's field texting line with 1 tap"
    >
      <span aria-hidden="true">{downloading ? '⏳' : '📱'}</span>
      <span>{downloading ? 'Saving contact…' : label}</span>
    </button>
  );
}
