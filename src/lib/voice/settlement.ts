import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { billableVoiceMinutes, settleVoiceCall } from '@/lib/billing/voice-minute-usage';
import { settleUsageOverage } from '@/lib/billing/usage-overage';
import { createLead } from '@/lib/leads';
import { normalizeUsPhone } from '@/lib/phone';
import type { VoiceReceipt } from '@/lib/voice/provider';
import { detectCallEmergency, notifyEmergencyCall } from '@/lib/voice/triage';
import { triggerVoicePostCallFollowup } from '@/lib/voice/post-call-sms';

const MICROS_PER_SECOND = 1_000_000;

/**
 * Turning a receipt into a bill and a lead, in that order of certainty.
 *
 * TWO THINGS HAPPEN HERE AND THEY DO NOT SHARE AN IDEMPOTENCY KEY. Settling the
 * ledger is arithmetic on a hold LGQ already took; creating the lead is the
 * reason the contractor bought the product. The ledger finalization key makes a
 * replay safe, and source_voice_event_id makes the lead insert-or-return safe.
 * A lead failure therefore MUST throw to the durable receipt processor: marking
 * the event complete would permanently lose the caller inquiry. A settlement
 * refusal still returns a reconciliation state after attempting the lead.
 *
 * THE RECEIPT IS NOT AUTHORITY. It arrives unsigned. Everything billed here is
 * bounded by a hold LGQ took at admission — `commit_usage_reservation_partial`
 * never commits more than was reserved — so the worst a fabricated receipt can
 * do to a workspace that really placed a call is settle it for a different
 * number of minutes it already had held. A receipt for a call nobody admitted
 * never reaches this function at all; the inbox marks it `ignored`.
 */

export type VoiceSettlement = Readonly<{
  /** Minutes committed, or null when nothing could be settled. */
  minutes: number | null;
  billed: boolean;
  leadId: string | null;
  /** Set when the receipt could not support a bill and needs a human. */
  reconcile: 'no_admission' | 'unbillable_receipt' | 'settlement_failed' | null;
}>;

type AdmissionRow = {
  account_id: string;
  reservation_id: string | null;
  reserved_minutes: number | null;
  /** Set only when the call was admitted on overage rather than on allowance. */
  overage_key: string | null;
};

function summaryLine(receipt: VoiceReceipt): string {
  const summary = receipt.summary?.trim();
  if (summary) return summary;
  return 'The AI receptionist answered this call. No summary was returned.';
}

/**
 * A caller id that is a real phone number, or null.
 *
 * The measured payload's `caller_id_number` was a SIP URI, not a phone number,
 * because the test call came from a browser. A lead whose phone field holds
 * `sip:...@example.call.signalwire.com` is worse than one with no phone at all:
 * it looks callable and is not.
 */
function callerPhone(receipt: VoiceReceipt): string | null {
  const raw = receipt.callerNumber?.trim();
  if (!raw || raw.toLowerCase().startsWith('sip:')) return null;
  return normalizeUsPhone(raw) || null;
}

