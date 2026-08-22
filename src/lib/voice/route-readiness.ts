import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  loadSignalWireVoiceNumberReadiness,
  type SignalWireVoiceNumber,
} from '@/lib/voice/number-readiness';

export const AI_VOICE_ROUTE_VERIFIED_EVENT = 'ai_voice_route_verified';

export type VoiceRouteReadiness =
  | Readonly<{ kind: 'ready'; number: string; verifiedAt: string }>
  | Readonly<{
    kind: 'not_ready';
    reason: 'missing_number' | 'dedicated_number_not_ready' | 'unverified';
    number: string | null;
  }>
  | Readonly<{ kind: 'unavailable' }>;

function evidenceShape(number: SignalWireVoiceNumber) {
  return Object.freeze({
    route: 'ai_voice',
    number: number.number,
    sender_number_id: number.senderNumberId,
    route_revision: number.routeRevision,
  });
}

export function matchesCurrentVoiceRouteEvidence(
  metaValue: unknown,
  number: SignalWireVoiceNumber,
): boolean {
  const meta = metaValue && typeof metaValue === 'object' && !Array.isArray(metaValue)
    ? metaValue as Record<string, unknown>
    : {};
  return meta.route === 'ai_voice'
    && meta.number === number.number
    && meta.sender_number_id === number.senderNumberId
    && meta.route_revision === number.routeRevision;
}

/**
 * Proves that the CURRENT customer-facing number has reached the AI Voice route.
 *
 * `accounts.call_tracking_verified_at` is deliberately insufficient: the older
 * missed-call route writes the same field, so it proves only that some LGQ voice
 * webhook answered. The event below names the AI route and carries the exact
 * normalized number, which also makes evidence for an old number go stale when
 * the owner replaces it.
 */
export async function loadVoiceRouteReadiness(
  client: SupabaseClient,
  accountId: string,
): Promise<VoiceRouteReadiness> {
  try {
    const inventory = await loadSignalWireVoiceNumberReadiness(client, { accountId });
    if (inventory.kind === 'unavailable') return { kind: 'unavailable' };
    if (inventory.kind !== 'ready') {
      return {
        kind: 'not_ready',
        reason: inventory.currentNumber ? 'dedicated_number_not_ready' : 'missing_number',
        number: inventory.currentNumber,
      };
    }
    const ready = inventory.number;

    const { data: event, error: eventError } = await client
      .from('account_events')
      .select('created_at')
      .eq('account_id', accountId)
      .eq('kind', AI_VOICE_ROUTE_VERIFIED_EVENT)
      .contains('meta', evidenceShape(ready))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (eventError) {
      console.error('AI voice route evidence read failed:', eventError);
      return { kind: 'unavailable' };
    }
    if (!event?.created_at) {
      return { kind: 'not_ready', reason: 'unverified', number: ready.number };
    }
    return { kind: 'ready', number: ready.number, verifiedAt: String(event.created_at) };
  } catch (error) {
    console.error('AI voice route readiness threw:', error);
    return { kind: 'unavailable' };
  }
}

/** Persist the exact signed-call evidence activation later requires. */
export async function recordVoiceRouteVerification(
  admin: SupabaseClient,
  input: Readonly<{ accountId: string; number: string; providerCallId: string }>,
): Promise<boolean> {
  try {
    const inventory = await loadSignalWireVoiceNumberReadiness(admin, {
      accountId: input.accountId,
      number: input.number,
    });
    if (inventory.kind !== 'ready') return false;
    const ready = inventory.number;
    const evidence = evidenceShape(ready);

    const { data: existing, error: existingError } = await admin
      .from('account_events')
      .select('id')
      .eq('account_id', input.accountId)
      .eq('kind', AI_VOICE_ROUTE_VERIFIED_EVENT)
      .contains('meta', evidence)
      .limit(1)
      .maybeSingle();
    if (existingError) {
      console.error('AI voice route evidence lookup failed:', existingError);
      return false;
    }

    if (!existing) {
      const { error: insertError } = await admin.from('account_events').insert({
        account_id: input.accountId,
        kind: AI_VOICE_ROUTE_VERIFIED_EVENT,
        summary: 'AI Voice customer-facing route verified',
        actor_email: null,
        meta: {
          ...evidence,
          provider_call_id: input.providerCallId,
        },
      });
      if (insertError) {
        console.error('AI voice route evidence insert failed:', insertError);
        return false;
      }
    }

    // Keep the older generic status useful to the missed-call setup card. The
    // route-specific event above remains the activation boundary.
    const { error: stampError } = await admin
      .from('accounts')
      .update({ call_tracking_verified_at: new Date().toISOString() })
      .eq('id', input.accountId)
      .eq('call_tracking_number', ready.number)
      .is('call_tracking_verified_at', null);
    if (stampError) console.error('AI voice generic route stamp failed:', stampError);
    return true;
  } catch (error) {
    console.error('AI voice route evidence write threw:', error);
    return false;
  }
}
