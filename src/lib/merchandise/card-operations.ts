/**
 * Business Card Ordering Operations, Quotes, and Verification
 *
 * Implements Batch B (Data and Operations) per
 * business-card-instant-order-implementation-plan-2026-09-05.md
 */

import { createHash, randomBytes } from 'node:crypto';
import type { ShippingAddress } from './types';
import {
  type CardPackPlan,
  type SupportedCardQuantity,
  resolveCardPackPlan,
  PRINTFUL_CARD_VARIANTS,
  dollarsToCents,
  centsToDollars,
  PRINTFUL_PACK_WHOLESALE_CENTS,
  CARD_RETAIL_SUBTOTAL_CENTS,
} from './card-catalog-types';

export {
  dollarsToCents,
  centsToDollars,
  PRINTFUL_PACK_WHOLESALE_CENTS,
  CARD_RETAIL_SUBTOTAL_CENTS,
};

export type PaymentStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'partially_refunded'
  | 'refunded'
  | 'disputed';

export type FulfillmentStatus =
  | 'not_submitted'
  | 'queued'
  | 'submitting'
  | 'provider_draft'
  | 'accepted'
  | 'in_production'
  | 'partially_shipped'
  | 'shipped'
  | 'delivered'
  | 'on_hold'
  | 'failed'
  | 'cancelled';