export async function settleVoiceReceipt(
  admin: SupabaseClient,
  receipt: VoiceReceipt,
  options: Readonly<{ voiceEventId?: string }> = {},
): Promise<VoiceSettlement> {
  const { data: admission, error: admissionError } = await admin
    .from('voice_call_admissions')
    .select('account_id, reservation_id, reserved_minutes, overage_key')
    .eq('provider', receipt.provider)
    .eq('provider_call_id', receipt.providerCallId)
    .maybeSingle();

  // `data: null` is proof of absence only when the database answered
  // successfully. Treating a PostgREST outage as "no admission" makes the
  // durable receipt processor terminal-fail a real call, lose its lead, and
  // eventually release its usage hold. Throw so the claimed receipt follows
  // the bounded retry path instead.
  if (admissionError) {
    const code = typeof admissionError.code === 'string'
      ? admissionError.code : 'unknown';
    throw new Error(`Voice admission lookup failed (${code}).`);
  }

  const row = (admission ?? null) as AdmissionRow | null;
  if (!row) {
    return Object.freeze({
      minutes: null, billed: false, leadId: null, reconcile: 'no_admission' as const,
    });
  }

  const minutes = billableVoiceMinutes({
    ai_start_date: receipt.aiStartMicros,
    ai_end_date: receipt.aiEndMicros,
  });

  let settled: number | null = null;
  let reconcile: VoiceSettlement['reconcile'] = null;

  if (minutes === null) {
    // Null is not zero. A receipt that cannot support a bill is left for a human
    // rather than written off as a free call; the hold expires on its own.
    reconcile = 'unbillable_receipt';
  } else if (row.reservation_id) {
    settled = await settleVoiceCall(admin, {
      reservationId: row.reservation_id,
      finalizationKey: `ai-voice:v1:${receipt.providerCallId}:settle`,
      accountId: row.account_id,
      providerCallId: receipt.providerCallId,
      reservedMinutes: row.reserved_minutes ?? 0,
      ownsReservation: true,
    }, minutes);
    if (settled === null) reconcile = 'settlement_failed';
  } else if (row.overage_key) {
    // ADMITTED ON OVERAGE. The full 60-minute safety cap was charged the moment
    // the call was answered, because nobody can know its length in advance. Now
    // the receipt says what it actually was, so the charge comes down to it.
    // Without this a twenty-second wrong number costs $21 for ever.
    const committedMinutes = Math.min(minutes, row.reserved_minutes ?? minutes);
    const outcome = await settleUsageOverage(admin, {
      accountId: row.account_id,
      idempotencyKey: row.overage_key,
      units: committedMinutes,
    });
    // The receipt is not billing authority. If it reports more AI time than
    // the admission reserved, both the ledger and contractor-facing history
    // must show the bounded amount that was actually settled.
    if (outcome.settled) settled = committedMinutes;
    else reconcile = 'settlement_failed';
  }
  // Neither a reservation nor an overage key means the call was admitted
  // unmetered, on purpose. There is nothing to settle and nothing wrong; the
  // receipt is still the evidence that makes it reconcilable later.

  // The lead is why the contractor bought this. It is attempted whatever
  // happened above. Its event-scoped insert is idempotent, so a transient error
  // must escape and make the whole receipt retry instead of completing without
  // the customer inquiry.
  let leadId: string | null = null;
  try {
    const structured = receipt.structuredPostPrompt;
    const phone = (structured?.caller_phone && typeof structured.caller_phone === 'string' && structured.caller_phone.trim())
      ? structured.caller_phone.trim()
      : callerPhone(receipt);

    const summary = summaryLine(receipt);
    const emergency = detectCallEmergency(summary);
    const isEmergency = structured?.is_emergency === true || structured?.urgency === 'emergency' || emergency.isEmergency;
    const hazardType = (typeof structured?.hazard_type === 'string' && structured.hazard_type) || emergency.hazardType;
    const flags = isEmergency ? ['emergency_hazard', hazardType].filter(Boolean) as string[] : [];
    const score = isEmergency ? 'hot' : 'warm';

    const callerName = (typeof structured?.caller_name === 'string' && structured.caller_name.trim())
      ? structured.caller_name.trim()
      : (phone ? `AI call — ${phone}` : 'AI call — caller unknown');

    const serviceAddress = (typeof structured?.service_address === 'string' && structured.service_address.trim())
      ? structured.service_address.trim()
      : null;

    const projectType = (typeof structured?.work_requested === 'string' && structured.work_requested.trim())
      ? structured.work_requested.trim()
      : 'AI Voice inquiry';

    const requestedSlot = (typeof structured?.requested_slot === 'string' && structured.requested_slot.trim())
      ? structured.requested_slot.trim()
      : undefined;

    const lead = await createLead(admin, row.account_id, {
      source: 'ai_voice',
      name: callerName,
      phone,
      address: serviceAddress,
      projectType,
      message: summary,
      sourcePage: '/call',
      sourceVoiceEventId: options.voiceEventId,
      triage: {
        score,
        flags,
        ...(requestedSlot ? { timeline: requestedSlot } : {}),
        contactPreference: 'any',
      },
    });
    leadId = lead.id;
  } catch (error) {
    console.error('AI voice lead creation failed:', error);
    throw error;
  }

  // The contractor-facing record is written last. Billing must never READ this
  // row, but its transcript is now the only retained copy of what the caller
  // said. A write failure must therefore escape to the durable receipt worker;
  // settlement, lead creation, and this upsert all have stable replay keys.
  await recordCallHistory(admin, receipt, {
    accountId: row.account_id,
    minutes: settled,
    // UNMETERED MEANS NOBODY WAS CHARGED. An overage call also holds no
    // reservation, so testing reservation_id alone called it unmetered and told
    // a contractor who had just paid the overage rate that the call was "not
    // billed" -- and left its minutes out of the billed total.
    // `!= null`, not `!== null`: a row selected before this column existed --
    // or by any caller that does not ask for it -- yields undefined, and
    // `undefined !== null` is true, which would mark every reservation-backed
    // call an overage. The existing tests caught exactly that.
    unmetered: row.reservation_id === null && row.overage_key == null,
    overage: row.overage_key != null,
    unbillable: minutes === null,
    leadId,
    voiceEventId: options.voiceEventId ?? null,
  });

  return Object.freeze({
    minutes: settled,
    billed: settled !== null && settled > 0,
    leadId,
    reconcile,
  });
}

