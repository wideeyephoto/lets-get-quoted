'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';
import { revokePortalLinks } from '@/lib/client-portal-data';

/**
 * Cut off a client's portal links.
 *
 * The reason this needs to exist: a portal link lives in an email inbox for 90
 * days, and inboxes get shared, sold with a house, or left open on a laptop. An
 * owner who hears "my ex still has access to all that" needs a button, not a
 * support ticket.
 *
 * Revokes every live link at once rather than one at a time — somebody asking
 * for this wants the door shut, not a list to work through.
 */
export async function revokeClientPortalAction(clientId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  await revokePortalLinks(supabase, accountId, clientId);
  revalidatePath(`/dashboard/clients/${clientId}`);
}
