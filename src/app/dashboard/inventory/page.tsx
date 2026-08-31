import { createAdminClient, requireOfficeContext } from '@/lib/auth';
import { pickBusinessName } from '@/lib/business-name';
import InventoryClient from './InventoryClient';

export const metadata = {
  title: 'Inventory & Fleet Equipment | LGQ Dashboard',
  description: 'Manage tool custody, fleet vehicle maintenance, and van stock replenishment.',
};

export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
  const { accountId } = await requireOfficeContext('jobs.read');
  const admin = createAdminClient();

  const [{ data: account }, { data: site }] = await Promise.all([
    admin.from('accounts').select('business_name, company_name').eq('id', accountId).maybeSingle(),
    admin.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
  ]);

  const businessName = pickBusinessName(site, account, 'Our Company');

  return (
    <main className="min-h-screen bg-stone-50/50 dark:bg-stone-950/50 pb-16 pt-4">
      <InventoryClient businessName={businessName} />
    </main>
  );
}
