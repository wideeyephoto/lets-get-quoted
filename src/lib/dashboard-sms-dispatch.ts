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

/**
 * Formats a 10DLC-compliant transactional text containing the Client Dashboard link.
 */
export function formatClientDashboardSmsText(params: {
  businessName: string;
  clientName: string;
  clientDashboardUrl: string;
  nextActionPrompt?: string;
}): string {
  const firstName = params.clientName.trim().split(/\s+/)[0] || 'there';
  const nextNote = params.nextActionPrompt ? ` (${params.nextActionPrompt})` : '';
  return `${params.businessName}: Hi ${firstName}, here is your project portal and next steps${nextNote}: ${params.clientDashboardUrl} Reply STOP to opt out.`;
}

/**
 * Formats a private text sent from a dedicated 2-way number.
 */
export function formatPrivateSmsText(params: {
  businessName: string;
  body: string;
}): string {
  const text = params.body.trim();
  if (text.toLowerCase().includes(params.businessName.toLowerCase())) {
    return text;
  }
  return `${params.businessName}: ${text}`;
}
