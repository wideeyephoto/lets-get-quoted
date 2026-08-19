import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { billableVoiceMinutes, settleVoiceCall } from '@/lib/billing/voice-minute-usage';
import { createLead } from '@/lib/leads';
import { normalizeUsPhone } from '@/lib/phone';
import type { VoiceReceipt } from '@/lib/voice/provider';

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
    .select('account_id, reservation_id, reserved_minutes')
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
  }
  // No reservation id means the call was admitted unmetered, on purpose. There
  // is nothing to settle and nothing wrong; the receipt is still the evidence
  // that makes it reconcilable later.

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

  return Object.freeze({
    minutes: settled,
    billed: settled !== null && settled > 0,
    leadId,
    reconcile,
  });
}
