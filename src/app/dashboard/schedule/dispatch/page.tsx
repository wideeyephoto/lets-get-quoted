import Link from 'next/link';
import { requireOfficeContext } from '@/lib/auth';
import { loadCrewLocationMapSnapshot } from '@/lib/crew-location';
import LiveCrewMap from '@/app/dashboard/crew/LiveCrewMap';

export const metadata = { title: 'Live Dispatch · Schedule' };
export const dynamic = 'force-dynamic';

export default async function ScheduleLiveDispatchPage() {
  const { supabase, accountId, capabilities, role } = await requireOfficeContext('crew.read');
  const canViewPay = role === 'owner' || capabilities.has('crew_pay.read');
  const mapSnapshot = await loadCrewLocationMapSnapshot(supabase, accountId, { canViewPay });

  return (
    <main className="wide-shell workspace-shell crew-shell">
      <section className="panel workspace-section-card" style={{ padding: '1.25rem' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>Schedule &amp; Operations</p>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0.25rem 0' }}>Live Dispatch</h1>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Link href="/dashboard/schedule" className="btn secondary sm">
              ← Calendar
            </Link>
            <Link href="/dashboard/schedule/plan" className="btn secondary sm">
              Route Planner
            </Link>
            <Link href="/dashboard/crew?tab=team" className="btn secondary sm">
              Team Roster
            </Link>
          </div>
        </header>

        <LiveCrewMap
          initialSnapshot={mapSnapshot}
          canViewPay={canViewPay}
          accountId={accountId}
        />
      </section>
    </main>
  );
}
