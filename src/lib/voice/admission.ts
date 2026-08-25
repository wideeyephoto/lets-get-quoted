import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  VOICE_CALL_CAP_MINUTES,
  admitVoiceCall,
  voiceMinuteMode,
} from '@/lib/billing/voice-minute-usage';
import type { VoiceReceiptAuthorization } from '@/lib/voice/auth';
import { isWithinBusinessHours, type BusinessHours } from '@/lib/voice/business-hours';
import { loadVoiceEntitlement } from '@/lib/voice/entitlement';
import { loadSignalWireVoiceNumberReadiness } from '@/lib/voice/number-readiness';
import {
  greetingWithAiDisclosure,
  type InboundCall,
  type VoiceAnswerPlan,
} from '@/lib/voice/provider';
import {
  buildVoicePostPrompt,
  buildVoiceSystemPrompt,
  loadVoiceGroundingContext,
} from '@/lib/voice/grounding';
import { recordProvisionalVoiceCall } from '@/lib/voice/settlement';

/**
 * Deciding what happens to an inbound call, with no HTTP anywhere in it.
 *
 * SEPARATE FROM THE ROUTE ON PURPOSE. This is the only place in AI Voice where a
 * caller is on the line while LGQ makes a decision, and every branch of it needs
 * testing — an exhausted allowance, a workspace at its concurrency limit, a
 * ledger that will not answer, a number nobody recognises. Testing those through
 * a signed webhook request would mean building four signed requests to assert
 * four returns, and the assertions would be about signatures.
 *
 * THE ORDER OF THE CHECKS IS THE DESIGN. Cheapest and most certain first, so a
 * call that was never going to reach the agent never touches the ledger:
 *
 *   1. Is this a workspace at all?      -- one indexed read
 *   2. Is AI Voice switched on for it?  -- flag, then entitlement
 *   3. Is it already at its call limit? -- one counted read
 *   4. Can it pay for another minute?   -- the ledger, and a hold
 *
 * A failure at 1 is `unavailable`; the rest fall through to the contractor's own
 * forwarding or voicemail rule, which is what the pricing FAQ publishes and what
 * a caller should experience as normal.
 */

/** Whether the AI answers at all. Distinct from the two METERING flags: */
/** metering off means "answer, do not bill"; this off means "do not answer". */
export const AI_VOICE_FLAG = 'LGQ_AI_VOICE_ENABLED';

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

export function aiVoiceEnabled(env: ServerEnvironment = process.env): boolean {
  return env[AI_VOICE_FLAG] === '1';
}

const FALLBACK_MESSAGE =
  "Sorry, we can't take your call right now. Please try again later.";

/** Until a workspace can set its own. The fixed disclosure is added below. */
const DEFAULT_GREETING =
  'Thanks for calling. I can take a few details about the work you need and pass them straight to the team.';

/** How long an admission is assumed live without a receipt, for counting. */
const OPEN_CALL_WINDOW_MINUTES = VOICE_CALL_CAP_MINUTES;

export type VoiceSettings = Readonly<{
  status: 'off' | 'active' | 'paused';
  answerMode: 'always' | 'after_hours';
  businessHours: BusinessHours;
  greeting: string | null;
  transferNumber: string | null;
}>;

export type VoiceWorkspace = Readonly<{
  accountId: string;
  /** Exact active SignalWire dedicated number proven by sender inventory. */
  voiceNumber: string;
  callForwardNumber: string | null;
  voiceEntitled: boolean;
  concurrentCallLimit: number;
  timezone: string;
  /** Null when this workspace has never configured the receptionist. */
  settings: VoiceSettings | null;
}>;

function positiveInteger(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : fallback;
}

/**
 * Resolve the workspace from the number that was dialled.
 *
 * Returns null when nothing matches, which is a real case and not an error: a
 * number can be pointed at LGQ before it is attached to a workspace.
 */
