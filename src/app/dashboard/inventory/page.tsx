import { requireOfficeContext } from '@/lib/auth';
import {
  DEFAULT_TOOLS,
  DEFAULT_VEHICLES,
  DEFAULT_VAN_STOCK,
  DEFAULT_MAINTENANCE,
} from '@/lib/inventory-data';
import InventoryWorkspace from './InventoryWorkspace';

export const metadata = {
  title: 'Inventory & Fleet Equipment',
  description: 'Manage tool custody, fleet vehicle maintenance, and van stock replenishment.',
};

export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
  await requireOfficeContext();

  return (
    <main className="workspace-page" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <InventoryWorkspace
        initialTools={DEFAULT_TOOLS}
        initialVehicles={DEFAULT_VEHICLES}
        initialStock={DEFAULT_VAN_STOCK}
        initialMaintenance={DEFAULT_MAINTENANCE}
      />
    </main>
  );
}
