import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The call list a contractor sees.
 *
 * READ THROUGH THE OWNER'S OWN SESSION CLIENT. `voice_calls` carries a
 * select-only owner policy, so passing the session client makes RLS the second
 * check behind `requireOwnerContext` — and reaching for the service-role client
 * here would quietly remove it, on a table holding transcripts of other people's
 * phone calls.
 *
 * THESE NUMBERS ARE A REPORT, NOT A BILL. `billed_minutes` is what the ledger
 * settled, copied here for display; the ledger remains the only thing an invoice
 * may be computed from (docs/ai-voice-v1-decisions.md §4.1). The distinction
 * matters on this screen more than anywhere else, because this is the screen
 * that makes those numbers look authoritative.
 */

export type VoiceCallSettlement =
  'unsettled' | 'allowance' | 'overage' | 'unmetered' | 'unbillable';

export type VoiceCallOutcome =
  'completed' | 'transferred' | 'voicemail' | 'abandoned' | 'failed';

export type VoiceCallRow = Readonly<{
  id: string;
  providerCallId: string;
  callerNumber: string | null;
  startedAt: string | null;
  aiSeconds: number | null;
  billedMinutes: number | null;
  settlement: VoiceCallSettlement;
  outcome: VoiceCallOutcome;
  summary: string | null;
  leadId: string | null;
}>;

export type VoiceCallHistory = Readonly<{
  /** False means the history read failed; it must not be presented as no calls. */
  available: boolean;
  calls: readonly VoiceCallRow[];
  /** Minutes settled in the window. Excludes calls that were never billed. */
  billedMinutes: number;
  /** Answered but not charged, because the ledger could not be reached. */
  unmeteredCalls: number;
}>;

const DEFAULT_LIMIT = 50;
const DEFAULT_HISTORY_DAYS = 30;

/** The catalog promises 30 or 90 days; malformed input takes the shorter path. */
export function boundedVoiceHistoryDays(value: unknown): number {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed)) {
    return DEFAULT_HISTORY_DAYS;
  }
  return Math.min(90, Math.max(30, parsed));
}

export async function loadVoiceCallHistory(
  supabase: SupabaseClient,
  accountId: string,
  options: Readonly<{ limit?: number; historyDays?: number; now?: Date }> = {},
): Promise<VoiceCallHistory> {
  const limit = Math.min(200, Math.max(1, options.limit ?? DEFAULT_LIMIT));
  const historyDays = boundedVoiceHistoryDays(options.historyDays);
  const now = options.now ?? new Date();
  const retainedAfter = new Date(
    now.getTime() - historyDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  try {

    const { data, error } = await supabase
    .from('voice_calls')
    .select('id, provider_call_id, caller_number, started_at, ai_seconds, billed_minutes, settlement, outcome, summary, lead_id')
    .eq('account_id', accountId)
    // Retention runs daily, so physical deletion can trail the exact boundary
    // by several hours. The read cutoff keeps the owner-visible promise exact.
    .gte('created_at', retainedAfter)
    .order('started_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  // Keep the rest of the dashboard available, but retain the distinction
  // between a verified empty history and a failed read for the panel to render.
    if (error) {
      console.error('voice call history read failed:', error);
      return Object.freeze({ available: false, calls: [], billedMinutes: 0, unmeteredCalls: 0 });
    }

  const calls = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return Object.freeze({
      id: String(r.id),
      providerCallId: String(r.provider_call_id),
      callerNumber: (r.caller_number as string | null) ?? null,
      startedAt: (r.started_at as string | null) ?? null,
      aiSeconds: typeof r.ai_seconds === 'number' ? r.ai_seconds : null,
      billedMinutes: typeof r.billed_minutes === 'number' ? r.billed_minutes : null,
      settlement: (r.settlement as VoiceCallSettlement) ?? 'unsettled',
      outcome: (r.outcome as VoiceCallOutcome) ?? 'completed',
      summary: (r.summary as string | null) ?? null,
      leadId: (r.lead_id as string | null) ?? null,
    });
  });

    return Object.freeze({
      available: true,
      calls,
    // Only `allowance` and `overage` were actually charged. Counting an
    // `unmetered` call here would show a contractor minutes they were never
    // billed for and cannot reconcile against anything.
    billedMinutes: calls.reduce(
      (total, call) =>
        (call.settlement === 'allowance' || call.settlement === 'overage')
          ? total + (call.billedMinutes ?? 0)
          : total,
      0,
    ),
      unmeteredCalls: calls.filter((call) => call.settlement === 'unmetered').length,
    });
  } catch (error) {
    console.error('voice call history read threw:', error);
    return Object.freeze({ available: false, calls: [], billedMinutes: 0, unmeteredCalls: 0 });
  }
}

/**
 * What a contractor is told about how a call was paid for.
 *
 * `unmetered` says so plainly rather than dressing it up. A call answered while
 * the ledger was unreachable is not free and is not billed, and pretending
 * either would make the totals on this screen impossible to reconcile.
 */
export function describeSettlement(
  settlement: VoiceCallSettlement,
  billedMinutes: number | null,
): string {
  const minutes = billedMinutes ?? 0;
  const unit = `${minutes} min`;
  if (settlement === 'allowance') return `${unit} from your plan`;
  if (settlement === 'overage') return `${unit} at your overage rate`;
  if (settlement === 'unmetered') return 'Answered — not billed';
  if (settlement === 'unbillable') return 'Needs review';
  return 'Not settled yet';
}
