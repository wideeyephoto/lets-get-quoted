import { requireOfficeContext } from '@/lib/auth';
import { queryTenantAuditEvents } from '@/lib/tenant-audit';
import ActivityLedgerClient from './ActivityLedgerClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Activity Ledger',
};

export default async function ActivityLedgerPage() {
  const { accountId } = await requireOfficeContext('settings.read');
  const { events, total } = await queryTenantAuditEvents({ accountId, limit: 100 });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Activity Ledger & Audit</h1>
          <p className="text-sm text-slate-400 mt-1">
            Complete, immutable chronological record of material tenant actions, deletions, restorations, and actor snapshots.
          </p>
        </div>
      </div>

      <ActivityLedgerClient initialEvents={events} total={total} />
    </div>
  );
}
