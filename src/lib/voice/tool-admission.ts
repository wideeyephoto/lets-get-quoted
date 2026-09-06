import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { voiceRequestDeadline } from '@/lib/voice/timing';

export async function authorizeVoiceToolInvocation(admin: SupabaseClient, accountId: string, callId: string, caller: string | null): Promise<boolean> {
  try {
    const { data, error } = await voiceRequestDeadline(admin.rpc('authorize_voice_tool_invocation', {
      p_account_id: accountId, p_call_id: callId, p_caller: caller,
    }), 4000);
    return !error && data === true;
  } catch { return false; }
}
