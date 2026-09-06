import { createHash } from 'node:crypto';

/**
 * Normalizes and SHA-256 hashes a string for privacy-safe Meta CAPI / Google customer matching.
 */
export function sha256Hash(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = value.trim().toLowerCase();
  if (!clean) return null;
  return createHash('sha256').update(clean).digest('hex');
}

/**
 * Normalizes phone number into E.164-compatible format before SHA256 hashing.
 */
export function normalizePhoneForHashing(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  // If 10 digits (US/Canada), prepend country code '1'
  const e164 = digits.length === 10 ? `1${digits}` : digits;
  return sha256Hash(e164);
}

export type OfflineConversionInput = {
  transactionId: string;
  accountId: string;
  amountDollars: number;
  currency?: string;
  conversionTimestamp?: string | Date;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerFirstName?: string | null;
  customerLastName?: string | null;
  customerPostalCode?: string | null;
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  fbclid?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
  eventSourceUrl?: string | null;
  trade?: string | null;
};

export type MetaCapiEventPayload = {
  event_name: 'Purchase' | 'Lead' | 'InitiateCheckout';
  event_time: number; // Unix epoch seconds
  event_id: string; // Idempotency key for deduplication with pixel
  action_source: 'website' | 'system_generated';
  event_source_url?: string;
  user_data: {
    em?: string[]; // SHA256 hashed emails
    ph?: string[]; // SHA256 hashed phone numbers
    fbc?: string;  // Click ID formatted as fb.1.timestamp.fbclid
    client_ip_address?: string;
    client_user_agent?: string;
  };
  custom_data: {
    value: number;
    currency: string;
    order_id: string;
    content_name?: string;
  };
};

export type GoogleAdsConversionPayload = {
  conversionAction: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  conversionDateTime: string; // Format: "yyyy-mm-dd hh:mm:ss+|-hh:mm"
  conversionValue: number;
  currencyCode: string;
  orderId: string;
  userIdentifiers?: Array<Record<string, unknown>>;
};

/**
 * Formats a verified signed quote or paid invoice into a Meta Conversions API (CAPI) Purchase event.
 */
export function buildMetaCapiPurchaseEvent(input: OfflineConversionInput): MetaCapiEventPayload {
  const {
    transactionId,
    amountDollars,
    currency = 'USD',
    conversionTimestamp = new Date(),
    customerEmail,
    customerPhone,
    fbclid,
    clientIpAddress,
    clientUserAgent,
    eventSourceUrl,
    trade,
  } = input;

  const dateObj = typeof conversionTimestamp === 'string' ? new Date(conversionTimestamp) : conversionTimestamp;
  const eventTimeSeconds = Math.floor(dateObj.getTime() / 1000);

  const hashedEmail = sha256Hash(customerEmail);
  const hashedPhone = normalizePhoneForHashing(customerPhone);

  const userData: MetaCapiEventPayload['user_data'] = {};
  if (hashedEmail) userData.em = [hashedEmail];
  if (hashedPhone) userData.ph = [hashedPhone];
  if (clientIpAddress) userData.client_ip_address = clientIpAddress;
  if (clientUserAgent) userData.client_user_agent = clientUserAgent;

  if (fbclid) {
    userData.fbc = `fb.1.${eventTimeSeconds}.${fbclid.trim()}`;
  }

  return {
    event_name: 'Purchase',
    event_time: eventTimeSeconds,
    event_id: `purchase_${transactionId.trim()}`,
    action_source: 'website',
    event_source_url: eventSourceUrl || undefined,
    user_data: userData,
    custom_data: {
      value: Math.max(0, Math.round(amountDollars * 100) / 100),
      currency: currency.toUpperCase(),
      order_id: transactionId.trim(),
      content_name: trade ? `${trade} Signed Project` : 'Trade Project Agreement',
    },
  };
}

/**
 * Formats a verified signed quote into a Google Ads Click Conversion upload payload.
 */
export function buildGoogleAdsOfflineConversion(
  input: OfflineConversionInput,
  conversionActionResourceName = 'customers/123/conversionActions/456'
): GoogleAdsConversionPayload | null {
  const {
    transactionId,
    amountDollars,
    currency = 'USD',
    conversionTimestamp = new Date(),
    gclid,
    gbraid,
    wbraid,
    customerEmail,
    customerPhone,
    customerFirstName,
    customerLastName,
    customerPostalCode,
  } = input;

  const hasClickId = Boolean((gclid && gclid.trim()) || (gbraid && gbraid.trim()) || (wbraid && wbraid.trim()));

  const userIdentifiers: Array<Record<string, unknown>> = [];
  const hashedEmail = sha256Hash(customerEmail);
  const hashedPhone = normalizePhoneForHashing(customerPhone);
  const hashedFirst = sha256Hash(customerFirstName);
  const hashedLast = sha256Hash(customerLastName);

  if (hashedEmail) userIdentifiers.push({ hashedEmail });
  if (hashedPhone) userIdentifiers.push({ hashedPhoneNumber: hashedPhone });
  if (hashedFirst || hashedLast || customerPostalCode) {
    userIdentifiers.push({
      addressInfo: {
        ...(hashedFirst ? { hashedFirstName: hashedFirst } : {}),
        ...(hashedLast ? { hashedLastName: hashedLast } : {}),
        ...(customerPostalCode ? { postalCode: customerPostalCode.trim() } : {}),
        countryCode: 'US',
      },
    });
  }

  if (!hasClickId && userIdentifiers.length === 0) {
    return null; // Google Ads offline upload requires click ID or user identification
  }

  const dateObj = typeof conversionTimestamp === 'string' ? new Date(conversionTimestamp) : conversionTimestamp;
  
  // Format as "yyyy-mm-dd hh:mm:ss+00:00"
  const iso = dateObj.toISOString();
  const formattedDateTime = iso.replace('T', ' ').replace(/\.\d+Z$/, '+00:00');

  const payload: GoogleAdsConversionPayload = {
    conversionAction: conversionActionResourceName,
    conversionDateTime: formattedDateTime,
    conversionValue: Math.max(0, Math.round(amountDollars * 100) / 100),
    currencyCode: currency.toUpperCase(),
    orderId: transactionId.trim(),
  };

  if (gclid && gclid.trim()) payload.gclid = gclid.trim();
  if (gbraid && gbraid.trim()) payload.gbraid = gbraid.trim();
  if (wbraid && wbraid.trim()) payload.wbraid = wbraid.trim();
  if (userIdentifiers.length > 0) payload.userIdentifiers = userIdentifiers;

  return payload;
}

