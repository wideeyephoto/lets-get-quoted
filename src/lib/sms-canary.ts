import 'server-only';
import { createAdminClient } from '@/lib/auth';
import {
  sendProviderMessage,
  smsProviderConfig,
  type SmsProviderId,
  SIMULATED_PROVIDER_ID,
} from '@/lib/sms-provider';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface SmsCanaryResult {
  ok: boolean;
  status: 'dispatched' | 'confirmed' | 'failed' | 'skipped' | 'timeout';
  probeId?: string;
  providerMessageId?: string | null;
  latencyMs?: number | null;
  error?: string;
  message?: string;
}

/**
 * Runs a synthetic SMS canary probe to test carrier reachability.
 * Dispatches a lightweight probe SMS and creates a durable record in sms_canary_probes.
 */
export async function runSmsCanaryProbe(
  admin: SupabaseClient = createAdminClient(),
): Promise<SmsCanaryResult> {
  const destination = process.env.LGQ_SMS_CANARY_TO_PHONE;
  if (!destination) {
    // Canary phone unconfigured: fail open with clear explanation
    return {
      ok: true,
      status: 'skipped',
      message: 'LGQ_SMS_CANARY_TO_PHONE is not set. Synthetic carrier canary is dormant.',
    };
  }

  const config = smsProviderConfig();
  if (!config) {
    return {
      ok: false,
      status: 'failed',
      error: 'SMS provider is not configured.',
    };
  }

  // 1. Clean up stale dispatched probes older than 10 minutes as timed out
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await admin
    .from('sms_canary_probes')
    .update({ status: 'timeout', error_message: 'Status callback not received within 10 minutes.' })
    .eq('status', 'dispatched')
    .lt('dispatched_at', tenMinutesAgo);

  const now = new Date().toISOString();
  const provider = config.id as SmsProviderId;

  // 2. Insert the probe record
  const { data: probe, error: insertError } = await admin
    .from('sms_canary_probes')
    .insert({
      phone_number: destination,
      provider: provider,
      status: 'dispatched',
      dispatched_at: now,
    })
    .select('id')
    .single();

  if (insertError || !probe) {
    console.error('Failed to create SMS canary probe record:', insertError);
    return {
      ok: false,
      status: 'failed',
      error: insertError?.message ?? 'Failed to initialize canary probe.',
    };
  }

  // 3. Dispatch the canary message through the provider boundary
  try {
    const fromNumber = config.id === 'signalwire'
      ? process.env.SIGNALWIRE_FROM_NUMBER || '+15555550100'
      : process.env.TWILIO_FROM_NUMBER || '+15555550100';

    const providerMessageId = await sendProviderMessage(
      destination,
      `LGQ Synthetic Canary Probe ${probe.id} [${new Date().toISOString()}]`,
      { accountId: null, category: 'verification' },
      { provider, from: fromNumber, messageKey: `canary:${probe.id}` },
    );

    await admin
      .from('sms_canary_probes')
      .update({
        provider_message_id: providerMessageId,
      })
      .eq('id', probe.id);

    // If simulated provider, immediately confirm since no real webhook will arrive
    if (providerMessageId === SIMULATED_PROVIDER_ID) {
      await admin
        .from('sms_canary_probes')
        .update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          latency_ms: 12,
        })
        .eq('id', probe.id);

      return {
        ok: true,
        status: 'confirmed',
        probeId: probe.id,
        providerMessageId,
        latencyMs: 12,
        message: 'Simulated canary probe dispatched and confirmed.',
      };
    }

    return {
      ok: true,
      status: 'dispatched',
      probeId: probe.id,
      providerMessageId,
      message: 'Canary probe dispatched; awaiting delivery status callback.',
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await admin
      .from('sms_canary_probes')
      .update({
        status: 'failed',
        error_message: errorMsg,
      })
      .eq('id', probe.id);

    return {
      ok: false,
      status: 'failed',
      probeId: probe.id,
      error: errorMsg,
    };
  }
}

/**
 * Confirms a canary probe receipt when a delivery callback arrives.
 */
export async function confirmSmsCanaryCallback(
  admin: SupabaseClient,
  providerMessageId: string,
  deliveryStatus: string,
): Promise<boolean> {
  if (!admin || typeof admin.from !== 'function') return false;
  const table = admin.from('sms_canary_probes');
  if (!table || typeof table.select !== 'function') return false;

  const { data: probe } = await table
    .select('id, dispatched_at, status')
    .eq('provider_message_id', providerMessageId)
    .maybeSingle();

  if (!probe) return false;

  const now = new Date();
  const dispatchedAt = new Date(probe.dispatched_at);
  const latencyMs = Math.max(0, now.getTime() - dispatchedAt.getTime());

  const isDelivered = deliveryStatus === 'delivered' || deliveryStatus === 'sent';
  const newStatus = isDelivered ? 'confirmed' : 'failed';

  await admin
    .from('sms_canary_probes')
    .update({
      status: newStatus,
      confirmed_at: now.toISOString(),
      latency_ms: latencyMs,
      error_message: isDelivered ? null : `Provider reported status: ${deliveryStatus}`,
    })
    .eq('id', probe.id);

  return true;
}
