import type { SmsBillingCategory } from '@/lib/sms-billing-policy';
import { getTcpaCompliantSendTime, resolveRecipientTimeZone } from '@/lib/phone-timezone';

/** Product delivery policy. Exemptions describe message purpose, not billing. */
export const SMS_QUIET_HOURS_POLICY: Readonly<Record<SmsBillingCategory, Readonly<{
  defer: boolean;
  reason: string;
}>>> = Object.freeze({
  customer_message: Object.freeze({ defer: true, reason: 'Customer conversations, reminders, and campaigns wait until recipient daytime.' }),
  payment_message: Object.freeze({ defer: true, reason: 'Customer payment links, confirmations, and card updates follow the same daytime window.' }),
  owner_alert: Object.freeze({ defer: false, reason: 'Operational alerts go to the business owner about their own workspace.' }),
  crew_message: Object.freeze({ defer: false, reason: 'Time-sensitive job coordination goes to participating crew and subcontractors.' }),
  verification: Object.freeze({ defer: false, reason: 'Short-lived verification codes answer an active request from the recipient.' }),
});

export function smsQuietHoursResumeAt(
  category: SmsBillingCategory,
  phoneNumber: string,
  now = new Date(),
): Date | null {
  if (!SMS_QUIET_HOURS_POLICY[category].defer) return null;
  const timeZone = resolveRecipientTimeZone({ phone: phoneNumber });
  const check = getTcpaCompliantSendTime(now, timeZone);
  return check.isDelayed ? check.sendAt : null;
}

export class SmsQuietHoursDeferredError extends Error {
  override readonly name = 'SmsQuietHoursDeferredError';
  constructor(readonly resumeAt: Date) {
    super('SMS is deferred until recipient daytime.');
  }
}