export type ClosedLoopRoasMetrics = {
  totalAdSpendDollars: number;
  totalVerifiedRevenueDollars: number;
  conversionsCount: number;
  roas: number; // Return on ad spend multiplier (e.g. 8.5x)
  costPerAcquisitionDollars: number; // CAC
  netProfitEstimateDollars: number; // Revenue minus ad spend
  roasVerdict: 'exceptional' | 'profitable' | 'break_even' | 'unprofitable';
};

/**
 * Calculates verified return on ad spend (ROAS) and customer acquisition cost (CAC)
 * from actual closed revenue instead of estimated vanity metrics.
 */
export function calculateClosedLoopRoas(params: {
  totalAdSpendDollars: number;
  totalVerifiedRevenueDollars: number;
  totalConversionsCount: number;
}): ClosedLoopRoasMetrics {
  const { totalAdSpendDollars, totalVerifiedRevenueDollars, totalConversionsCount } = params;

  const safeSpend = Math.max(0, totalAdSpendDollars);
  const safeRevenue = Math.max(0, totalVerifiedRevenueDollars);
  const count = Math.max(0, totalConversionsCount);

  const roas = safeSpend > 0 ? Math.round((safeRevenue / safeSpend) * 10) / 10 : 0;
  const cac = count > 0 ? Math.round(safeSpend / count) : safeSpend;
  const netProfitEstimate = safeRevenue - safeSpend;

  let roasVerdict: ClosedLoopRoasMetrics['roasVerdict'] = 'break_even';
  if (roas >= 5.0) roasVerdict = 'exceptional';
  else if (roas >= 2.0) roasVerdict = 'profitable';
  else if (roas >= 1.0) roasVerdict = 'break_even';
  else roasVerdict = 'unprofitable';

  return {
    totalAdSpendDollars: safeSpend,
    totalVerifiedRevenueDollars: safeRevenue,
    conversionsCount: count,
    roas,
    costPerAcquisitionDollars: cac,
    netProfitEstimateDollars: netProfitEstimate,
    roasVerdict,
  };
}

export type MetaCapiUploadResult = {
  success: boolean;
  eventsReceived?: number;
  fbtraceId?: string;
  message: string;
  status: 'uploaded' | 'failed' | 'simulated' | 'unconfigured';
};

/**
 * Dispatches normalized, hashed conversion events directly to Meta Conversions API (CAPI).
 */
export async function uploadMetaCapiEvents(params: {
  events: MetaCapiEventPayload[];
  pixelId?: string;
  accessToken?: string;
  testEventCode?: string;
}): Promise<MetaCapiUploadResult> {
  const { events, testEventCode } = params;
  if (!events || events.length === 0) {
    return { success: true, eventsReceived: 0, status: 'uploaded', message: 'No events to upload.' };
  }

  const token = params.accessToken || process.env.META_ACCESS_TOKEN || process.env.META_SYSTEM_USER_TOKEN;
  const pixel = params.pixelId || process.env.META_PIXEL_ID || process.env.META_DATASET_ID;
  const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

  if (!token || !pixel) {
    if (isProduction) {
      return {
        success: false,
        status: 'unconfigured',
        message: 'Meta Pixel / Access Token unconfigured in production.',
      };
    }
    // Staging / simulated mode
    return {
      success: true,
      eventsReceived: events.length,
      status: 'simulated',
      fbtraceId: `sim_trace_${Date.now()}`,
      message: `Simulated upload of ${events.length} Meta CAPI events.`,
    };
  }

  try {
    const version = process.env.META_GRAPH_API_VERSION || 'v20.0';
    const url = `https://graph.facebook.com/${version}/${pixel}/events?access_token=${encodeURIComponent(token)}`;

    const body: Record<string, unknown> = {
      data: events,
    };
    if (testEventCode) {
      body.test_event_code = testEventCode;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify(body),
    });

    const json = (await res.json().catch(() => ({}))) as {
      events_received?: number;
      fbtrace_id?: string;
      error?: { message: string; type: string; code: number };
    };

    if (!res.ok || json.error) {
      const errMsg = json.error?.message || `HTTP ${res.status}`;
      return {
        success: false,
        status: 'failed',
        fbtraceId: json.fbtrace_id,
        message: `Meta CAPI upload failed: ${errMsg}`,
      };
    }

    return {
      success: true,
      eventsReceived: json.events_received ?? events.length,
      fbtraceId: json.fbtrace_id,
      status: 'uploaded',
      message: `Successfully uploaded ${json.events_received ?? events.length} events to Meta CAPI.`,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      status: 'failed',
      message: `Meta CAPI network error: ${errMsg}`,
    };
  }
}