export async function resolveVoiceWorkspace(
  admin: SupabaseClient,
  toNumber: string,
): Promise<VoiceWorkspace | null> {
  // Resolve the provider inventory before the workspace. An accounts row is
  // configuration, not proof that LGQ owns an active SignalWire number for it.
  // Shared, suspended, unprovisioned and cross-account numbers all become the
  // same null result, without revealing which of those facts was true.
  const numberReadiness = await loadSignalWireVoiceNumberReadiness(admin, {
    number: toNumber,
  });
  if (numberReadiness.kind !== 'ready') return null;
  const dedicatedNumber = numberReadiness.number;

  const { data: account, error } = await admin
    .from('accounts')
    // NOT selecting a per-workspace greeting. There is no column for one yet,
    // and PostgREST answers an unknown column with 42703 -- which this function
    // turns into null, which sends EVERY caller to the unavailable message. A
    // read written ahead of its column does not degrade; it fails closed for
    // everyone. The greeting lands with the settings screen that edits it.
    .select('id, call_forward_number, timezone')
    .eq('id', dedicatedNumber.accountId)
    .eq('call_tracking_number', dedicatedNumber.number)
    .maybeSingle();

  if (error) {
    console.error('voice workspace lookup failed:', error);
    return null;
  }
  if (!account) return null;

  // Capacity and entitlement are different facts. Every plan carries a launch
  // concurrency number, but only Scale inclusion or an active add-on makes the
  // product usable. Keep the arithmetic in one shared reader so the route and
  // the dashboard cannot disagree.
  const voiceEntitlement = await loadVoiceEntitlement(admin, String(account.id));

  // No row means never configured, which is off. Read separately and
  // defensively for the same reason as the entitlement: an unreadable row must
  // not become a permissive default on the one surface that answers a phone.
  const { data: configured } = await admin
    .from('voice_settings')
    .select('status, answer_mode, business_hours, greeting, transfer_number')
    .eq('account_id', account.id)
    .maybeSingle();

  const row = configured as Record<string, unknown> | null;

  return Object.freeze({
    accountId: String(account.id),
    voiceNumber: dedicatedNumber.number,
    callForwardNumber: (account.call_forward_number as string | null) ?? null,
    voiceEntitled: voiceEntitlement.enabled,
    concurrentCallLimit: positiveInteger(voiceEntitlement.concurrentCalls, 0),
    timezone: (account.timezone as string | null) || 'America/New_York',
    settings: row
      ? Object.freeze({
        status: (row.status as VoiceSettings['status']) ?? 'off',
        answerMode: (row.answer_mode as VoiceSettings['answerMode']) ?? 'after_hours',
        businessHours: (row.business_hours ?? {}) as BusinessHours,
        greeting: (row.greeting as string | null) ?? null,
        transferNumber: (row.transfer_number as string | null) ?? null,
      })
      : null,
  });
}

/**
 * How many AI calls this workspace has running.
 *
 * Counted as admissions inside the cap window with no receipt yet. There is no
 * call-started or call-ended event to maintain a live count from — the provider
 * sends one callback, at the end — so the window IS the liveness signal, and it
 * is the published 60-minute cap because no call may outlive that.
 *
 * Errs toward refusing: an unreadable count returns the limit itself, so an
 * outage sheds AI calls to voicemail rather than admitting an unbounded number
 * that LGQ pays for and cannot bill.
 */
export async function countOpenAiCalls(
  admin: SupabaseClient,
  accountId: string,
  limit: number,
  now: Date = new Date(),
): Promise<number> {
  const since = new Date(now.getTime() - OPEN_CALL_WINDOW_MINUTES * 60_000).toISOString();
  try {
    const { data, error } = await admin
      .from('voice_call_admissions')
      .select('provider_call_id')
      .eq('account_id', accountId)
      .gte('admitted_at', since);

    if (error || !Array.isArray(data)) {
      console.error('open AI call count failed:', error);
      return limit;
    }
    if (data.length === 0) return 0;

    const ids = data.map((row) => String((row as { provider_call_id: string }).provider_call_id));
    const { data: finished, error: finishedError } = await admin
      .from('voice_events')
      .select('provider_call_id')
      .in('provider_call_id', ids);

    if (finishedError || !Array.isArray(finished)) {
      console.error('open AI call settlement lookup failed:', finishedError);
      return limit;
    }

    const settled = new Set(
      finished.map((row) => String((row as { provider_call_id: string }).provider_call_id)),
    );
    return ids.filter((id) => !settled.has(id)).length;
  } catch (error) {
    console.error('open AI call count threw:', error);
    return limit;
  }
}

export type VoiceCallPlan = Readonly<{
  plan: VoiceAnswerPlan;
  accountId: string | null;
  /** Why the AI did not answer, when it did not. For the failure log. */
  declineReason:
  | 'no_workspace' | 'product_off' | 'not_configured' | 'paused' | 'within_business_hours'
  | 'no_entitlement' | 'receipt_auth_unavailable' | 'no_seat' | 'at_capacity'
  | 'no_allowance' | 'number_not_ready' | 'admission_unavailable' | null;
}>;

