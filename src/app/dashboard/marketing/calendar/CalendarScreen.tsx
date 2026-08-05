'use client';

import { useRouter } from 'next/navigation';
import MarketingCalendar from '../MarketingCalendar';
import { stashCampaignDraft } from '../campaign-handoff';
import type { CalendarView } from '../actions';

/**
 * The calendar, wired to the campaign screen next door.
 *
 * MarketingCalendar is untouched — it still hands a drafted topic to an
 * `onUseDraft` callback. What changed is where that callback puts it: the
 * composer is a route away now, so the draft goes into sessionStorage and the
 * router follows it. See campaign-handoff for why it is not a querystring.
 */
export default function CalendarScreen({
  view,
  hasRecipients,
}: {
  view: CalendarView;
  hasRecipients: boolean;
}) {
  const router = useRouter();

  return (
    <section className="panel workspace-section-card">
      <div className="section-heading workspace-section-heading compact-heading">
        <h2>What&apos;s worth saying</h2>
      </div>
      <MarketingCalendar
        view={view}
        onUseDraft={
          hasRecipients
            ? (draft) => {
                stashCampaignDraft(draft);
                router.push('/dashboard/marketing/campaigns');
              }
            : undefined
        }
      />
    </section>
  );
}
