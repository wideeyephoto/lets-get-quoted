'use client';

import { trackPortalEvent } from '@/lib/analytics';
import MailIcon from '@/components/MailIcon';

export function ReferralButtons({ shareText, businessName }: { shareText: string; businessName: string }) {
  const handleClick = () => {
    trackPortalEvent({ step: 'referral_shared' });
  };

  return (
    <div className="actions workspace-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
      <a
        className="btn primary"
        href={`sms:?&body=${encodeURIComponent(shareText)}`}
        onClick={handleClick}
      >
        📱 Text to a neighbor
      </a>
      <a
        className="btn secondary"
        href={`mailto:?subject=${encodeURIComponent(`$50 off with ${businessName}`)}&body=${encodeURIComponent(shareText)}`}
        onClick={handleClick}
      >
        <MailIcon /> Email link
      </a>
    </div>
  );
}
