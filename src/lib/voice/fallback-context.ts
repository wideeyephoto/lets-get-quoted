import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { InboundCall } from '@/lib/voice/provider';

/** Save attribution from the signed inbound request before returning recovery instructions. */
export async function recordFallbackVoiceCall(
  admin: SupabaseClient,
  accountId: string,
  call: InboundCall,
  kind: 'forward' | 'voicemail',
): Promise<void> {
  const { error } = await admin.from('voice_calls').upsert({
    account_id: accountId,
    provider: 'signalwire',
    provider_call_id: call.providerCallId,
    caller_number: call.fromNumber,
    started_at: new Date().toISOString(),
    outcome: kind === 'forward' ? 'transfer_attempted' : 'voicemail',
    settlement: 'unmetered',
    is_provisional: false,
  }, { onConflict: 'provider,provider_call_id', ignoreDuplicates: true });
  // A provider retry must not overwrite a settled AI call or a ready recording.
  if (error) throw new Error('Fallback call context persistence failed');
}
