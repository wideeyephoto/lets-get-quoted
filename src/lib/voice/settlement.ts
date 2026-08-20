import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { billableVoiceMinutes, settleVoiceCall } from '@/lib/billing/voice-minute-usage';
import { settleUsageOverage } from '@/lib/billing/usage-overage';
import { createLead } from '@/lib/leads';
import { normalizeUsPhone } from '@/lib/phone';
import type { VoiceReceipt } from '@/lib/voice/provider';

const MICROS_PER_SECOND = 1_000_000;

/**
 * Turning a receipt into a bill and a lead, in that order of certainty.
 *
 * TWO THINGS HAPPEN HERE AND THEY MUST NOT SHARE A FATE. Settling the ledger is
 * arithmetic on a hold LGQ already took; creating the lead is the reason the
 * contractor bought the product. If the lead write fails, the minutes were still
 * used and must still settle. If settlement fails, the caller still rang and the
 * contractor still needs to know. So neither is allowed to throw past the other,
 * and the result says separately what happened to each.
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
): Promise<VoiceSettlement> {
  const { data: admission } = await admin
    .from('voice_call_admissions')
    .select('account_id, reservation_id, reserved_minutes, overage_key')
    .eq('provider', receipt.provider)
    .eq('provider_call_id', receipt.providerCallId)
    .maybeSingle();

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
    const outcome = await settleUsageOverage(admin, {
      accountId: row.account_id,
      idempotencyKey: row.overage_key,
      units: Math.min(minutes, row.reserved_minutes ?? minutes),
    });
    if (outcome.settled) settled = minutes;
    else reconcile = 'settlement_failed';
  }
  // Neither a reservation nor an overage key means the call was admitted
  // unmetered, on purpose. There is nothing to settle and nothing wrong; the
  // receipt is still the evidence that makes it reconcilable later.

  // The lead is why the contractor bought this. It is attempted whatever
  // happened above, and its failure is contained here.
  let leadId: string | null = null;
  try {
    const phone = callerPhone(receipt);
    const lead = await createLead(admin, row.account_id, {
      source: 'ai_voice',
      name: phone ? `AI call — ${phone}` : 'AI call — caller unknown',
      phone,
      message: summaryLine(receipt),
      sourcePage: '/call',
      triage: { score: 'warm', flags: [], contactPreference: 'any' },
    });
    leadId = lead.id;
  } catch (error) {
    console.error('AI voice lead creation failed:', error);
  }

  // The contractor-facing record, written last and never allowed to fail the
  // two things above it. Billing must never READ this row -- see the migration
  // header -- so a failure to write it costs a history entry, not a settlement.
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

/** Never throws: a report must not break the thing it reports on. */
async function recordCallHistory(
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
  }>,
): Promise<void> {
  const seconds = receipt.aiStartMicros !== null && receipt.aiEndMicros !== null
    && receipt.aiEndMicros >= receipt.aiStartMicros
    ? Math.round((receipt.aiEndMicros - receipt.aiStartMicros) / MICROS_PER_SECOND)
    : null;

  // `unmetered` is a real outcome, not a failure: the meter fails open when the
  // ledger cannot answer, and such a call must look different from a free one.
  // 'overage' was a legal value in the column, handled by the reader and
  // rendered by the dashboard as "at your overage rate" -- and nothing ever
  // wrote it. Every settled call was recorded as 'allowance', including the
  // ones charged well above it.
  const settlement = facts.unbillable ? 'unbillable'
    : facts.unmetered ? 'unmetered'
      : facts.minutes === null ? 'unsettled'
        : facts.overage ? 'overage' : 'allowance';

  try {
    const { error } = await admin.from('voice_calls').upsert({
      account_id: facts.accountId,
      provider: receipt.provider,
      provider_call_id: receipt.providerCallId,
      caller_number: callerPhone(receipt),
      started_at: instant(receipt.callStartMicros),
      answered_at: instant(receipt.callAnswerMicros),
      ended_at: instant(receipt.callEndMicros),
      ai_seconds: seconds,
      billed_minutes: facts.minutes,
      settlement,
      summary: summaryLine(receipt),
      lead_id: facts.leadId,
    }, { onConflict: 'provider,provider_call_id' });
    if (error) console.error('voice call history write failed:', error);
  } catch (error) {
    console.error('voice call history write threw:', error);
  }
}
