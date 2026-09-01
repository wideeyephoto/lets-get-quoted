import { requireOfficeContext } from '@/lib/auth';
import { listTrashItems } from '@/lib/recoverable-deletions';
import TrashBinClient from './TrashBinClient';

export const dynamic = 'force-dynamic';

export default async function TrashBinPage() {
  const { accountId } = await requireOfficeContext('settings.read');
  const { items } = await listTrashItems({ accountId, limit: 100 });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Trash & Recovery</h1>
          <p className="text-sm text-slate-400 mt-1">
            Review soft-deleted records, check remaining grace periods, and restore items with conservative safety defaults.
          </p>
        </div>
      </div>

      <TrashBinClient initialItems={items} />
    </div>
  );
}
