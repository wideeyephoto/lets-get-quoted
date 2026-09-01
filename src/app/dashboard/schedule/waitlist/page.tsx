import { Metadata } from 'next';
import { requireOfficeContext } from '@/lib/auth';
import { loadWaitlistContext } from '@/lib/cancellation-waitlist-data';
import WaitlistManager from './WaitlistManager';

export const metadata: Metadata = {
  title: 'Cancellation Waitlist · Let\'s Get Quoted',
  description: 'Offer newly opened windows to qualified customers in priority order.',
};

export default async function WaitlistPage() {
  const { supabase, accountId } = await requireOfficeContext('schedule.read');
  const context = await loadWaitlistContext(supabase, accountId);

  return (
    <WaitlistManager
      entries={context.entries}
      offers={context.offers}
      activePendingOffers={context.activePendingOffers}
    />
  );
}
