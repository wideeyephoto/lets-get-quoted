import { describe, it, expect } from 'vitest';
import { generateReferralCode, buildReferralShareText } from '../src/lib/referrals';

describe('Portal Referral UI Integration', () => {
  it('generates a branded referral promo code from portal client name', () => {
    const clientName = 'Marcus Aurelius';
    const code = generateReferralCode(clientName);
    expect(code).toBe('MARCUS-50');
  });

  it('builds pre-filled SMS share links for mobile homeowner portals', () => {
    const shareText = buildReferralShareText({
      referrerName: 'Marcus',
      businessName: 'Apex Heating & Cooling',
      discountAmount: 50,
      shareUrl: 'https://apexheating.com?ref=MARCUS-50',
    });

    expect(shareText).toContain('Marcus used Apex Heating & Cooling');
    expect(shareText).toContain('$50 off');
    expect(shareText).toContain('https://apexheating.com?ref=MARCUS-50');

    const encodedSms = encodeURIComponent(shareText);
    expect(encodedSms).toContain('Apex%20Heating%20%26%20Cooling');
  });
});
