import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { normalizeUsPhone } from '@/lib/phone';
import {
  readySignalWireVoiceNumber,
  signalWireVoiceRouteTargets,
  voiceRouteRevision,
  type SignalWireVoiceNumber,
} from '@/lib/voice/number-readiness';
import {
  AI_VOICE_ROUTE_VERIFIED_EVENT,
  matchesCurrentVoiceRouteEvidence,
} from '@/lib/voice/route-readiness';

export type VoiceOperatorHealth = Readonly<{
  activeSettings: number | null;
  verifiedActiveRoutes: number | null;
  receiptsNeedingProcessing: number | null;
  callsNeedingBillingReview: number | null;
  latestCallAt: string | null;
  failures: readonly string[];
}>;

/**
 * A compact, PII-free operator view of the voice runtime.
 *
 * Every query keeps its own unavailable state. Zero is operational evidence;
 * null means the evidence could not be read and must render as an em dash.
 */
export async function loadVoiceOperatorHealth(
  admin: SupabaseClient,
): Promise<VoiceOperatorHealth> {
  const failures: string[] = [];

  const [activeResult, receiptResult, billingResult, latestResult] = await Promise.all([
    admin.from('voice_settings').select('account_id').eq('status', 'active'),
    admin
      .from('voice_events')
      .select('id', { count: 'exact', head: true })
      .in('processing_status', ['received', 'processing', 'failed']),
    admin
      .from('voice_calls')
      .select('id', { count: 'exact', head: true })
      .in('settlement', ['unsettled', 'unmetered', 'unbillable']),
    admin
      .from('voice_calls')
      .select('started_at')
      .not('started_at', 'is', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let activeSettings: number | null = null;
  let verifiedActiveRoutes: number | null = null;
  if (activeResult.error) {
    failures.push('active settings');
    console.error('voice operator active-settings read failed:', activeResult.error);
  } else {
    const accountIds = Array.from(new Set(
      (activeResult.data ?? []).map((row) => String((row as { account_id: unknown }).account_id)),
    )).filter(Boolean);
    activeSettings = accountIds.length;

    if (accountIds.length === 0) {
      verifiedActiveRoutes = 0;
    } else {
      const routes = await admin
        .from('accounts')
        .select('id, call_tracking_number, ai_voice_route_revision')
        .in('id', accountIds);
      if (routes.error) {
        failures.push('active routes');
        console.error('voice operator active-route read failed:', routes.error);
      } else {
        const routeTargets = signalWireVoiceRouteTargets();
        if (!routeTargets) {
          failures.push('active routes');
          console.error('voice operator active-route origin is not safely configured');
        }
        const currentAccounts = new Map<string, { number: string; revision: number }>();
        for (const row of routes.data ?? []) {
          const value = row as {
            id?: unknown;
            call_tracking_number?: unknown;
            ai_voice_route_revision?: unknown;
          };
          const number = normalizeUsPhone(String(value.call_tracking_number ?? ''));
          const revision = voiceRouteRevision(value.ai_voice_route_revision);
          if (value.id && number && revision !== null) {
            currentAccounts.set(String(value.id), { number, revision });
          }
        }

        const inventory = routeTargets ? await admin
          .from('voice_number_inventory')
          .select('id, provider, e164_number, provider_number_id, purpose, account_id, lifecycle_state, voice_capable, call_handler, call_request_url, call_request_method, call_status_callback_url, call_status_callback_method, provider_readiness_state, provider_verified_at, last_provider_sync_at, activated_at, suspended_at, released_at')
          .eq('provider', 'signalwire')
          .eq('purpose', 'ai_voice')
          .in('account_id', accountIds) : null;
        if (inventory?.error) {
          failures.push('active routes');
          console.error('voice operator active-route inventory read failed:', inventory.error);
        } else if (inventory && routeTargets) {
          const readyByAccount = new Map<string, SignalWireVoiceNumber>();
          for (const row of inventory.data ?? []) {
            const value = row as Record<string, unknown>;
            const accountId = String(value.account_id ?? '');
            const current = currentAccounts.get(accountId);
            if (!current) continue;
            const ready = readySignalWireVoiceNumber(value, {
              accountId,
              number: current.number,
              ...routeTargets,
            });
            if (ready) {
              readyByAccount.set(accountId, Object.freeze({
                ...ready,
                routeRevision: current.revision,
              }));
            }
          }

          const evidence = await admin
            .from('account_events')
            .select('account_id, meta')
            .eq('kind', AI_VOICE_ROUTE_VERIFIED_EVENT)
            .in('account_id', accountIds);
          if (evidence.error) {
            failures.push('active routes');
            console.error('voice operator active-route evidence read failed:', evidence.error);
          } else {
            const verified = new Set<string>();
            for (const row of evidence.data ?? []) {
              const value = row as { account_id?: unknown; meta?: unknown };
              const accountId = String(value.account_id ?? '');
              const ready = readyByAccount.get(accountId);
              if (ready && matchesCurrentVoiceRouteEvidence(value.meta, ready)) {
                verified.add(accountId);
              }
            }
            verifiedActiveRoutes = verified.size;
          }
        }
      }
    }
  }

  if (receiptResult.error) {
    failures.push('receipt queue');
    console.error('voice operator receipt-queue read failed:', receiptResult.error);
  }
  if (billingResult.error) {
    failures.push('billing review');
    console.error('voice operator billing-review read failed:', billingResult.error);
  }
  if (latestResult.error) {
    failures.push('latest call');
    console.error('voice operator latest-call read failed:', latestResult.error);
  }

  return Object.freeze({
    activeSettings,
    verifiedActiveRoutes,
    receiptsNeedingProcessing: receiptResult.error ? null : (receiptResult.count ?? 0),
    callsNeedingBillingReview: billingResult.error ? null : (billingResult.count ?? 0),
    latestCallAt: latestResult.error
      ? null
      : ((latestResult.data as { started_at?: string | null } | null)?.started_at ?? null),
    failures: Object.freeze(failures),
  });
}
