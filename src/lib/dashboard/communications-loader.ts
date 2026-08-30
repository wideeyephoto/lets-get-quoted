import type { SupabaseClient } from '@supabase/supabase-js';
import { loadConversations, type ContactIdentity } from '@/lib/messages';
import { ready, unavailable, type CommunicationSummary, type Loadable, type WaitingThread } from '@/lib/dashboard-types';

function formatElapsed(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (isNaN(diffMs) || diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export async function loadCommunications(
  supabase: SupabaseClient,
  accountId: string,
  basePath = '/dashboard',
  identities?: Map<string, ContactIdentity>,
): Promise<Loadable<CommunicationSummary>> {
  try {
    const result = await loadConversations(supabase, accountId, identities);
    const conversations = result.data;

    // Threads where the customer is waiting on us: last direction is inbound
    const waitingList = conversations.filter((c) => c.lastDirection === 'inbound');

    const waitingThreads: WaitingThread[] = waitingList.slice(0, 5).map((c) => ({
      phone: c.phone,
      clientName: c.label || c.name || c.phone,
      lastMessageSnippet: c.lastBody || (c.lastHasMedia ? '[Photo / Media]' : 'No message content'),
      waitingDuration: formatElapsed(c.lastAt),
      unreadCount: c.unread,
      isDeliveryFailure: c.lastDeliveryStatus === 'failed',
      href: `${basePath}/messages?phone=${encodeURIComponent(c.phone)}`,
    }));

    const unreadTotal = conversations.reduce((sum, c) => sum + (c.unread || 0), 0);

    return ready({
      waitingThreads,
      unreadTotal,
      pendingCallbacksCount: 0,
    });
  } catch (error) {
    console.error('Failed to load communications:', error);
    return unavailable('query_failed');
  }
}
