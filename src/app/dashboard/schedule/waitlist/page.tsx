import { Metadata } from 'next';
import { requireOfficeContext } from '@/lib/auth';
import { loadWaitlistContext } from '@/lib/cancellation-waitlist-data';
import WaitlistManager from './WaitlistManager';
import WaitlistEnableCard from './WaitlistEnableCard';

export const metadata: Metadata = {
  title: 'Cancellation Waitlist · Let\'s Get Quoted',
  description: 'Offer newly opened windows to qualified customers in priority order.',
};

export default async function WaitlistPage() {
  const { supabase, accountId } = await requireOfficeContext('schedule.read');
  const [{ data: account }, context] = await Promise.all([
    supabase
      .from('accounts')
      .select('cancellation_waitlist_enabled')
      .eq('id', accountId)
      .maybeSingle(),
    loadWaitlistContext(supabase, accountId),
  ]);

  const enabled = Boolean(account?.cancellation_waitlist_enabled);

  if (!enabled) {
    return <WaitlistEnableCard />;
  }

  return (
    <WaitlistManager
      entries={context.entries}
      offers={context.offers}
      activePendingOffers={context.activePendingOffers}
      enabled={enabled}
    />
  );
}
