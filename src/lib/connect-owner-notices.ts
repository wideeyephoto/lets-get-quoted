import 'server-only';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getRecipientTransferStatus } from '@/lib/stripe-connect';
import { runOwnerEventNotices } from '@/lib/owner-event-notices';

/** Snapshot before the provider read so competing account changes fence stale results. */
export async function syncConnectTransferStatus(admin: SupabaseClient, stripeAccountId: string, accountId?: string) {
  let lookup = admin.from('accounts')
    .select('id,connect_onboarded,connect_disabled_at,connect_notice_event_id,connect_status_version')
    .eq('stripe_connect_id', stripeAccountId);
  if (accountId) lookup = lookup.eq('id', accountId);
  const loaded = await lookup.maybeSingle();
  if (loaded.error) throw new Error('Could not read connected account');
  const current = loaded.data;
  if (!current) return;
  const status = await getRecipientTransferStatus(stripeAccountId);
  if (status === null) throw new Error('Connected account transfer status unavailable');
  const active = status === 'active';
  const interruption = !active && current.connect_onboarded === true && !current.connect_disabled_at;
  const eventId = interruption ? randomUUID() : null;
  let update = admin.from('accounts').update({
    connect_onboarded: active,
    connect_status_version: randomUUID(),
    ...(active ? { connect_disabled_at: null } : {}),
    ...(eventId ? { connect_disabled_at: new Date().toISOString(), connect_notice_event_id: eventId } : {}),
  }).eq('id', current.id).eq('stripe_connect_id', stripeAccountId);
  // Keep the last event ID through recovery: it also fences disable/recover cycles.
  for (const field of ['connect_onboarded', 'connect_disabled_at', 'connect_notice_event_id', 'connect_status_version'] as const) {
    update = current[field] === null ? update.is(field, null) : update.eq(field, current[field]);
  }
  const saved = await update.select('id').maybeSingle();
  if (saved.error) throw new Error('Could not save connected account transfer status');
  // Re-read the provider on redelivery: the competing observation may differ.
  if (!saved.data) throw new Error('Connected account changed during transfer status check');
  if (eventId) {
    try { await runOwnerEventNotices(admin, { sourceId: eventId, accountId: current.id }); }
    catch { console.error('Connected account notice remains saved for pickup'); }
  }
  return active;
}