export type PlanInboundOptions = Readonly<{
  receiptUrl: string;
  receiptAuthorization: VoiceReceiptAuthorization | null;
  forwardActionUrl: (accountId: string) => string;
  swaigUrl?: (accountId: string) => string;
  enabled?: boolean;
  now?: () => Date;
}>;

/**
 * Decide what a caller gets. Never throws: a caller is on the line.
 */
export async function planInboundCall(
  admin: SupabaseClient,
  call: InboundCall,
  options: PlanInboundOptions,
): Promise<VoiceCallPlan> {
  const fallback = (
    workspace: VoiceWorkspace | null,
    reason: VoiceCallPlan['declineReason'],
  ): VoiceCallPlan => {
    // The contractor's own rule, not an error message. A number keeps being a
    // phone number even when the product on top of it is off.
    if (workspace?.callForwardNumber) {
      return Object.freeze({
        accountId: workspace.accountId,
        declineReason: reason,
        plan: Object.freeze({
          kind: 'forward' as const,
          number: workspace.callForwardNumber,
          callerId: workspace.voiceNumber,
          timeoutSeconds: 20,
          actionUrl: options.forwardActionUrl(workspace.accountId),
        }),
      });
    }
    return Object.freeze({
      accountId: workspace?.accountId ?? null,
      declineReason: reason,
      plan: Object.freeze({ kind: 'unavailable' as const, message: FALLBACK_MESSAGE }),
    });
  };

  const workspace = await resolveVoiceWorkspace(admin, call.toNumber);
  if (!workspace) return fallback(null, 'no_workspace');

  if (!(options.enabled ?? aiVoiceEnabled())) return fallback(workspace, 'product_off');

  if (!workspace.voiceEntitled) return fallback(workspace, 'no_entitlement');

  // The receipt is the only evidence that can settle the call. Starting an AI
  // session without its dedicated callback credential would produce a paid,
  // un-attributable call, so fail to the contractor's normal line before the
  // ledger is touched.
  if (!options.receiptAuthorization) return fallback(workspace, 'receipt_auth_unavailable');

  const settings = workspace.settings;
  if (!settings || settings.status === 'off') return fallback(workspace, 'not_configured');
  if (settings.status === 'paused') return fallback(workspace, 'paused');

  // The common configuration: the contractor takes their own calls during the
  // day and wants the evenings covered. Answering during business hours would
  // put the AI in front of customers who expected a person.
  if (settings.answerMode === 'after_hours'
    && isWithinBusinessHours(settings.businessHours, workspace.timezone, (options.now ?? (() => new Date()))())) {
    return fallback(workspace, 'within_business_hours');
  }

  if (workspace.concurrentCallLimit < 1) return fallback(workspace, 'no_seat');

  const open = await countOpenAiCalls(
    admin, workspace.accountId, workspace.concurrentCallLimit,
    (options.now ?? (() => new Date()))(),
  );
  if (open >= workspace.concurrentCallLimit) return fallback(workspace, 'at_capacity');

  const decision = await admitVoiceCall(admin, {
    accountId: workspace.accountId,
    providerCallId: call.providerCallId,
    dialedNumber: workspace.voiceNumber,
  }, {
    mode: voiceMinuteMode(),
    concurrencyLimit: workspace.concurrentCallLimit,
  });

  if (decision.outcome === 'refused') return fallback(workspace, decision.reason);

  await recordProvisionalVoiceCall(admin, {
    accountId: workspace.accountId,
    provider: 'signalwire',
    providerCallId: call.providerCallId,
    callerNumber: call.fromNumber,
    startedAt: (options.now ?? (() => new Date()))().toISOString(),
  }).catch(() => null);

  const grounding = await loadVoiceGroundingContext(admin, workspace.accountId).catch(() => null);
  const systemPrompt = grounding ? buildVoiceSystemPrompt(grounding) : undefined;
  const postPrompt = grounding ? buildVoicePostPrompt() : undefined;

  return Object.freeze({
    accountId: workspace.accountId,
    declineReason: null,
    plan: Object.freeze({
      kind: 'ai_agent' as const,
      receiptUrl: options.receiptUrl,
      receiptAuthorization: options.receiptAuthorization,
      greeting: greetingWithAiDisclosure(settings.greeting?.trim() || DEFAULT_GREETING),
      systemPrompt,
      postPrompt,
      capMinutes: VOICE_CALL_CAP_MINUTES,
      // The configured hand-off, falling back to the line the contractor
      // already forwards to. Null is a valid setup, not a broken one.
      transferTo: settings.transferNumber || workspace.callForwardNumber,
      swaigUrl: options.swaigUrl ? options.swaigUrl(workspace.accountId) : undefined,
    }),
  });
}
