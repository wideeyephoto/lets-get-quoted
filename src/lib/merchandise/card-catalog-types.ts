/**
 * Printful Business Card Catalog Types and Specifications
 *
 * Implements Batch A (Product Truth & Catalog Gating) per
 * business-card-instant-order-implementation-plan-2026-09-05.md
 */

/**
 * Printful catalog identifiers for Set of Business Cards.
 * Public listing Product ID: 724.
 * Variants represent physical pack sizes (50-pack and 100-pack).
 */
export const PRINTFUL_BUSINESS_CARD_PRODUCT_ID = 724;

export const PRINTFUL_CARD_VARIANTS = {
  PACK_50: 12450,
  PACK_100: 12451,
} as const;

export const SUPPORTED_CARD_QUANTITIES = [50, 100, 250, 500] as const;
export type SupportedCardQuantity = (typeof SUPPORTED_CARD_QUANTITIES)[number];

export interface CardPackItem {
  packSize: 50 | 100;
  packCount: number;
  variantId: number;
  cardsInPackItem: number;
}

export interface CardPackPlan {
  requestedCardCount: number;
  totalCards: number;
  totalPacks: number;
  packs: CardPackItem[];
}

/**
 * Supported production finishes for Printful business cards (uncoated Mohawk stock).
 * Decorative studio finishes like spot-UV, gold/silver/holographic foil, and velvet
 * are not supported by the Printful physical product and must be gated.
 */
export const SUPPORTED_CARD_FINISHES = ['uncoated', 'matte', 'standard', 'natural', 'none'] as const;

export const UNSUPPORTED_PHYSICAL_FINISHES = [
  'velvet_matte',
  'Soft-Touch Velvet Matte',
  'foil_gold',
  'Raised Gold Foil Accent',
  'foil_silver',
  'Raised Silver Chrome Foil',
  'spot_uv',
  'Raised Clear Spot-UV Gloss',
  'foil_holo',
  'Holographic Iridescent Foil',
] as const;

/**
 * Validates whether a requested finish can be physically fulfilled by Printful.
 */
export function isSupportedCardFinish(finish?: string | null): boolean {
  if (!finish) return true; // Default is standard uncoated
  const normalized = finish.toLowerCase().trim();
  if (
    normalized.includes('foil') ||
    normalized.includes('spot-uv') ||
    normalized.includes('spot_uv') ||
    normalized.includes('velvet') ||
    normalized.includes('holo') ||
    normalized.includes('gloss')
  ) {
    return false;
  }
  return true;
}

/**
 * Resolves the optimal, verified pack plan for a requested business card count.
 *
 * Rules:
 * - 50 cards  -> 1 x 50-pack
 * - 100 cards -> 1 x 100-pack
 * - 250 cards -> 2 x 100-pack + 1 x 50-pack
 * - 500 cards -> 5 x 100-pack
 * - Fractional, negative, zero, or unmapped counts return null.
 */
export function resolveCardPackPlan(requestedCards: number): CardPackPlan | null {
  if (typeof requestedCards !== 'number' || !Number.isInteger(requestedCards) || requestedCards <= 0) {
    return null;
  }

  switch (requestedCards) {
    case 50:
      return {
        requestedCardCount: 50,
        totalCards: 50,
        totalPacks: 1,
        packs: [
          {
            packSize: 50,
            packCount: 1,
            variantId: PRINTFUL_CARD_VARIANTS.PACK_50,
            cardsInPackItem: 50,
          },
        ],
      };

    case 100:
      return {
        requestedCardCount: 100,
        totalCards: 100,
        totalPacks: 1,
        packs: [
          {
            packSize: 100,
            packCount: 1,
            variantId: PRINTFUL_CARD_VARIANTS.PACK_100,
            cardsInPackItem: 100,
          },
        ],
      };

    case 250:
      return {
        requestedCardCount: 250,
        totalCards: 250,
        totalPacks: 3,
        packs: [
          {
            packSize: 100,
            packCount: 2,
            variantId: PRINTFUL_CARD_VARIANTS.PACK_100,
            cardsInPackItem: 200,
          },
          {
            packSize: 50,
            packCount: 1,
            variantId: PRINTFUL_CARD_VARIANTS.PACK_50,
            cardsInPackItem: 50,
          },
        ],
      };

    case 500:
      return {
        requestedCardCount: 500,
        totalCards: 500,
        totalPacks: 5,
        packs: [
          {
            packSize: 100,
            packCount: 5,
            variantId: PRINTFUL_CARD_VARIANTS.PACK_100,
            cardsInPackItem: 500,
          },
        ],
      };

    default:
      return null;
  }
}

/**
 * Dimensions and print specifications for standard US 3.5" x 2" business cards with full bleed.
 */
export const PRINTFUL_CARD_SPECS = {
  productId: PRINTFUL_BUSINESS_CARD_PRODUCT_ID,
  productName: 'Set of Business Cards',
  stock: 'Mohawk Superfine Uncoated Premium Cover',
  weightGsm: 352, // ~130 lb cover / 16pt feel
  finish: 'Smooth Uncoated Natural Matte',
  dimensions: {
    trimWidthInches: 3.5,
    trimHeightInches: 2.0,
    bleedInches: 0.125,
    totalWidthInches: 3.75,
    totalHeightInches: 2.25,
    dpi: 300,
    pixelWidth: 1125, // 3.75 * 300
    pixelHeight: 675, // 2.25 * 300
    safeAreaPaddingPx: 75, // 0.25" safe inner margin from bleed edge
  },
  fileSlots: ['front', 'back'] as const,
  acceptedFormats: ['image/png', 'image/jpeg', 'application/pdf'] as const,
};

/**
 * Currency conversion utilities enforcing integer cents.
 */
export function dollarsToCents(amount: number): number {
  return Math.round(amount * 100);
}

export function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Standard Printful wholesale costs per pack in integer cents (USD).
 * Product 724: Set of Business Cards.
 */
export const PRINTFUL_PACK_WHOLESALE_CENTS: Record<number, number> = {
  [PRINTFUL_CARD_VARIANTS.PACK_50]: 1000, // $10.00 wholesale
  [PRINTFUL_CARD_VARIANTS.PACK_100]: 1831, // $18.31 wholesale (Printful public base)
};

/**
 * Standard retail pricing in integer cents ensuring both:
 * 1) At least $10.00 contribution margin per order
 * 2) At least 30% contribution margin on product
 */
export const CARD_RETAIL_SUBTOTAL_CENTS: Record<SupportedCardQuantity, number> = {
  50: 2499, // $24.99 retail (wholesale $10.00 -> $14.99 margin / 60%)
  100: 3500, // $35.00 retail (wholesale $18.31 -> $16.69 margin / 47.7%)
  250: 6900, // $69.00 retail (wholesale 2x$18.31 + 1x$10 = $46.62 -> $22.38 margin / 32.4%)
  500: 12900, // $129.00 retail (wholesale 5x$18.31 = $91.55 -> $37.45 margin / 29.0%)
};
