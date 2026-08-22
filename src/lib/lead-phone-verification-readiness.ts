import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { isLeadVerificationConfigured } from '@/lib/lead-verification';
import { loadDedicatedMessagingReadiness } from '@/lib/messaging-number-provisioning';
import { outboundSmsSuppression, smsProviderConfig, type SmsProviderId } from '@/lib/sms-provider';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LeadPhoneVerificationReadiness =
  | Readonly<{ kind: 'ready'; provider: SmsProviderId; senderId: string }>
  | Readonly<{
    kind: 'unavailable';
    reason:
      | 'verification_secret_missing'
      | 'provider_unavailable'
      | 'delivery_worker_disabled'
      | 'contractor_lane_disabled'
      | 'outbound_suppressed'
      | 'outside_canary'
      | 'dedicated_sender_unavailable';
  }>;

function canaryAccounts(): ReadonlySet<string> {
  return new Set((process.env.LGQ_SMS_CANARY_ACCOUNT_IDS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => UUID.test(value)));
}

/**
 * One readiness decision shared by code issuance and lead submission.
 *
 * A queued verification code has a ten-minute token lifetime. Issuing it while
 * the worker/lane/canary is dark would strand the homeowner, while accepting a
 * later lead as though verification had run would misstate the evidence.
 */
export async function loadLeadPhoneVerificationReadiness(
  accountId: string,
  admin: SupabaseClient,
): Promise<LeadPhoneVerificationReadiness> {
  if (!isLeadVerificationConfigured()) {
    return Object.freeze({ kind: 'unavailable', reason: 'verification_secret_missing' });
  }
  const provider = smsProviderConfig();
  if (!provider) return Object.freeze({ kind: 'unavailable', reason: 'provider_unavailable' });
  if (process.env.LGQ_SMS_DELIVERY_WORKER_ENABLED !== '1') {
    return Object.freeze({ kind: 'unavailable', reason: 'delivery_worker_disabled' });
  }
  if (process.env.LGQ_SMS_CONTRACTOR_MESSAGING_ENABLED !== '1') {
    return Object.freeze({ kind: 'unavailable', reason: 'contractor_lane_disabled' });
  }
  if (outboundSmsSuppression()) {
    return Object.freeze({ kind: 'unavailable', reason: 'outbound_suppressed' });
  }
  const canaries = canaryAccounts();
  if (canaries.size > 0 && !canaries.has(accountId.toLowerCase())) {
    return Object.freeze({ kind: 'unavailable', reason: 'outside_canary' });
  }
  const sender = await loadDedicatedMessagingReadiness(accountId, admin);
  if (sender.kind !== 'ready' || sender.provider !== provider.id) {
    return Object.freeze({ kind: 'unavailable', reason: 'dedicated_sender_unavailable' });
  }
  return Object.freeze({ kind: 'ready', provider: provider.id, senderId: sender.senderId });
}
