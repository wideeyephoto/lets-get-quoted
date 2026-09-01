import type { LeadAttribution } from '@/lib/attribution';
import type { Lead, LeadSource, LeadTriage } from '@/lib/leads';

export type MarketplaceProvider =
  | 'meta_lead_ads'
  | 'angi'
  | 'thumbtack'
  | 'nextdoor'
  | 'marketplace_custom';

export type MarketplaceCustomer = {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export type MarketplaceProject = {
  trade?: string | null;
  projectType?: string | null;
  message?: string | null;
  timeline?: string | null;
  estimatedBudget?: { min?: number; max?: number } | null;
  isUrgent?: boolean;
  rawAnswers?: Record<string, string | string[]>;
};

export type MarketplaceInboundLead = {
  provider: MarketplaceProvider;
  providerLeadId: string;
  customer: MarketplaceCustomer;
  project: MarketplaceProject;
  attribution?: LeadAttribution;
  receivedAt?: string;
  targetAccountHint?: {
    accountId?: string;
    pageId?: string;
    formId?: string;
    partnerContractorId?: string;
    zipCode?: string;
    trade?: string;
  };
  rawPayload?: Record<string, unknown>;
  signatureVerified?: boolean;
};

export type MarketplaceRoutingDisposition =
  | 'routed'
  | 'duplicate'
  | 'unmatched_account'
  | 'validation_failed'
  | 'error';

export type MarketplaceRoutingResult = {
  success: boolean;
  disposition: MarketplaceRoutingDisposition;
  leadId?: string;
  lead?: Lead;
  accountId?: string;
  isDuplicate?: boolean;
  speedToLeadDispatched?: boolean;
  ownerAlertsSent?: boolean;
  message: string;
  error?: string;
};

export type MarketplaceAccountMapping = {
  accountId: string;
  provider: MarketplaceProvider;
  providerEntityId: string; // e.g. Meta Page ID, Form ID, Angi Contractor ID, etc.
  serviceAreaZips?: string[];
  primaryTrade?: string;
};
