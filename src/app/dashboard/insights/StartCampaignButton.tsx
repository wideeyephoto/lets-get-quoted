'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { stashCampaignDraft } from '../marketing/campaign-handoff';
import type { CampaignDraft } from '@/lib/marketing-draft-data';

// The one interactive handoff on the Insights page: stash a draft that was built
// on the SERVER (so the exact words the owner is about to read aren't re-drafted
// on arrival — the whole reason the handoff goes through sessionStorage rather
// than a re-draw) and then navigate to the composer.
//
// Shared by Schedule Utilization's "start a schedule-filler campaign" button and
// the fill-schedule row of Top Opportunities, so both open the composer with the
// identical prefilled message and can't drift. It never sends anything — it only
// opens the composer, which the owner then reviews and sends themselves.

export default function StartCampaignButton({
  draft,
  className,
  children,
  ariaLabel,
}: {
  draft: CampaignDraft;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      aria-label={ariaLabel}
      onClick={() => {
        stashCampaignDraft(draft);
        router.push('/dashboard/marketing/campaigns');
      }}
    >
      {children}
    </button>
  );
}
