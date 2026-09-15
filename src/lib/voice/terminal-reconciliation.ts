import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeSignalWireSpaceOrigin } from '@/lib/sms-provider';
import { voiceRequestDeadline } from '@/lib/voice/timing';

export type VoiceAdmissionCandidate = {
  provider_call_id: string;
  dialed_number?: string | null;
  caller_number?: string | null;
};

/** A missing receipt is not proof a call is still connected. */
export async function reconcileVoiceTerminalAdmission(
  admin: SupabaseClient,
  accountId: string,
  candidate: VoiceAdmissionCandidate,
  options: { fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv } = {},
): Promise<boolean> {
  const env = options.env ?? process.env;
  const origin = normalizeSignalWireSpaceOrigin(env.SIGNALWIRE_SPACE_URL ?? '');
  const project = env.SIGNALWIRE_PROJECT_ID;
  const token = env.SIGNALWIRE_API_TOKEN;
  if (!origin || !project || !token
    || !/^[a-f0-9-]{36}$/i.test(candidate.provider_call_id)
    || !/^\+1[2-9]\d{9}$/.test(candidate.dialed_number ?? '')) return false;

  try {
    const response = await (options.fetchImpl ?? fetch)(
      `${origin}/api/voice/logs/${encodeURIComponent(candidate.provider_call_id)}`,
      { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(1500),
        headers: { Authorization: `Basic ${Buffer.from(`${project}:${token}`).toString('base64')}` } },
    );
    if (!response.ok) return false;
    const call = await response.json();
    if (!call || call.id !== candidate.provider_call_id || call.status !== 'ended'
      || call.to !== candidate.dialed_number || call.parent_id
      || (candidate.caller_number && call.from !== candidate.caller_number)
      || (call.project_id && call.project_id !== project)) return false;

    // Reuse the atomic terminal gate; do not manufacture a receipt or infer
    // billable AI time from the provider's total call duration.
    const { data, error } = await voiceRequestDeadline(admin.rpc(
      'close_voice_staff_step_up_from_provider_status',
      { p_provider_call_id: candidate.provider_call_id, p_call_status: 'completed' },
    ), 1000);
    const row = Array.isArray(data) ? data[0] : data;
    return !error && row?.account_id === accountId
      && ['closed', 'already_closed'].includes(row.close_status);
  } catch {
    // An unavailable provider must never create extra capacity.
    return false;
  }
}
