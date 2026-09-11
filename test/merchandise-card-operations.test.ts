import { describe, it, expect } from 'vitest';
import {
  dollarsToCents,
  centsToDollars,
  generateDestinationFingerprint,
  computeApprovalHash,
  calculateCardQuoteCents,
  isQuoteExpired,
  validateQuoteIntegrity,
  generateOperationKey,
  createFulfillmentLease,
} from '@/lib/merchandise/card-operations';
import type { ShippingAddress } from '@/lib/merchandise/types';

describe('Batch B: Data Model & Operation Contracts', () => {
  const sampleAddress1: ShippingAddress = {
    fullName: 'Bob Builder',
    companyName: 'Apex Pro Roofing',
    streetAddress: '742 Evergreen Terrace',
    apartmentSuite: 'Suite B',
    city: 'Springfield',
    state: 'OR',
    postalCode: '97477',
    country: 'US',
    phone: '(541) 555-0133',
    email: 'bob@apexroofing.com',
  };

  const sampleAddress2: ShippingAddress = {
    ...sampleAddress1,
    city: 'Eugene', // Changed city
  };

  describe('Integer Cents Math & Currency Precision', () => {
    it('converts dollars to integer cents accurately', () => {
      expect(dollarsToCents(35.0)).toBe(3500);
      expect(dollarsToCents(24.99)).toBe(2499);
      expect(dollarsToCents(0.35)).toBe(35);
      expect(dollarsToCents(129.0)).toBe(12900);
    });

    it('converts integer cents back to dollars accurately', () => {
      expect(centsToDollars(3500)).toBe(35.0);
      expect(centsToDollars(2499)).toBe(24.99);
      expect(centsToDollars(35)).toBe(0.35);
      expect(centsToDollars(12900)).toBe(129.0);
    });
  });

  describe('Destination Fingerprinting & Tamper Protection', () => {
    it('generates deterministic SHA-256 fingerprint from shipping address', () => {
      const fp1 = generateDestinationFingerprint(sampleAddress1);
      const fp2 = generateDestinationFingerprint(sampleAddress1);
      expect(fp1).toBe(fp2);
      expect(fp1).toHaveLength(64);
    });

    it('normalizes case, whitespace, and postal code formatting', () => {
      const variantAddress: ShippingAddress = {
        fullName: '  bob builder  ',
        streetAddress: '742 evergreen terrace',
        apartmentSuite: 'suite b',
        city: 'SPRINGFIELD',
        state: 'or',
        postalCode: '97477-1234', // Zip+4 normalized to 5-digit
        country: 'us',
        phone: '5415550133',
        email: 'bob@apexroofing.com',
      };

      const fpOriginal = generateDestinationFingerprint(sampleAddress1);
      const fpVariant = generateDestinationFingerprint(variantAddress);
      expect(fpOriginal).toBe(fpVariant);
    });

    it('detects changes in address and yields distinct fingerprint', () => {
      const fp1 = generateDestinationFingerprint(sampleAddress1);
      const fp2 = generateDestinationFingerprint(sampleAddress2);
      expect(fp1).not.toBe(fp2);
    });
  });

  describe('Server Quoting Engine (calculateCardQuoteCents)', () => {
    it('generates an authoritative quote for 100 business cards', () => {
      const res = calculateCardQuoteCents({
        accountId: 'acc_test_123',
        proofId: 'proof_xyz_1',
        cardCount: 100,
        shippingAddress: sampleAddress1,
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const q = res.quote;
      expect(q.cardCount).toBe(100);
      expect(q.subtotalCents).toBe(3500); // $35.00
      expect(q.shippingCostCents).toBe(1200); // $12.00
      expect(q.totalCents).toBe(4700); // $47.00
      expect(q.wholesaleCostCents).toBe(1831); // $18.31 Printful 100-pack base
      expect(q.platformFeeCents).toBe(3500 - 1831); // $16.69 contribution

      // Margin guardrails: at least $10 contribution and at least 30% margin
      expect(q.platformFeeCents).toBeGreaterThanOrEqual(1000); // >= $10.00
      expect(q.platformFeeCents / q.subtotalCents).toBeGreaterThanOrEqual(0.3); // >= 30%

      expect(q.packPlan.totalPacks).toBe(1);
      expect(q.destinationFingerprint).toBe(generateDestinationFingerprint(sampleAddress1));
      expect(isQuoteExpired(q)).toBe(false);
    });

    it('generates quote for 250 business cards with decomposed pack plan', () => {
      const res = calculateCardQuoteCents({
        accountId: 'acc_test_123',
        cardCount: 250,
        shippingAddress: sampleAddress1,
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const q = res.quote;
      expect(q.cardCount).toBe(250);
      expect(q.subtotalCents).toBe(6900); // $69.00
      // 2 packs of 100 ($18.31 ea) + 1 pack of 50 ($10.00) = $36.62 + $10.00 = $46.62
      expect(q.wholesaleCostCents).toBe(1831 * 2 + 1000);
      expect(q.platformFeeCents).toBe(6900 - 4662); // $22.38
      expect(q.platformFeeCents).toBeGreaterThanOrEqual(1000);
      expect(q.packPlan.totalPacks).toBe(3);
    });

    it('rejects unsupported card counts', () => {
      const res = calculateCardQuoteCents({
        accountId: 'acc_test_123',
        cardCount: 75,
        shippingAddress: sampleAddress1,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain('Supported quantities are 50, 100, 250, and 500 cards');
      }
    });
  });

  describe('Quote Expiration & Address Validation (validateQuoteIntegrity)', () => {
    it('validates quote when address matches and quote is within TTL', () => {
      const res = calculateCardQuoteCents({
        accountId: 'acc_test_123',
        cardCount: 100,
        shippingAddress: sampleAddress1,
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const validation = validateQuoteIntegrity(res.quote, sampleAddress1);
      expect(validation.valid).toBe(true);
      expect(validation.reason).toBeUndefined();
    });

    it('invalidates quote when shipping address changes', () => {
      const res = calculateCardQuoteCents({
        accountId: 'acc_test_123',
        cardCount: 100,
        shippingAddress: sampleAddress1,
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const validation = validateQuoteIntegrity(res.quote, sampleAddress2);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('Shipping address changed');
    });

    it('invalidates quote when TTL expires', () => {
      const res = calculateCardQuoteCents({
        accountId: 'acc_test_123',
        cardCount: 100,
        shippingAddress: sampleAddress1,
        quoteTtlSeconds: -10, // Expired 10 seconds ago
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(isQuoteExpired(res.quote)).toBe(true);
      const validation = validateQuoteIntegrity(res.quote, sampleAddress1);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('quote has expired');
    });
  });

  describe('Approval Hashing (computeApprovalHash)', () => {
    it('creates deterministic approval hash from asset checksums', () => {
      const hash1 = computeApprovalHash({
        frontAssetHash: 'sha256_front_aaa',
        backAssetHash: 'sha256_back_bbb',
        designRevision: 1,
        userId: 'usr_owner_1',
      });

      const hash2 = computeApprovalHash({
        frontAssetHash: 'sha256_front_aaa',
        backAssetHash: 'sha256_back_bbb',
        designRevision: 1,
        userId: 'usr_owner_1',
      });

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('produces distinct hash when any artwork revision or checksum changes', () => {
      const original = computeApprovalHash({
        frontAssetHash: 'sha256_front_aaa',
        backAssetHash: 'sha256_back_bbb',
        designRevision: 1,
        userId: 'usr_owner_1',
      });

      const revisedArtwork = computeApprovalHash({
        frontAssetHash: 'sha256_front_CHANGED',
        backAssetHash: 'sha256_back_bbb',
        designRevision: 1,
        userId: 'usr_owner_1',
      });

      const bumpedRevision = computeApprovalHash({
        frontAssetHash: 'sha256_front_aaa',
        backAssetHash: 'sha256_back_bbb',
        designRevision: 2,
        userId: 'usr_owner_1',
      });

      expect(original).not.toBe(revisedArtwork);
      expect(original).not.toBe(bumpedRevision);
    });
  });

  describe('Checkout Operations & Lease Tokens', () => {
    it('creates idempotent operation key from account and quote identity', () => {
      const opKey1 = generateOperationKey('acc_123', 'quote_abc');
      const opKey2 = generateOperationKey('acc_123', 'quote_abc');
      expect(opKey1).toBe(opKey2);
      expect(opKey1).toBe('checkout_op_acc_123_quote_abc');
    });

    it('generates unique fulfillment lease tokens with valid expiration window', () => {
      const lease1 = createFulfillmentLease(300);
      const lease2 = createFulfillmentLease(300);

      expect(lease1.leaseToken).not.toBe(lease2.leaseToken);
      expect(new Date(lease1.leaseExpiresAt).getTime()).toBeGreaterThan(Date.now());
    });
  });
});