function instant(micros: number | null): string | null {
  if (micros === null) return null;
  const ms = Math.round(micros / 1000);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export type VoiceCallProviderOutcome =
  | 'in_progress'
  | 'ai_handled'
  | 'transfer_attempted'
  | 'transferred_and_answered'
  | 'caller_abandoned'
  | 'no_input'
  | 'voicemail_fallback'
  | 'provider_failure'
  | 'completed'
  | 'unknown';

export function inferProviderOutcome(receipt: VoiceReceipt): VoiceCallProviderOutcome {
  const log = receipt.callLog ?? [];
  const hasUserTurns = log.some((turn) => turn.role === 'user' && turn.content.trim().length > 0);
  const hasAssistantTurns = log.some((turn) => turn.role === 'assistant' && turn.content.trim().length > 0);

  const transferMentioned = log.some((turn) =>
    turn.content.toLowerCase().includes('connecting you now')
    || turn.content.toLowerCase().includes('transfer_to_business')
    || turn.content.toLowerCase().includes('transferring you')
  );

  if (transferMentioned) {
    return 'transfer_attempted';
  }

  if (!hasUserTurns) {
    if (hasAssistantTurns) {
      return 'no_input';
    }
    return 'caller_abandoned';
  }

  const seconds = receipt.aiStartMicros !== null && receipt.aiEndMicros !== null
    ? Math.round((receipt.aiEndMicros - receipt.aiStartMicros) / MICROS_PER_SECOND)
    : null;

  if (seconds !== null && seconds < 8 && log.length <= 2) {
    return 'caller_abandoned';
  }

  if (hasUserTurns && hasAssistantTurns) {
    return 'ai_handled';
  }

  return 'completed';
}

export async function recordProvisionalVoiceCall(
  admin: SupabaseClient,
  input: Readonly<{
    accountId: string;
    provider: 'signalwire';
    providerCallId: string;
    callerNumber: string | null;
    startedAt: string;
  }>,
): Promise<string | null> {
  let callId: string | null = null;
  try {
    const res = await admin
      .from('voice_calls')
      .upsert({
        account_id: input.accountId,
        provider: input.provider,
        provider_call_id: input.providerCallId,
        caller_number: input.callerNumber,
        started_at: input.startedAt,
        outcome: 'in_progress',
        outcome_source: 'provisional_admission',
        outcome_observed_at: input.startedAt,
        is_provisional: true,
        settlement: 'unsettled',
      }, { onConflict: 'provider,provider_call_id' })
      .select('id');
    callId = (res?.data as { id?: string }[] | null)?.[0]?.id ?? null;
  } catch {
    callId = null;
  }

  if (callId) {
    try {
      await admin.from('voice_call_workflows').upsert({
        call_id: callId,
        account_id: input.accountId,
        disposition: 'unreviewed',
        urgency: 'normal',
      }, { onConflict: 'call_id' });
    } catch {
      // Non-blocking on provisional initialization failure
    }
    return callId;
  }
  return null;
}

/** Required transcript projection; throws so the durable receipt can retry. */
export async function recordCallHistory(
  admin: SupabaseClient,
  receipt: VoiceReceipt,
  facts: Readonly<{
    accountId: string;
    minutes: number | null;
    unmetered: boolean;
    /** Charged against the workspace's overage cap rather than its allowance. */
    overage: boolean;
    unbillable: boolean;
    leadId: string | null;
    voiceEventId: string | null;
  }>,
): Promise<void> {
  const seconds = receipt.aiStartMicros !== null && receipt.aiEndMicros !== null
    && receipt.aiEndMicros >= receipt.aiStartMicros
    ? Math.round((receipt.aiEndMicros - receipt.aiStartMicros) / MICROS_PER_SECOND)
    : null;

  const settlement = facts.unbillable ? 'unbillable'
    : facts.unmetered ? 'unmetered'
      : facts.minutes === null ? 'unsettled'
        : facts.overage ? 'overage' : 'allowance';

  const outcome = inferProviderOutcome(receipt);
  const nowIso = new Date().toISOString();

  const { error } = await admin.from('voice_calls').upsert({
    account_id: facts.accountId,
    provider: receipt.provider,
    provider_call_id: receipt.providerCallId,
    voice_event_id: facts.voiceEventId,
    caller_number: callerPhone(receipt),
    started_at: instant(receipt.callStartMicros),
    answered_at: instant(receipt.callAnswerMicros),
    ended_at: instant(receipt.callEndMicros),
    ai_seconds: seconds,
    billed_minutes: facts.minutes,
    settlement,
    outcome,
    outcome_source: 'swml_post_prompt',
    outcome_observed_at: nowIso,
    is_provisional: false,
    summary: summaryLine(receipt),
    transcript: receipt.callLog,
    lead_id: facts.leadId,
  }, { onConflict: 'provider,provider_call_id' });

  if (error) {
    const code = typeof error.code === 'string' && error.code.trim()
      ? error.code.trim()
      : 'unknown';
    throw new Error(`Voice call history write failed (${code}).`);
  }

  const structured = receipt.structuredPostPrompt;
  const emergency = detectCallEmergency(summaryLine(receipt));
  const isEmergency = structured?.is_emergency === true || structured?.urgency === 'emergency' || emergency.isEmergency;
  const isUrgent = structured?.urgency === 'urgent';
  const urgency = isEmergency ? 'emergency' : isUrgent ? 'urgent' : 'normal';

  const followUp = typeof structured?.follow_up_action === 'string' ? structured.follow_up_action : null;
  const disposition = followUp === 'callback_required' ? 'needs_callback'
    : followUp === 'booked' ? 'converted'
    : 'unreviewed';

  try {
    const { data: callRow } = await admin
      .from('voice_calls')
      .select('id')
      .eq('provider', receipt.provider)
      .eq('provider_call_id', receipt.providerCallId)
      .maybeSingle();

    if (callRow?.id) {
      await admin.from('voice_call_workflows').upsert({
        call_id: callRow.id,
        account_id: facts.accountId,
        disposition,
        urgency,
      }, { onConflict: 'call_id' });

      if (isEmergency) {
        await notifyEmergencyCall(
          admin,
          facts.accountId,
          callerPhone(receipt),
          summaryLine(receipt) || emergency.reason,
          emergency,
          callRow.id,
        );
      }

      const cPhone = callerPhone(receipt);
      if (cPhone && outcome !== 'caller_abandoned') {
        await triggerVoicePostCallFollowup(
          admin,
          facts.accountId,
          callRow.id,
          cPhone,
          {
            callerName: structured?.caller_name,
            issueSummary: structured?.issue_summary || receipt.summary,
          },
        );
      }
    }
  } catch {
    // Non-blocking on workflow sync, emergency alert, and follow-up SMS
  }
}
