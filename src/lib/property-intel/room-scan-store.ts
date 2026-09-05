import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseCustomScanJson } from './room-scan-validation';
import type { RoomSpatialScan } from './room-spatial-intel';

export type RoomScanTarget = { kind: 'job' | 'lead'; id: string };

export async function loadRoomScan(supabase: SupabaseClient, accountId: string, target: RoomScanTarget): Promise<{ scan: RoomSpatialScan | null } | null> {
  const { data, error } = await supabase.from(target.kind === 'job' ? 'jobs' : 'leads')
    .select(target.kind === 'job' ? 'room_spatial_scan, lead_id' : 'room_spatial_scan')
    .eq('account_id', accountId).eq('id', target.id).is('deleted_at', null).maybeSingle();
  if (error) throw new Error('Could not load the saved scan.');
  if (!data) return null;
  const row = data as unknown as { room_spatial_scan: unknown; lead_id?: string };
  if (row.room_spatial_scan) return { scan: parseCustomScanJson(JSON.stringify(row.room_spatial_scan)) };
  if (target.kind === 'job' && row.lead_id) {
    const inherited = await loadRoomScan(supabase, accountId, { kind: 'lead', id: row.lead_id });
    return { scan: inherited?.scan ?? null };
  }
  return { scan: null };
}

export async function saveRoomScan(supabase: SupabaseClient, accountId: string, target: RoomScanTarget, raw: string): Promise<RoomSpatialScan | null> {
  const scan = parseCustomScanJson(raw);
  const { data, error } = await supabase.from(target.kind === 'job' ? 'jobs' : 'leads')
    .update({ room_spatial_scan: scan }).eq('account_id', accountId).eq('id', target.id)
    .is('deleted_at', null).select('id').maybeSingle();
  if (error) throw new Error('Could not save the scan.');
  return data ? scan : null;
}
