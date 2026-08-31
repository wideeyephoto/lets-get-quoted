'use server';

import { headers } from 'next/headers';
import { requireCrewContext } from '@/lib/crew-auth';
import { savePushSubscription, deletePushSubscription, type PushSubscriptionJson } from '@/lib/push';

// Store the browser's push subscription against the signed-in crew member. Runs
// under the crew session (requireCrewContext) so a subscription can only ever be
// tied to the crew member who created it.
export async function subscribeToPushAction(sub: PushSubscriptionJson): Promise<void> {
  const { accountId, crew } = await requireCrewContext();
  const userAgent = (await headers()).get('user-agent');
  await savePushSubscription(accountId, crew.id, sub, userAgent);
}

// Crew turned notifications off on this device. Verify the session, then drop the
// endpoint (idempotent — an already-removed endpoint is a no-op).
export async function unsubscribeFromPushAction(endpoint: string): Promise<void> {
  await requireCrewContext();
  await deletePushSubscription(endpoint);
}
