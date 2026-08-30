'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { resolveMessageMatchHero, type MessageMatchResult } from '@/lib/ad-message-match';

type Props = {
  trade: string;
  city?: string | null;
  businessName: string;
  defaultHeadline?: string;
  defaultSubheadline?: string;
};

export default function AdMessageMatchBanner({
  trade,
  city,
  businessName,
  defaultHeadline,
  defaultSubheadline,
}: Props) {
  const searchParams = useSearchParams();
  const [matchResult, setMatchResult] = useState<MessageMatchResult | null>(null);

  useEffect(() => {
    const utmTerm = searchParams?.get('utm_term') || searchParams?.get('keyword') || null;
    const utmCampaign = searchParams?.get('utm_campaign') || null;
    const utmContent = searchParams?.get('utm_content') || null;

    const result = resolveMessageMatchHero({
      trade,
      city,
      businessName,
      utmTerm,
      utmCampaign,
      utmContent,
      defaultHeadline,
      defaultSubheadline,
    });

    if (result.isMatch) {
      setMatchResult(result);
    }
  }, [searchParams, trade, city, businessName, defaultHeadline, defaultSubheadline]);

  if (!matchResult || !matchResult.isMatch) {
    return null;
  }

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.12) 0%, rgba(59, 130, 246, 0.08) 100%)',
        border: '1px solid rgba(249, 115, 22, 0.3)',
        borderRadius: '12px',
        padding: '0.85rem 1.15rem',
        margin: '0.75rem 0 1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        flexWrap: 'wrap',
      }}
    >
      <div>
        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: 800,
            color: 'var(--accent, #f97316)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            display: 'block',
            marginBottom: '0.2rem',
          }}
        >
          {matchResult.trustBadge}
        </span>
        <strong style={{ fontSize: '1rem', color: 'var(--foreground)' }}>
          {matchResult.headline}
        </strong>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0.2rem 0 0' }}>
          {matchResult.subheadline}
        </p>
      </div>
      <span
        style={{
          background: 'var(--accent, #f97316)',
          color: '#ffffff',
          fontSize: '0.75rem',
          fontWeight: 700,
          padding: '0.3rem 0.65rem',
          borderRadius: '20px',
        }}
      >
        Priority Response Active ⚡
      </span>
    </div>
  );
}
