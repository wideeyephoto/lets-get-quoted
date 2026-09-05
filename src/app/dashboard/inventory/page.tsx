import { createAdminClient, requireOfficeContext } from '@/lib/auth';
import { pickBusinessName } from '@/lib/business-name';
import { loadInventoryData } from '@/lib/inventory-db';
import { listCrew } from '@/lib/crew';
import { listJobs } from '@/lib/jobs';
import InventoryClient from './InventoryClient';

export const metadata = {
  title: 'Inventory & Fleet Equipment | LGQ Dashboard',
  description: 'Manage tool custody, fleet vehicle maintenance, and multi-location van stock replenishment.',
};

export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
  const { supabase, accountId, account, capabilities, role } = await requireOfficeContext('inventory.read');
  const admin = createAdminClient();

  const [{ data: site }, inventoryPayload, crewList, jobsList] = await Promise.all([
    admin.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
    loadInventoryData(supabase, accountId),
    listCrew(supabase, accountId).catch(() => []),
    listJobs(supabase, accountId).catch(() => []),
  ]);

  const businessName = pickBusinessName(site, account, 'Our Company');

  const crewMembers = (crewList || [])
    .filter((c) => c.active !== false && !c.deleted_at)
    .map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role_label,
    }));

  const activeJobs = (jobsList || []).map((j) => ({
    id: j.id,
    label: `${j.ref ? `#${j.ref} - ` : ''}${j.client_name}${j.address ? ` (${j.address})` : ''}`,
    status: j.status,
  }));

  const canWrite = role === 'owner' || capabilities.has('inventory.write') || capabilities.has('jobs.write');
  const canCustody = role === 'owner' || capabilities.has('inventory.custody') || capabilities.has('inventory.write') || capabilities.has('jobs.write');

  return (
    <main className="wide-shell workspace-shell">
      <InventoryClient
        businessName={businessName}
        initialPayload={inventoryPayload}
        crewMembers={crewMembers}
        activeJobs={activeJobs}
        canWrite={canWrite}
        canCustody={canCustody}
      />
    </main>
  );
}
