import { SupabaseClient } from '@supabase/supabase-js';

export async function buildLienHelpPacketZip(supabase: SupabaseClient, accountId: string, caseId: string, snapshot: any) {
  return { zip_path: ${accountId}/\/packet-v1.zip, hash: 'placeholder', size: 0 };
}
