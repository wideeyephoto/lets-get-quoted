import { createHmac, timingSafeEqual } from 'node:crypto';
import type { MarketplaceInboundLead } from './types';

function sanitizeStr(val: unknown, maxLen = 300): string {
  if (typeof val !== 'string') return '';
  return val.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, maxLen);
}

/**
 * Validates Angi webhook signatures or auth tokens.
 */
export function verifyAngiSignature(params: {
  rawBody: string | Buffer;
  signatureHeader: string | null;
  tokenHeader: string | null;
  secret?: string;
  expectedToken?: string;
}): boolean {
  const { rawBody, signatureHeader, tokenHeader, secret, expectedToken } = params;
  const configuredSecret = secret || process.env.ANGI_WEBHOOK_SECRET;
  const configuredToken = expectedToken || process.env.ANGI_WEBHOOK_TOKEN;

  if (configuredToken && tokenHeader) {
    const cleanToken = tokenHeader.replace(/^Bearer\s+/i, '').trim();
    if (cleanToken === configuredToken) return true;
  }

  if (configuredSecret && signatureHeader) {
    const hmac = createHmac('sha256', configuredSecret);
    hmac.update(rawBody);
    const expected = hmac.digest('hex');
    const cleanSig = signatureHeader.replace(/^sha256=/i, '').trim();
    if (cleanSig.length === expected.length) {
      try {
        return timingSafeEqual(Buffer.from(cleanSig, 'hex'), Buffer.from(expected, 'hex'));
      } catch {
        return false;
      }
    }
  }

  // If no auth headers are configured in env, allow in dev/test mode with warning
  if (!configuredSecret && !configuredToken && process.env.NODE_ENV !== 'production') {
    return true;
  }

  return false;
}

/**
 * Maps Angi / HomeAdvisor webhook payloads into MarketplaceInboundLead.
 */
export function normalizeAngiLead(
  payload: Record<string, unknown>,
  signatureVerified = false
): MarketplaceInboundLead {
  const leadId = sanitizeStr(payload.leadId || payload.spLeadId || payload.id || payload.matchId || `angi_${Date.now()}`);
  
  // Consumer / Customer Info
  const consumer = (payload.consumer || payload.customer || payload.contact || {}) as Record<string, unknown>;
  const name = sanitizeStr(consumer.name || consumer.fullName || `${consumer.firstName || ''} ${consumer.lastName || ''}` || payload.customerName || 'Angi Customer');
  const phone = sanitizeStr(consumer.phone || consumer.primaryPhone || consumer.phoneNumber || payload.customerPhone);
  const email = sanitizeStr(consumer.email || payload.customerEmail);

  // Address
  const addr = (consumer.address || payload.address || {}) as Record<string, unknown>;
  const street = sanitizeStr(typeof addr === 'string' ? addr : addr.street || addr.streetAddress || addr.line1);
  const city = sanitizeStr(addr.city || consumer.city || payload.city);
  const state = sanitizeStr(addr.state || consumer.state || payload.state);
  const zip = sanitizeStr(addr.postalCode || addr.zip || consumer.zipCode || payload.postalCode || payload.zip);

  const addressParts = [street, city, state, zip].filter(Boolean);
  const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : (typeof addr === 'string' ? addr : undefined);

  // Project & Task Info
  const service = (payload.service || payload.task || {}) as Record<string, unknown>;
  const taskName = sanitizeStr(typeof service === 'string' ? service : service.name || service.taskName || payload.taskName || payload.serviceRequested || 'Home Improvement');
  const comments = sanitizeStr(payload.comments || payload.description || payload.details || service.description || '');
  const timing = sanitizeStr(payload.timing || payload.urgency || payload.timeline || '');
  const isUrgent = Boolean(
    timing.toLowerCase().includes('emergency') ||
    timing.toLowerCase().includes('urgent') ||
    timing.toLowerCase().includes('immediately') ||
    payload.isEmergency
  );

  const contractorId = sanitizeStr(payload.spId || payload.contractorId || payload.accountId);

  return {
    provider: 'angi',
    providerLeadId: leadId,
    customer: {
      name: name || 'Angi Homeowner',
      phone: phone || null,
      email: email || null,
      address: fullAddress || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
    },
    project: {
      trade: taskName,
      projectType: taskName,
      message: comments || `Angi Lead: ${taskName}`,
      timeline: timing || 'Standard',
      isUrgent,
      rawAnswers: payload as Record<string, string | string[]>,
    },
    attribution: {
      source: 'angi',
      medium: 'paid_lead',
      campaign: taskName,
      clickId: leadId,
      capturedAt: new Date().toISOString(),
    },
    targetAccountHint: {
      partnerContractorId: contractorId || undefined,
      zipCode: zip || undefined,
      trade: taskName || undefined,
    },
    rawPayload: payload,
    signatureVerified,
  };
}

/**
 * Validates Thumbtack webhook signatures or auth tokens.
 */
export function verifyThumbtackSignature(params: {
  rawBody: string | Buffer;
  signatureHeader: string | null;
  tokenHeader: string | null;
  secret?: string;
  expectedToken?: string;
}): boolean {
  const { rawBody, signatureHeader, tokenHeader, secret, expectedToken } = params;
  const configuredSecret = secret || process.env.THUMBTACK_WEBHOOK_SECRET;
  const configuredToken = expectedToken || process.env.THUMBTACK_WEBHOOK_TOKEN;

  if (configuredToken && tokenHeader) {
    const cleanToken = tokenHeader.replace(/^Bearer\s+/i, '').trim();
    if (cleanToken === configuredToken) return true;
  }

  if (configuredSecret && signatureHeader) {
    const hmac = createHmac('sha256', configuredSecret);
    hmac.update(rawBody);
    const expected = hmac.digest('hex');
    const cleanSig = signatureHeader.replace(/^sha256=/i, '').trim();
    if (cleanSig.length === expected.length) {
      try {
        return timingSafeEqual(Buffer.from(cleanSig, 'hex'), Buffer.from(expected, 'hex'));
      } catch {
        return false;
      }
    }
  }

  if (!configuredSecret && !configuredToken && process.env.NODE_ENV !== 'production') {
    return true;
  }

  return false;
}

