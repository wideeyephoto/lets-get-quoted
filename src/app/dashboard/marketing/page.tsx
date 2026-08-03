import Link from 'next/link';
import { marketingCalendarAction } from './actions';
import MarketingCalendar from './MarketingCalendar';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Marketing calendar' };

export default async function MarketingPage() {
  const view = await marketingCalendarAction(4);

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Marketing</p>
          <h1 className="workspace-title">What&apos;s worth saying, and when</h1>
          <p className="workspace-lead">
            Seasonal topics for {view.businessName}, timed to your trade and your weather. Nothing here sends —
            it drafts, you decide, and it goes out through your{' '}
            <Link href="/dashboard/campaigns">campaigns</Link> or your{' '}
            <Link href="/dashboard/sites">website</Link> with their own unsubscribe rules.
          </p>
        </div>
      </section>

      <section className="panel workspace-section-card">
        <MarketingCalendar view={view} />
      </section>
    </main>
  );
}
