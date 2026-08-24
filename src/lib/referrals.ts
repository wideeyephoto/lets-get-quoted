// Customer referral & word-of-mouth reward engine.
//
// Pure, deterministic, and dependency-free.
// Allows contractors to turn satisfied homeowners into active referrers
// with shareable promo codes and automatic quote discounts.

export const DEFAULT_REFERRAL_DISCOUNT = 50; // $50 off for the referred friend
export const DEFAULT_REFERRER_REWARD = 50;   // $50 credit for the referring customer
export const DEFAULT_REFERRAL_MIN_SPEND = 200; // Minimum job size to qualify

export type ReferralProgramConfig = {
  discountAmount: number;
  rewardAmount: number;
  minSpend: number;
};

export const DEFAULT_REFERRAL_CONFIG: ReferralProgramConfig = {
  discountAmount: DEFAULT_REFERRAL_DISCOUNT,
  rewardAmount: DEFAULT_REFERRER_REWARD,
  minSpend: DEFAULT_REFERRAL_MIN_SPEND,
};

/**
 * Generates an uppercase, human-friendly referral promo code: e.g. "SARAH-50" or "JOHN-APEX".
 */
export function generateReferralCode(clientName: string, suffix = '50'): string {
  const first = (clientName || 'FRIEND').trim().split(/\s+/)[0] || 'FRIEND';
  const cleanFirst = first
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10) || 'FRIEND';
  const cleanSuffix = (suffix || '50').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || '50';
  return `${cleanFirst}-${cleanSuffix}`;
}

/**
 * Sanitizes and extracts a referral code from user input.
 */
export function parseReferralCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const clean = raw.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (clean.length < 3 || clean.length > 24) return null;
  return clean;
}

/**
 * Builds friendly SMS/Email share copy that homeowners can forward to neighbors or family.
 */
export function buildReferralShareText(opts: {
  referrerName: string;
  businessName: string;
  discountAmount?: number;
  shareUrl: string;
}): string {
  const name = (opts.referrerName || 'I').trim();
  const business = (opts.businessName || 'our contractor').trim();
  const discount = opts.discountAmount ?? DEFAULT_REFERRAL_DISCOUNT;
  const url = opts.shareUrl.trim();

  return `Hey! ${name} used ${business} and wanted to pass along $${discount} off your first service. You can request a quote or book online here: ${url}`;
}

/**
 * Applies a referral discount to an estimate or quote.
 */
export function calculateReferralDiscount(
  quoteTotal: number,
  config: Partial<ReferralProgramConfig> = {},
): { applied: boolean; discountAmount: number; newTotal: number; reason?: string } {
  const fullConfig = { ...DEFAULT_REFERRAL_CONFIG, ...config };

  if (typeof quoteTotal !== 'number' || isNaN(quoteTotal) || quoteTotal <= 0) {
    return { applied: false, discountAmount: 0, newTotal: 0, reason: 'Invalid total' };
  }

  if (quoteTotal < fullConfig.minSpend) {
    return {
      applied: false,
      discountAmount: 0,
      newTotal: quoteTotal,
      reason: `Minimum job size of $${fullConfig.minSpend} required for referral credit`,
    };
  }

  const discount = Math.min(quoteTotal, fullConfig.discountAmount);
  const newTotal = Math.round((quoteTotal - discount) * 100) / 100;

  return {
    applied: true,
    discountAmount: discount,
    newTotal,
  };
}
