import { requireOwnerContext } from '@/lib/auth';
import { loadRecipients } from '@/lib/campaigns';
import { marketingCalendarAction } from '../actions';
import MarketingNav from '../MarketingNav';
import CalendarScreen from './CalendarScreen';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Marketing calendar' };

/**
 * The year ahead, on its own screen.
 *
 * The calendar was already built and already good — it knows the climate zone,
 * the trade, which topics have been sent and which have a draft. What it never
 * had was room: it sat above a 336-line composer, so it showed four months and
 * the rest of the year was something you had to know existed.
 */
export default async function MarketingCalendarPage() {
  const { supabase, accountId } = await requireOwnerContext();
  const [view, recipients] = await Promise.all([
    marketingCalendarAction(12),
    loadRecipients(supabase, accountId),
  ]);

  return (
    <main className="wide-shell workspace-shell">
      <MarketingNav />

      <section className="workspace-hero panel marketing-hero">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Marketing · Calendar</p>
          <h1 className="workspace-title">The year ahead</h1>
          <p className="workspace-lead">
            Topics timed to {view.trade ? `${view.trade} work` : 'your trade'}
            {view.state ? ` in ${view.state}` : ''}. Pick one and it hands the draft straight to a campaign or a post.
          </p>
        </div>
      </section>

      <CalendarScreen view={view} hasRecipients={recipients.length > 0} />
    </main>
  );
}
