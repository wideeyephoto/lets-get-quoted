import { notFound } from 'next/navigation';

export const metadata = {
  title: 'Inventory & Fleet Equipment',
  description: 'Manage tool custody, fleet vehicle maintenance, and van stock replenishment.',
};

export const dynamic = 'force-dynamic';

export default function InventoryPage() {
  notFound();
}
