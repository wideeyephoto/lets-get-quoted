import { createHmac, timingSafeEqual } from 'node:crypto';
import type { MarketplaceInboundLead } from './types';

export const META_GRAPH_API_VERSION = 'v20.0';
export const META_GRAPH_API_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

export type MetaLeadgenValue = {
  leadgen_id: string;
  form_id: string;
  page_id: string;
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
  created_time?: number;
};

export type MetaWebhookChange = {
  field: string;
  value: MetaLeadgenValue;
};

export type MetaWebhookEntry = {
  id: string;
  time: number;
  changes: MetaWebhookChange[];
};

export type MetaWebhookPayload = {
  object: string;
  entry: MetaWebhookEntry[];
};

export type MetaFieldData = {
  name: string;
  values: string[];
};

export type MetaLeadDetails = {
  id: string;
  created_time?: string;
  ad_id?: string;
  form_id?: string;
  field_data?: MetaFieldData[];
  ad_name?: string;
  campaign_name?: string;
  form_name?: string;
};

/**
 * Validates Meta Webhook verification challenge (GET handshake).
 */
export function verifyMetaWebhookChallenge(params: {
  mode: string | null;
  verifyToken: string | null;
  challenge: string | null;
  expectedToken?: string;
}): { valid: boolean; challenge?: string } {
  const { mode, verifyToken, challenge, expectedToken } = params;
  const configuredToken = expectedToken || process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN;

  if (mode === 'subscribe' && verifyToken && configuredToken && verifyToken === configuredToken && challenge) {
    return { valid: true, challenge };
  }

  return { valid: false };
}

/**
 * Verifies the X-Hub-Signature-256 header sent by Meta using the App Secret.
 */
