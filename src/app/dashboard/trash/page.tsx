import Link from 'next/link';
import { requireOfficeContext } from '@/lib/auth';
import { listTrashItems } from '@/lib/recoverable-deletions';
import TrashBinClient from './TrashBinClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Trash & Recovery',
};

export default async function TrashBinPage() {
  const { accountId } = await requireOfficeContext('settings.read');
  const { items } = await listTrashItems({ accountId, limit: 100 });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="mb-2">
            <Link href="/dashboard/settings#trash" className="text-sm font-medium text-amber-500 hover:text-amber-400">
              &larr; Back to Account settings
            </Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Trash &amp; Recovery</h1>
          <p className="text-sm text-slate-400 mt-1">
            Review soft-deleted records, check remaining grace periods, and restore items with conservative safety defaults.
          </p>
        </div>
      </div>

      <TrashBinClient initialItems={items} />
    </div>
  );
}
