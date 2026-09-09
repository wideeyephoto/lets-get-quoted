import { createAdminClient } from '@/lib/auth';
import { loadDedicatedMessagingReadiness } from '@/lib/messaging-number-provisioning';
import { getSharedFieldPhoneNumber } from '@/lib/sms';

export type MessagingCapability = {
  hasDedicatedNumber: boolean;
  dedicatedNumber: string | null;
  sharedNumber: string | null;
  status: 'ready' | 'shared_only';
};

/**
 * Checks whether an account has an active 2-way dedicated number or uses the shared line.
 */
export async function getMessagingCapability(
  accountId: string,
  admin = createAdminClient(),
): Promise<MessagingCapability> {
  const readiness = await loadDedicatedMessagingReadiness(accountId, admin);
  const sharedNumber = await getSharedFieldPhoneNumber(admin);

  if (readiness.kind === 'ready') {
    return {
      hasDedicatedNumber: true,
      dedicatedNumber: readiness.number,
      sharedNumber,
      status: 'ready',
    };
  }

  return {
    hasDedicatedNumber: false,
    dedicatedNumber: null,
    sharedNumber,
    status: 'shared_only',
  };
}

export { formatClientDashboardSmsText, formatPrivateSmsText } from '@/lib/sms-templates';