export function verifyMetaWebhookSignature(params: {
  rawBody: string | Buffer;
  signatureHeader: string | null;
  appSecret?: string;
}): boolean {
  const { rawBody, signatureHeader, appSecret } = params;
  const secret = appSecret || process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET;

  if (!secret || !signatureHeader) return false;

  const prefix = 'sha256=';
  if (!signatureHeader.startsWith(prefix)) return false;

  const signatureHash = signatureHeader.slice(prefix.length).trim();
  const hmac = createHmac('sha256', secret);
  hmac.update(rawBody);
  const calculatedHash = hmac.digest('hex');

  if (signatureHash.length !== calculatedHash.length) return false;

  try {
    return timingSafeEqual(Buffer.from(signatureHash, 'hex'), Buffer.from(calculatedHash, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Parses a Meta webhook JSON payload and returns all leadgen event items.
 */
export function parseMetaWebhookPayload(body: unknown): MetaLeadgenValue[] {
  if (!body || typeof body !== 'object') return [];
  const payload = body as MetaWebhookPayload;

  if (payload.object !== 'page' || !Array.isArray(payload.entry)) {
    return [];
  }

  const events: MetaLeadgenValue[] = [];

  for (const entry of payload.entry) {
    if (!Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (change.field === 'leadgen' && change.value && typeof change.value.leadgen_id === 'string') {
        events.push(change.value);
      }
    }
  }

  return events;
}

/**
 * Fetches the full lead form data from Meta Graph API using the leadgen_id.
 */
export async function fetchMetaLeadDetails(
  leadgenId: string,
  accessToken?: string
): Promise<MetaLeadDetails | null> {
  const token =
    accessToken ||
    process.env.META_PAGE_ACCESS_TOKEN ||
    process.env.META_SYSTEM_USER_TOKEN ||
    process.env.META_ACCESS_TOKEN;

  if (!token) {
    console.warn(`Meta Graph API access token not configured; unable to retrieve leadgen_id ${leadgenId}`);
    return null;
  }

  try {
    const url = `${META_GRAPH_API_BASE}/${encodeURIComponent(leadgenId)}?fields=id,created_time,ad_id,form_id,field_data&access_token=${encodeURIComponent(token)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Meta Graph API lead retrieval failed for ${leadgenId} (${response.status}):`, errorBody);
      return null;
    }

    return (await response.json()) as MetaLeadDetails;
  } catch (error) {
    console.error(`Meta Graph API network error for lead ${leadgenId}:`, error);
    return null;
  }
}

/**
 * Maps Meta field_data entries into structured customer, location, and project details.
 */
export function normalizeMetaLead(params: {
  event: MetaLeadgenValue;
  leadDetails?: MetaLeadDetails | null;
  signatureVerified?: boolean;
}): MarketplaceInboundLead {
  const { event, leadDetails, signatureVerified = false } = params;

  let fullName = '';
  let firstName = '';
  let lastName = '';
  let phone = '';
  let email = '';
  let streetAddress = '';
  let city = '';
  let state = '';
  let zip = '';
  let projectType = '';
  let message = '';
  let timeline = '';
  let isUrgent = false;

  const rawAnswers: Record<string, string | string[]> = {};

  if (leadDetails?.field_data && Array.isArray(leadDetails.field_data)) {
    for (const field of leadDetails.field_data) {
      const name = (field.name || '').toLowerCase().trim();
      const val = Array.isArray(field.values) ? field.values.join(', ').trim() : '';

      if (!val) continue;
      rawAnswers[field.name] = field.values.length === 1 ? field.values[0] : field.values;

      // Standard Meta field matching
      if (name === 'full_name' || name === 'name' || name === 'contact_name') {
        fullName = val;
      } else if (name === 'first_name') {
        firstName = val;
      } else if (name === 'last_name') {
        lastName = val;
      } else if (name === 'phone_number' || name === 'phone' || name === 'mobile_phone') {
        phone = val;
      } else if (name === 'email' || name === 'email_address') {
        email = val.toLowerCase();
      } else if (name === 'street_address' || name === 'address' || name === 'street') {
        streetAddress = val;
      } else if (name === 'city') {
        city = val;
      } else if (name === 'state' || name === 'province' || name === 'region') {
        state = val;
      } else if (name === 'zip_code' || name === 'postal_code' || name === 'zip') {
        zip = val;
      } else if (
        name.includes('service') ||
        name.includes('trade') ||
        name.includes('project_type') ||
        name.includes('work_needed') ||
        name.includes('need')
      ) {
        projectType = projectType ? `${projectType}, ${val}` : val;
      } else if (
        name.includes('time') ||
        name.includes('urgency') ||
        name.includes('when') ||
        name.includes('soon') ||
        name.includes('schedule')
      ) {
        timeline = val;
        if (
          val.toLowerCase().includes('urgent') ||
          val.toLowerCase().includes('asap') ||
          val.toLowerCase().includes('emergency') ||
          val.toLowerCase().includes('immediately')
        ) {
          isUrgent = true;
        }
      } else if (name.includes('notes') || name.includes('details') || name.includes('description') || name.includes('message')) {
        message = message ? `${message}\n${val}` : val;
      }

      if (
        val.toLowerCase().includes('urgent') ||
        val.toLowerCase().includes('asap') ||
        val.toLowerCase().includes('emergency') ||
        val.toLowerCase().includes('immediately')
      ) {
        isUrgent = true;
      }
    }
  }

  // Synthesize names if only first/last provided
  if (!fullName && (firstName || lastName)) {
    fullName = `${firstName} ${lastName}`.trim();
  }

  // Default placeholder name if missing (e.g. anonymous lead ad)
  if (!fullName) {
    fullName = 'Meta Lead Ad Inquirer';
  }

  // Combine full address string
  const addressParts = [streetAddress, city, state, zip].filter(Boolean);
  const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : undefined;

  // Build message summary from custom answers if message is blank
  if (!message && Object.keys(rawAnswers).length > 0) {
    const detailList = Object.entries(rawAnswers)
      .filter(([k]) => !['full_name', 'first_name', 'last_name', 'phone_number', 'email', 'street_address', 'city', 'state', 'zip_code'].includes(k.toLowerCase()))
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join('\n');
    if (detailList) message = detailList;
  }

  return {
    provider: 'meta_lead_ads',
    providerLeadId: event.leadgen_id,
    customer: {
      name: fullName,
      phone: phone || null,
      email: email || null,
      address: fullAddress || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
    },
    project: {
      trade: projectType || 'General Trade',
      projectType: projectType || 'Meta Lead Ad Request',
      message: message || 'Submitted Meta Instant Form / Lead Ad',
      timeline: timeline || 'Standard',
      isUrgent,
      rawAnswers,
    },
    attribution: {
      source: 'facebook',
      medium: 'meta_lead_ad',
      campaign: event.campaign_id ? `meta_campaign_${event.campaign_id}` : undefined,
      content: event.ad_id ? `ad_${event.ad_id}` : undefined,
      clickId: event.leadgen_id,
      clickIdType: 'fbclid',
      capturedAt: event.created_time ? new Date(event.created_time * 1000).toISOString() : new Date().toISOString(),
    },
    targetAccountHint: {
      pageId: event.page_id,
      formId: event.form_id,
      zipCode: zip || undefined,
      trade: projectType || undefined,
    },
    rawPayload: {
      event,
      leadDetails,
    },
    signatureVerified,
  };
}
