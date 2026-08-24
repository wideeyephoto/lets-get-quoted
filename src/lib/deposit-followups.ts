// Deposit follow-ups: automated reminders for accepted quotes awaiting deposit payment.
//
// Pure, deterministic, and dependency-free.

export const DEFAULT_DEPOSIT_FOLLOWUP_DAYS: readonly number[] = [1, 3, 7];
export const MAX_DEPOSIT_FOLLOWUPS = 3;
export const DEPOSIT_FOLLOWUP_DAY_CHOICES = [1, 2, 3, 5, 7, 10, 14] as const;

export type DepositFollowupContext = {
  clientName: string | null | undefined;
  businessName: string | null | undefined;
  quoteRef?: string | null | undefined;
  depositAmount: number;
  payUrl: string;
  sequenceIndex: number;
};

export function formatDepositAmount(amount: number): string {
  if (amount == null || isNaN(amount)) return '$0';
  // If amount > 1000 and has no decimal, it might be in dollars or cents. Format as USD.
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function firstNameOnly(name: string | null | undefined): string {
  const clean = (name || '').trim();
  if (!clean) return 'there';
  return clean.split(/\s+/)[0] || 'there';
}

/**
 * Builds friendly, professional SMS reminder messages tailored by sequence position.
 */
export function buildDepositReminderMessage(ctx: DepositFollowupContext): string {
  const name = firstNameOnly(ctx.clientName);
  const business = (ctx.businessName || 'our team').trim();
  const formattedDeposit = formatDepositAmount(ctx.depositAmount);
  const payUrl = ctx.payUrl.trim();

  switch (ctx.sequenceIndex) {
    case 0:
      // Day 1 / First reminder: Gentle confirmation and convenience
      return `Hi ${name}, thank you for approving your quote with ${business}! To secure your scheduled date on our calendar, please complete your deposit of ${formattedDeposit} here: ${payUrl}`;
    case 1:
      // Day 3 / Second reminder: Project scheduling lock
      return `Hi ${name}, just checking in from ${business}. We're holding your project window on our schedule. You can finalize your ${formattedDeposit} deposit with Apple Pay or card here: ${payUrl}`;
    case 2:
    default:
      // Day 7 / Final reminder: Calendar release notice
      return `Hi ${name}, this is ${business}. We need your ${formattedDeposit} deposit to hold your crew's arrival window. If you still want to proceed, please confirm here: ${payUrl} — or let us know if your plans changed!`;
  }
}

/**
 * Evaluates whether a deposit follow-up reminder is due based on the days elapsed since acceptance.
 */
export function isDepositFollowupDue(opts: {
  acceptedAt: string | null | undefined;
  remindersSent: number;
  lastRemindedAt?: string | null | undefined;
  now?: Date;
  scheduledDays?: readonly number[];
}): { due: boolean; nextIndex: number } {
  const { acceptedAt, remindersSent, lastRemindedAt, now = new Date(), scheduledDays = DEFAULT_DEPOSIT_FOLLOWUP_DAYS } = opts;

  if (!acceptedAt) return { due: false, nextIndex: remindersSent };
  if (remindersSent >= scheduledDays.length || remindersSent >= MAX_DEPOSIT_FOLLOWUPS) {
    return { due: false, nextIndex: remindersSent };
  }

  const acceptedDate = new Date(acceptedAt);
  if (isNaN(acceptedDate.getTime())) return { due: false, nextIndex: remindersSent };

  const daysElapsed = Math.floor((now.getTime() - acceptedDate.getTime()) / (1000 * 60 * 60 * 24));
  const targetDay = scheduledDays[remindersSent];

  if (daysElapsed >= targetDay) {
    // If a reminder was already sent today, don't send again
    if (lastRemindedAt) {
      const lastDate = new Date(lastRemindedAt);
      if (!isNaN(lastDate.getTime())) {
        const hoursSinceLast = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLast < 20) {
          return { due: false, nextIndex: remindersSent };
        }
      }
    }
    return { due: true, nextIndex: remindersSent };
  }

  return { due: false, nextIndex: remindersSent };
}
