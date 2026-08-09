import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeClientChannelPreference, type ClientChannelPreference } from '@/lib/client-channel';

/**
 * Read the contractor's messaging preference off jobs.
 *
 * Its own module, and its own query, for one reason: this ships ahead of
 * migrations/2026-08-10-client-message-channel.sql, and naming a column that
 * does not exist yet inside an existing SELECT fails the WHOLE query. A sweep
 * that stopped finding jobs because of a column it only needed for a filter
 * would be a much worse bug than the one this feature fixes.
 *
 * So the read is separate and swallows its own failure: no column, no map, every
 * job resolves to 'auto', and the sweeps behave exactly as they do today. Once
 * the migration has run the same code starts honouring the setting with no
 * deploy.
 */
export async function loadJobMessageChannels(
  client: SupabaseClient,
  accountId: string,
  jobIds: string[],
): Promise<Map<string, ClientChannelPreference>> {
  const channels = new Map<string, ClientChannelPreference>();
  const ids = Array.from(new Set(jobIds.filter(Boolean)));
  if (ids.length === 0) return channels;

  const { data, error } = await client
    .from('jobs')
    .select('id, message_channel')
    .eq('account_id', accountId)
    .in('id', ids);

  // Pre-migration, or any other read failure: say nothing rather than something
  // wrong. An empty map reads as 'auto' at every call site.
  if (error || !data) return channels;

  for (const row of data) {
    channels.set(row.id as string, normalizeClientChannelPreference((row as { message_channel?: unknown }).message_channel));
  }
  return channels;
}

/** Single-job form of the same read. Same fallback, same reason. */
export async function jobMessageChannel(
  client: SupabaseClient,
  accountId: string,
  jobId: string,
): Promise<ClientChannelPreference> {
  const channels = await loadJobMessageChannels(client, accountId, [jobId]);
  return channels.get(jobId) ?? 'auto';
}
