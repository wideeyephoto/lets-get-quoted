/**
 * Quote Expiration & Price Lock Urgency.
 *
 * Contractors provide price locks against supplier cost fluctuations (copper, lumber, shingles).
 * Rendering price lock guarantees with clear expiration timelines creates genuine urgency
 * and significantly boosts quote approval rates within the first 7-14 days.
 */

export type QuotePriceLock = {
  createdAt: string;
  expiresAt: string;
  daysRemaining: number;
  isExpired: boolean;
  isUrgent: boolean;
  badgeText: string;
  formattedExpiresDate: string;
};

export const DEFAULT_PRICE_LOCK_DAYS = 14;

export function calculateQuotePriceLock(
  createdAtInput: string | Date,
  validDays = DEFAULT_PRICE_LOCK_DAYS,
  now: Date = new Date()
): QuotePriceLock {
  const createdDate = typeof createdAtInput === 'string' ? new Date(createdAtInput) : createdAtInput;
  const createdTime = createdDate.getTime();

  // If invalid date, return a safe fallback
  if (isNaN(createdTime)) {
    const fallbackExpires = new Date(now.getTime() + validDays * 86_400_000);
    return {
      createdAt: now.toISOString(),
      expiresAt: fallbackExpires.toISOString(),
      daysRemaining: validDays,
      isExpired: false,
      isUrgent: false,
      badgeText: `🔒 Material & labor pricing guaranteed for ${validDays} days`,
      formattedExpiresDate: formatMonthDayYear(fallbackExpires),
    };
  }

  const expiresTime = createdTime + validDays * 86_400_000;
  const expiresDate = new Date(expiresTime);
  const diffMs = expiresTime - now.getTime();
  const daysRemaining = Math.ceil(diffMs / 86_400_000);

  const isExpired = daysRemaining <= 0;
  const isUrgent = !isExpired && daysRemaining <= 3;
  const formattedExpiresDate = formatMonthDayYear(expiresDate);

  let badgeText = '';
  if (isExpired) {
    badgeText = `⚠️ Quote price lock expired on ${formattedExpiresDate}`;
  } else if (daysRemaining === 1) {
    badgeText = '⏳ Price lock expires tomorrow';
  } else if (isUrgent) {
    badgeText = `⏳ Price lock expires in ${daysRemaining} days (${formattedExpiresDate})`;
  } else {
    badgeText = `🔒 Material & labor pricing locked until ${formattedExpiresDate} (${daysRemaining} days left)`;
  }

  return {
    createdAt: createdDate.toISOString(),
    expiresAt: expiresDate.toISOString(),
    daysRemaining: Math.max(0, daysRemaining),
    isExpired,
    isUrgent,
    badgeText,
    formattedExpiresDate,
  };
}

function formatMonthDayYear(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