export interface CardDesignRecord {
  id: string;
  accountId: string;
  revision: number;
  templateId: string;
  templateVersion: number;
  content: {
    businessName: string;
    tagline?: string;
    phone?: string;
    website?: string;
    email?: string;
    license?: string;
    accentColor?: string;
    secondaryColor?: string;
    viewAngle?: string;
  };
  logoAssetKey?: string | null;
  qrDestinationUrl?: string | null;
  qrShortCode?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CardProofRecord {
  id: string;
  accountId: string;
  designId: string;
  designRevision: number;
  productCapabilityVersion: number;
  frontAssetKey: string;
  frontAssetHash: string;
  backAssetKey: string;
  backAssetHash: string;
  approvalHash: string;
  approvedByUserId?: string | null;
  approvedAt?: string | null;
  isApproved: boolean;
  preflightPassed: boolean;
  preflightDetails: Record<string, any>;
  createdAt: string;
}

export interface CardQuoteRecord {
  id: string;
  accountId: string;
  proofId?: string | null;
  cardCount: SupportedCardQuantity;
  packPlan: CardPackPlan;
  currency: 'USD';
  subtotalCents: number;
  shippingCostCents: number;
  estimatedTaxCents: number;
  totalCents: number;
  wholesaleCostCents: number;
  platformFeeCents: number;
  destinationFingerprint: string;
  selectedShippingRateId: string;
  expiresAt: string;
  createdAt: string;
}

export interface CardCheckoutOperationRecord {
  id: string;
  operationKey: string;
  accountId: string;
  orderId?: string | null;
  quoteId?: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'expired';
  stripeSessionId?: string | null;
  leaseToken?: string | null;
  leaseExpiresAt?: string | null;
  retryCount: number;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Generates an immutable SHA-256 fingerprint of a normalized shipping destination.
 * Any modification to the shipping address changes this hash and invalidates the quote.
 */
export function generateDestinationFingerprint(address: ShippingAddress): string {
  const normalized = [
    (address.fullName || '').trim().toLowerCase(),
    (address.streetAddress || '').trim().toLowerCase(),
    (address.apartmentSuite || '').trim().toLowerCase(),
    (address.city || '').trim().toLowerCase(),
    (address.state || '').trim().toUpperCase(),
    (address.postalCode || '').trim().slice(0, 5),
    (address.country || 'US').trim().toUpperCase(),
  ].join('|');

  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Computes an immutable approval hash linking the exact front/back file hashes,
 * design revision, and approver identity.
 */
export function computeApprovalHash(params: {
  frontAssetHash: string;
  backAssetHash: string;
  designRevision: number;
  userId?: string | null;
}): string {
  const content = `${params.frontAssetHash}|${params.backAssetHash}|rev:${params.designRevision}|actor:${params.userId || 'system'}`;
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Calculates an authoritative server quote in integer cents with pack-plan decomposition.
 * Quotes expire after quoteTtlSeconds (default 15 minutes).
 */
export function calculateCardQuoteCents(params: {
  accountId: string;
  proofId?: string | null;
  cardCount: number;
  shippingAddress: ShippingAddress;
  shippingCostCents?: number;
  shippingRateId?: string;
  quoteTtlSeconds?: number;
}): { ok: true; quote: CardQuoteRecord } | { ok: false; error: string } {
  const packPlan = resolveCardPackPlan(params.cardCount);
  if (!packPlan) {
    return {
      ok: false,
      error: `Invalid card quantity: ${params.cardCount}. Supported quantities are 50, 100, 250, and 500 cards.`,
    };
  }

  const cardQuantity = params.cardCount as SupportedCardQuantity;
  const subtotalCents = CARD_RETAIL_SUBTOTAL_CENTS[cardQuantity];
  if (!subtotalCents) {
    return {
      ok: false,
      error: `No pricing tier defined for card quantity: ${params.cardCount}`,
    };
  }

  // Calculate actual wholesale manufacturing cost from pack plan
  let wholesaleCostCents = 0;
  for (const pack of packPlan.packs) {
    const packUnitCost = PRINTFUL_PACK_WHOLESALE_CENTS[pack.variantId] || 1831;
    wholesaleCostCents += packUnitCost * pack.packCount;
  }

  const shippingCostCents = params.shippingCostCents ?? 1200; // Default $12.00 standard tracked ground
  const totalCents = subtotalCents + shippingCostCents;
  const platformFeeCents = Math.max(0, subtotalCents - wholesaleCostCents);

  const destinationFingerprint = generateDestinationFingerprint(params.shippingAddress);
  const ttlSeconds = params.quoteTtlSeconds ?? 900; // 15 minutes
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

  const quoteId = `quote_${Date.now()}_${randomBytes(4).toString('hex')}`;

  const quote: CardQuoteRecord = {
    id: quoteId,
    accountId: params.accountId,
    proofId: params.proofId || null,
    cardCount: cardQuantity,
    packPlan,
    currency: 'USD',
    subtotalCents,
    shippingCostCents,
    estimatedTaxCents: 0, // Calculated by Stripe at checkout
    totalCents,
    wholesaleCostCents,
    platformFeeCents,
    destinationFingerprint,
    selectedShippingRateId: params.shippingRateId || 'STANDARD',
    expiresAt,
    createdAt: now.toISOString(),
  };

  return { ok: true, quote };
}

/**
 * Checks if a quote has expired based on its TTL.
 */
export function isQuoteExpired(quote: { expiresAt: string | Date }): boolean {
  const expiry = typeof quote.expiresAt === 'string' ? new Date(quote.expiresAt) : quote.expiresAt;
  return expiry.getTime() <= Date.now();
}

/**
 * Validates quote integrity against the currently submitted shipping address.
 */
export function validateQuoteIntegrity(
  quote: CardQuoteRecord,
  currentAddress: ShippingAddress
): { valid: boolean; reason?: string } {
  if (isQuoteExpired(quote)) {
    return { valid: false, reason: 'Order quote has expired. Please re-check shipping to refresh pricing.' };
  }

  const currentFingerprint = generateDestinationFingerprint(currentAddress);
  if (currentFingerprint !== quote.destinationFingerprint) {
    return {
      valid: false,
      reason: 'Shipping address changed after quote generation. Please refresh quote with the new destination.',
    };
  }

  return { valid: true };
}

/**
 * Generates an idempotent operation key for a specific checkout attempt.
 */
export function generateOperationKey(accountId: string, quoteId: string): string {
  return `checkout_op_${accountId}_${quoteId}`;
}

/**
 * Creates a lease token with expiration for atomic fulfillment claiming.
 */
export function createFulfillmentLease(leaseDurationSeconds: number = 300): {
  leaseToken: string;
  leaseExpiresAt: string;
} {
  const leaseToken = randomBytes(16).toString('hex');
  const leaseExpiresAt = new Date(Date.now() + leaseDurationSeconds * 1000).toISOString();
  return { leaseToken, leaseExpiresAt };
}