/**
 * Maps Thumbtack webhook payloads into MarketplaceInboundLead.
 */
export function normalizeThumbtackLead(
  payload: Record<string, unknown>,
  signatureVerified = false
): MarketplaceInboundLead {
  const inquiryId = sanitizeStr(payload.inquiryId || payload.requestId || payload.id || payload.negotiationId || `tt_${Date.now()}`);

  const customer = (payload.customer || payload.user || payload.contact || {}) as Record<string, unknown>;
  const name = sanitizeStr(customer.name || customer.fullName || `${customer.firstName || ''} ${customer.lastName || ''}` || payload.customerName || 'Thumbtack Customer');
  const phone = sanitizeStr(customer.phone || customer.phoneNumber || payload.phone);
  const email = sanitizeStr(customer.email || payload.email);

  const location = (payload.location || payload.address || customer.location || {}) as Record<string, unknown>;
  const street = sanitizeStr(typeof location === 'string' ? location : location.street || location.address);
  const city = sanitizeStr(location.city || payload.city);
  const state = sanitizeStr(location.state || payload.state);
  const zip = sanitizeStr(location.zipCode || location.zip || payload.zipCode || payload.zip);

  const addressParts = [street, city, state, zip].filter(Boolean);
  const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : (typeof location === 'string' ? location : undefined);

  const category = sanitizeStr(payload.categoryName || payload.category || payload.serviceName || payload.jobType || 'Home Services');
  const details = sanitizeStr(payload.details || payload.message || payload.description || payload.notes || '');
  const schedule = sanitizeStr(payload.schedulePreference || payload.timing || payload.urgency || '');
  const isUrgent = Boolean(
    schedule.toLowerCase().includes('asap') ||
    schedule.toLowerCase().includes('urgent') ||
    schedule.toLowerCase().includes('emergency') ||
    payload.isEmergency
  );

  const proId = sanitizeStr(payload.proId || payload.contractorId || payload.accountId);

  return {
    provider: 'thumbtack',
    providerLeadId: inquiryId,
    customer: {
      name: name || 'Thumbtack Homeowner',
      phone: phone || null,
      email: email || null,
      address: fullAddress || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
    },
    project: {
      trade: category,
      projectType: category,
      message: details || `Thumbtack Inquiry: ${category}`,
      timeline: schedule || 'Flexible',
      isUrgent,
      rawAnswers: payload as Record<string, string | string[]>,
    },
    attribution: {
      source: 'thumbtack',
      medium: 'marketplace_lead',
      campaign: category,
      clickId: inquiryId,
      capturedAt: new Date().toISOString(),
    },
    targetAccountHint: {
      partnerContractorId: proId || undefined,
      zipCode: zip || undefined,
      trade: category || undefined,
    },
    rawPayload: payload,
    signatureVerified,
  };
}

/**
 * Generic Marketplace Normalizer for custom / webhook aggregators.
 */
export function normalizeGenericMarketplaceLead(
  payload: Record<string, unknown>,
  provider: 'nextdoor' | 'marketplace_custom' = 'marketplace_custom',
  signatureVerified = false
): MarketplaceInboundLead {
  const leadId = sanitizeStr(payload.leadId || payload.id || payload.referenceId || `gen_${Date.now()}`);

  const name = sanitizeStr(payload.name || payload.customerName || `${payload.firstName || ''} ${payload.lastName || ''}` || 'Marketplace Inquirer');
  const phone = sanitizeStr(payload.phone || payload.phoneNumber || payload.mobile);
  const email = sanitizeStr(payload.email);
  const address = sanitizeStr(payload.address || payload.location || payload.street);
  const city = sanitizeStr(payload.city);
  const state = sanitizeStr(payload.state);
  const zip = sanitizeStr(payload.zip || payload.postalCode || payload.zipCode);

  const trade = sanitizeStr(payload.trade || payload.service || payload.category || payload.projectType || 'General Trade');
  const message = sanitizeStr(payload.message || payload.description || payload.notes || `Inquiry for ${trade}`);
  const timeline = sanitizeStr(payload.timeline || payload.urgency || payload.timing || 'Standard');

  return {
    provider,
    providerLeadId: leadId,
    customer: {
      name,
      phone: phone || null,
      email: email || null,
      address: address || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
    },
    project: {
      trade,
      projectType: trade,
      message,
      timeline,
      isUrgent: timeline.toLowerCase().includes('urgent') || timeline.toLowerCase().includes('asap'),
      rawAnswers: payload as Record<string, string | string[]>,
    },
    attribution: {
      source: provider === 'nextdoor' ? 'nextdoor' : 'marketplace',
      medium: 'marketplace_lead',
      campaign: trade,
      clickId: leadId,
      capturedAt: new Date().toISOString(),
    },
    targetAccountHint: {
      accountId: sanitizeStr(payload.accountId) || undefined,
      zipCode: zip || undefined,
      trade: trade || undefined,
    },
    rawPayload: payload,
    signatureVerified,
  };
}
