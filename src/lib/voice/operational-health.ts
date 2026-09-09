import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { signalWireVoiceScope } from '@/lib/voice/auth';
import { voiceRequestDeadline } from '@/lib/voice/timing';

export async function recordVoiceOperationalHealth(admin: SupabaseClient = createAdminClient()) {
  const scope = signalWireVoiceScope();
  if (!scope) throw new Error('Voice health scope is not configured.');
  const { data, error } = await voiceRequestDeadline(admin.rpc('record_voice_operational_health', {
    p_project_id: scope.projectId, p_space_id: scope.spaceId,
  }), 10000);
  if (error) throw new Error(`Voice health check failed (${error.code || 'unknown'}).`);
  if (!data || !Number.isSafeInteger(data.failed) || data.failed < 0) {
    throw new Error('Voice health check returned an invalid result.');
  }
  return data as { failed: number; active?: number; observed?: number; opened?: number; resolved?: number; truncated?: boolean; skipped?: number };
}
