import { describe, it, expect } from 'vitest';
import {
  generateReferralCode,
  parseReferralCode,
  buildReferralShareText,
  calculateReferralDiscount,
} from '../src/lib/referrals';

describe('Customer Referral Engine', () => {
  it('generates uppercase clean referral promo codes', () => {
    expect(generateReferralCode('Sarah Connor')).toBe('SARAH-50');
    expect(generateReferralCode('John', 'APEX')).toBe('JOHN-APEX');
    expect(generateReferralCode('')).toBe('FRIEND-50');
  });

  it('parses and normalizes referral codes safely', () => {
    expect(parseReferralCode(' sarah-50 ')).toBe('SARAH-50');
    expect(parseReferralCode('Apex-100!')).toBe('APEX-100');
    expect(parseReferralCode('')).toBeNull();
    expect(parseReferralCode(null)).toBeNull();
    expect(parseReferralCode('a')).toBeNull(); // too short
  });

  it('builds clear, personalized SMS/Email share copy', () => {
    const text = buildReferralShareText({
      referrerName: 'Sarah',
      businessName: 'Apex Plumbing',
      discountAmount: 50,
      shareUrl: 'https://apex.com/r/SARAH-50',
    });

    expect(text).toContain('Sarah used Apex Plumbing');
    expect(text).toContain('$50 off');
    expect(text).toContain('https://apex.com/r/SARAH-50');
  });

  it('applies referral discount to qualifying job totals', () => {
    // $450 quote meets $200 min spend -> $50 discount applied, $400 new total
    const result = calculateReferralDiscount(450);
    expect(result.applied).toBe(true);
    expect(result.discountAmount).toBe(50);
    expect(result.newTotal).toBe(400);

    // Below min spend ($150 < $200) -> not applied
    const belowMin = calculateReferralDiscount(150);
    expect(belowMin.applied).toBe(false);
    expect(belowMin.discountAmount).toBe(0);
    expect(belowMin.newTotal).toBe(150);
    expect(belowMin.reason).toContain('Minimum job size');
  });
});
