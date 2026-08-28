/**
 * Central Product-Truth Registry for Let's Get Quoted.
 * 
 * Single source of truth for:
 * 1. Plan pricing, fees, and feature availability
 * 2. Explicit capability and launch statuses
 * 3. Verified security, payment, and integration claims
 * 4. External competitor data source citations and review dates
 */

import { BILLING_PLANS, platformFeePercent } from '@/lib/billing/catalog';

export type FeatureStatus = 'live' | 'limited' | 'beta' | 'pending' | 'unavailable';

export interface CapabilityTruth {
  id: string;
  name: string;
  status: FeatureStatus;
  description: string;
  knownLimitations?: string;
  disclosureRequired?: string;
}

export const CAPABILITIES: Record<string, CapabilityTruth> = {
  website_generator: {
    id: 'website_generator',
    name: 'Contractor Website Builder',
    status: 'live',
    description: 'Custom-domain contractor website with mobile SEO and quote forms.',
  },
  ai_instant_intake: {
    id: 'ai_instant_intake',
    name: '24/7 AI Estimate Intake',
    status: 'live',
    description: 'Conversational project scoping and non-binding instant price estimates.',
  },
  quotes_and_invoicing: {
    id: 'quotes_and_invoicing',
    name: 'Quotes, Deposits & Invoices',
    status: 'live',
    description: 'Itemized quote builder, optional upgrades, digital e-signature, and invoice generation.',
  },
  scheduling_and_dispatch: {
    id: 'scheduling_and_dispatch',
    name: 'Scheduling & Team Calendar',
    status: 'live',
    description: 'Multi-crew dispatch, customer arrival windows, and route optimization.',
  },
  quickbooks_sync: {
    id: 'quickbooks_sync',
    name: 'QuickBooks Online Integration',
    status: 'live',
    description: '1-Click bi-directional ledger sync for invoices, customers, and payments via official Intuit OAuth API.',
  },
  stripe_payouts: {
    id: 'stripe_payouts',
    name: 'Stripe Connect Payments',
    status: 'live',
    description: 'Credit card, debit card, Apple Pay, and Google Pay processing with direct bank deposits.',
  },
  quick_stops: {
    id: 'quick_stops',
    name: 'Quick Stops Route Filler',
    status: 'live',
    description: 'Automated matching for small emergency jobs located along an active crew route.',
  },
  outbound_texting: {
    id: 'outbound_texting',
    name: '2-Way Business Texting (SMS/MMS)',
    status: 'live',
    description: 'Automated SMS dispatches for quote approvals, arrival windows, and review requests.',
  },
  ai_voice_receptionist: {
    id: 'ai_voice_receptionist',
    name: 'AI Voice Receptionist',
    status: 'pending',
    description: 'Inbound phone answering, voice triage, and emergency job booking.',
    knownLimitations: 'Voice carrier routing integration undergoing final verification.',
  },
};

export const VERIFIED_CLAIMS = {
  paymentSecurity: {
    processor: 'Stripe, Inc.',
    compliance: 'PCI-DSS Level 1 Service Provider',
    cardDataHandling: 'Sensitive card numbers are tokenized and processed directly by Stripe; raw card numbers never touch or reside on LGQ servers.',
    payoutSchedule: 'Standard 2-business-day rolling direct deposits via Stripe Connect to the contractor’s linked bank account.',
  },
  dataSecurity: {
    transportEncryption: 'HTTPS / TLS 1.3 encryption across all public and authenticated endpoints.',
    tenantIsolation: 'PostgreSQL Database Row-Level Security (RLS) policies enforcing multi-tenant data boundaries on every query.',
  },
  integrations: {
    quickbooks: 'Official Intuit QuickBooks Online OAuth 2.0 API connection.',
    stripe: 'Official Stripe Connect custom onboarding integration.',
  },
  competitorBenchmarks: {
    lastVerifiedDate: 'August 14, 2026',
    verifiedBy: 'LGQ Commercial Pricing Team',
    sources: [
      { name: 'Jobber', url: 'https://www.getjobber.com/pricing/', notes: 'USD monthly list prices for Connect & Grow tiers.' },
      { name: 'Housecall Pro', url: 'https://www.housecallpro.com/pricing/', notes: 'USD list prices for Essentials tier.' },
      { name: 'ServiceTitan', url: 'https://www.servicetitan.com/', notes: 'Enterprise quotes for residential contractors.' },
    ],
  },
};

export const PLAN_TRUTH = {
  flex: {
    id: 'flex',
    name: 'Flex',
    monthlyPrice: BILLING_PLANS.flex.monthlyPriceCents / 100,
    annualMonthlyPrice: BILLING_PLANS.flex.annualPriceCents / 12 / 100,
    platformFeePct: platformFeePercent('flex'),
    officeSeats: BILLING_PLANS.flex.allowances.officeUsers,
    crewSeats: BILLING_PLANS.flex.allowances.crewUsers,
    textCredits: '50 one-time starter credits',
    seasonalPause: '100% free with $0 monthly subscription in slow months',
  },
  solo: {
    id: 'solo',
    name: 'Solo',
    monthlyPrice: BILLING_PLANS.solo.monthlyPriceCents / 100,
    annualMonthlyPrice: BILLING_PLANS.solo.annualPriceCents / 12 / 100,
    platformFeePct: platformFeePercent('solo'),
    officeSeats: BILLING_PLANS.solo.allowances.officeUsers,
    crewSeats: BILLING_PLANS.solo.allowances.crewUsers,
    textCredits: '500/month',
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    monthlyPrice: BILLING_PLANS.growth.monthlyPriceCents / 100,
    annualMonthlyPrice: BILLING_PLANS.growth.annualPriceCents / 12 / 100,
    platformFeePct: platformFeePercent('growth'),
    officeSeats: BILLING_PLANS.growth.allowances.officeUsers,
    crewSeats: BILLING_PLANS.growth.allowances.crewUsers,
    textCredits: '1,500/month',
  },
  scale: {
    id: 'scale',
    name: 'Scale',
    monthlyPrice: BILLING_PLANS.scale.monthlyPriceCents / 100,
    annualMonthlyPrice: BILLING_PLANS.scale.annualPriceCents / 12 / 100,
    platformFeePct: platformFeePercent('scale'),
    officeSeats: BILLING_PLANS.scale.allowances.officeUsers,
    crewSeats: BILLING_PLANS.scale.allowances.crewUsers,
    textCredits: '3,000/month',
  },
};
