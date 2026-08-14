import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { getAvailableTaxYears, buildProfitAndLoss, buildScheduleCWorksheet, build1099PrepList } from '@/lib/tax-reports';
import FinanceReports from '../settings/FinanceReports';

export const metadata = { title: 'Financial reports' };

/**
 * Financial reports, on their own page.
 *
 * These were three long accordions at the bottom of the Business settings tab,
 * which is the wrong place twice over: they are not settings — nothing here is
 * a preference, it is all output — and they were being built on every render of
 * a page people open to change a phone number.
 */
export default async function ReportsPage({ searchParams }: { searchParams: { year?: string } }) {
  const { supabase, accountId } = await requireOwnerContext();

  const availableYears = await getAvailableTaxYears(supabase, accountId);
  const requestedYear = searchParams.year ? parseInt(searchParams.year, 10) : NaN;
  const selectedYear = availableYears.includes(requestedYear) ? requestedYear : availableYears[0];

  const [pl, subPrep] = await Promise.all([
    buildProfitAndLoss(supabase, accountId, selectedYear),
    build1099PrepList(supabase, accountId, selectedYear),
  ]);
  const scheduleC = buildScheduleCWorksheet(pl);

  return (
    <main className="wide-shell workspace-shell">
      <header className="inbox-header">
        <div className="inbox-header-copy">
          <h1 className="workspace-title">Financial reports</h1>
          <p className="workspace-lead">Your figures, prepared the way a bookkeeper wants them.</p>
        </div>
        <div className="inbox-header-tools">
          <Link className="btn secondary" href="/dashboard/settings#finances">Back to Business settings</Link>
        </div>
      </header>

      <section className="panel workspace-section-card" id="finances">
        <FinanceReports
          year={selectedYear}
          availableYears={availableYears}
          pl={pl}
          scheduleC={scheduleC}
          subPrep={subPrep}
        />
      </section>
    </main>
  );
}
