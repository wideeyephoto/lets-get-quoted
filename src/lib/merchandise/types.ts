/**
 * Merchandising Studio & Instant Purchasing Types
 */

import type { GeneratedAiLogo } from '@/app/dashboard/sites/actions';

export type MerchandiseCategoryId = 'apparel' | 'print' | 'gear' | 'signage';

export type MerchandiseProductId =
  | 'biz_cards'
  | 'polos'
  | 't_shirts'
  | 'hats'
  | 'notepads'
  | 'pens'
  | 'phone_cases'
  | 'yard_signs'
  | 'tumblers'
  | 'decals';

export type MockupViewAngle = 'front' | 'back' | 'angle' | 'detail';

export type DecorationMethod =
  | 'embroidery'
  | 'screen_print'
  | 'laser_engraved'
  | 'leather_patch'
  | 'uv_direct'
  | 'foil_stamp'
  | 'offset_cmyk';

export type ProductColorOption = {
  id: string;
  name: string;
  hex: string;
  darkText?: boolean;
  accentContrast?: string;
};

export type PricingTier = {
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  savingsPercent?: number;
  turnaroundDays: number;
  isPopular?: boolean;
};

export type MerchandiseProduct = {
  id: MerchandiseProductId;
  name: string;
  tagline: string;
  category: MerchandiseCategoryId;
  description: string;
  bulletPoints: string[];
  basePrice: number;
  minQuantity: number;
  turnaroundEstimate: string;
  decorationMethod: DecorationMethod;
  decorationLabel: string;
  availableColors: ProductColorOption[];
  supportedViews: MockupViewAngle[];
  pricingTiers: PricingTier[];
  specs: {
    dimensions: string;
    material: string;
    finish: string;
    printArea: string;
    washCare?: string;
  };
  options?: {
    sizes?: string[];
    finishes?: string[];
    deviceModels?: string[];
    paperWeights?: string[];
  };
};

export type BrandLogoSelection = {
  type: 'ai_concept' | 'vector' | 'text_only';
  logoId?: string;
  imageUrl?: string;
  svgContent?: string;
  label?: string;
};

export type MerchandiseCustomization = {
  productId: MerchandiseProductId;
  selectedColorId: string;
  selectedTierQuantity: number;
  selectedFinish?: string;
  selectedDeviceModel?: string;
  sizeQuantities?: Record<string, number>;
  brandLogo: BrandLogoSelection;
  businessName: string;
  tagline?: string;
  phone?: string;
  website?: string;
  license?: string;
  viewAngle: MockupViewAngle;
  activePlacement: 'left_chest' | 'center_chest' | 'full_back' | 'front_card' | 'back_card' | 'wrap';
};

export type ShippingAddress = {
  fullName: string;
  companyName?: string;
  streetAddress: string;
  apartmentSuite?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  email: string;
  deliveryNotes?: string;
};

export type MerchandiseOrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'proof_approved'
  | 'in_production'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export type MerchandiseOrderItem = {
  productId: MerchandiseProductId;
  productName: string;
  colorName: string;
  colorHex: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  customizationDetails: {
    businessName: string;
    phone?: string;
    website?: string;
    license?: string;
    logoUrl?: string;
    decorationMethod: DecorationMethod;
    placement: string;
    sizeBreakdown?: Record<string, number>;
    finish?: string;
    deviceModel?: string;
  };
};

export type MerchandiseOrder = {
  id: string;
  accountId: string;
  orderNumber: string;
  status: MerchandiseOrderStatus;
  items: MerchandiseOrderItem[];
  subtotal: number;
  shippingCost: number;
  taxAmount: number;
  totalAmount: number;
  shippingAddress: ShippingAddress;
  stripeSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  printfulOrderId?: number | null;
  trackingNumber?: string | null;
  trackingCarrier?: string | null;
  estimatedDeliveryDate?: string | null;
  proofApprovedAt?: string | null;
  proofSnapshotUrl?: string | null;
  revenueBreakdown?: {
    platformCutAmount: number;
    wholesaleCost: number;
    stripeFee: number;
    netProfit: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type MerchandiseStudioInitialData = {
  accountId?: string;
  companyName: string;
  trade: string;
  tagline: string;
  phone: string;
  website: string;
  license: string;
  accentColor: string;
  secondaryColor: string;
  currentLogoUrl: string | null;
  aiLogos: GeneratedAiLogo[];
  recentOrders: MerchandiseOrder[];
};
