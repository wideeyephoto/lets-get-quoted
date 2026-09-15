'use client';

import { trackPortalEvent } from '@/lib/analytics';

export function DocumentLink({ url, documentId, children }: { url: string; documentId: string; children: React.ReactNode }) {
  return (
    <a
      href={url}
      target={url.startsWith('http') ? '_blank' : undefined}
      rel="noopener noreferrer"
      style={{ color: 'var(--ink-link, #2563eb)', fontWeight: 500, textDecoration: 'none' }}
      onClick={() => trackPortalEvent({ step: 'document_viewed', documentId })}
    >
      {children}
    </a>
  );
}
