import { createHash } from 'node:crypto';
import type { OfflineConversionParams } from './google-ads-api';

export const DATA_MANAGER_SCOPE = 'https://www.googleapis.com/auth/datamanager';
export const DATA_MANAGER_URL = 'https://datamanager.googleapis.com/v1/events:ingest';
export function usesDataManager(): boolean {
  return process.env.GOOGLE_ADS_CONVERSION_TRANSPORT === 'data-manager';
}

export function getDataManagerConfig() {
  const dedicated = Boolean(process.env.GOOGLE_DATA_MANAGER_CLIENT_ID);
  return {
    clientId: dedicated ? process.env.GOOGLE_DATA_MANAGER_CLIENT_ID : process.env.GOOGLE_ADS_CLIENT_ID,
    clientSecret: dedicated ? process.env.GOOGLE_DATA_MANAGER_CLIENT_SECRET : process.env.GOOGLE_ADS_CLIENT_SECRET,
    refreshToken: dedicated ? process.env.GOOGLE_DATA_MANAGER_REFRESH_TOKEN : process.env.GOOGLE_ADS_REFRESH_TOKEN,
    managerId: process.env.GOOGLE_ADS_MCC_CUSTOMER_ID?.replace(/-/g, '').trim(),
    customerId: process.env.GOOGLE_ADS_CLIENT_CUSTOMER_ID?.replace(/-/g, '').trim(),
  };
}

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const normalizeName = (value: string) => value.trim().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '');

/** Build one event for its conversion-owning advertiser. Never infer consent. */
export function buildDataManagerRequest(params: OfflineConversionParams, config = getDataManagerConfig(), validateOnly = false) {
  const customerId = (params.clientCustomerId || config.customerId || '').replace(/-/g, '').trim();
  if (!/^\d+$/.test(customerId) || customerId === config.managerId) throw new Error('A valid advertiser customer ID is required.');
  const action = /^(?:customers\/(\d+)\/conversionActions\/)?(\d+)$/.exec(params.conversionActionName);
  if (!action || (action[1] && action[1] !== customerId)) throw new Error('Conversion action must belong to the destination advertiser.');
  const timestamp = params.conversionDateTime || new Date().toISOString();
  const iso = timestamp.replace(' ', 'T');
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(iso) || !Number.isFinite(Date.parse(iso))) throw new Error('Conversion timestamp requires a valid timezone.');
  const value = params.conversionValueDollars ?? 0;
  if (!Number.isFinite(value) || value < 0) throw new Error('Conversion value must be finite and nonnegative.');
  const currency = (params.currencyCode || 'USD').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Currency must be a three-letter code.');
  const userIdentifiers: Array<Record<string, unknown>> = [];
  if (params.email?.trim()) {
    let email = params.email.trim().toLowerCase();
    const [local, domain] = email.split('@');
    if (domain === 'gmail.com' || domain === 'googlemail.com') email = `${local.replace(/\./g, '')}@${domain}`;
    userIdentifiers.push({ emailAddress: hash(email) });
  }
  if (params.phone?.trim()) {
    let digits = params.phone.replace(/\D/g, '');
    if (digits.length === 10) digits = `1${digits}`;
    if (digits.length >= 8 && digits.length <= 15) userIdentifiers.push({ phoneNumber: hash(`+${digits}`) });
  }
  if (params.firstName?.trim() && params.lastName?.trim() && params.postalCode?.trim()) {
    userIdentifiers.push({ address: { givenName: hash(normalizeName(params.firstName)), familyName: hash(normalizeName(params.lastName)), regionCode: 'US', postalCode: params.postalCode.trim() } });
  }
  const adIdentifiers = { ...(params.gclid ? { gclid: params.gclid } : {}), ...(params.gbraid ? { gbraid: params.gbraid } : {}), ...(params.wbraid ? { wbraid: params.wbraid } : {}) };
  if (!Object.keys(adIdentifiers).length && !userIdentifiers.length) throw new Error('A click identifier or complete user identifier is required.');
  if (!validateOnly && !params.orderId?.trim()) throw new Error('A stable conversion order ID is required for deduplication.');
  return {
    destinations: [{
      operatingAccount: { accountType: 'GOOGLE_ADS', accountId: customerId },
      ...(config.managerId ? { loginAccount: { accountType: 'GOOGLE_ADS', accountId: config.managerId } } : {}),
      productDestinationId: action[2],
    }],
    events: [{
      eventTimestamp: new Date(iso).toISOString(), conversionValue: value, currency,
      ...(params.orderId ? { transactionId: params.orderId } : {}),
      ...(Object.keys(adIdentifiers).length ? { adIdentifiers } : {}),
      ...(userIdentifiers.length ? { userData: { userIdentifiers } } : {}),
    }],
    ...(userIdentifiers.length ? { encoding: 'HEX' } : {}),
    validateOnly,
  };
}

export async function ingestDataManagerConversion(params: OfflineConversionParams, validateOnly = false) {
  const config = getDataManagerConfig();
  let stage = 'configuration';
  try {
    const payload = buildDataManagerRequest(params, config, validateOnly);
    if (!config.clientId || !config.clientSecret || !config.refreshToken) throw new Error('Data Manager OAuth credentials are missing.');
    stage = 'oauth';
    const auth = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: config.refreshToken, grant_type: 'refresh_token' }),
      signal: AbortSignal.timeout(10_000), cache: 'no-store',
    });
    if (!auth.ok) throw new Error(`Data Manager authorization failed (HTTP ${auth.status}); reconnect Google with the datamanager scope.`);
    const token = await auth.json();
    if (!token.access_token) throw new Error('Google returned no access token.');
    if (token.scope && !String(token.scope).split(' ').includes(DATA_MANAGER_SCOPE)) throw new Error('Google authorization needs the datamanager scope.');
    stage = 'ingestion';
    const response = await fetch(DATA_MANAGER_URL, {
      method: 'POST', headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000), cache: 'no-store',
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.error || !body) {
      const reason = (body?.error?.details || []).find((d: { reason?: string }) => d.reason)?.reason;
      // Do not expose provider messages, which can echo identifiers or credentials.
      const safeReason = ['ACCESS_TOKEN_SCOPE_INSUFFICIENT', 'SERVICE_DISABLED', 'USER_PERMISSION_DENIED'].includes(reason) ? ` ${reason}` : '';
      throw new Error(`Data Manager rejected the request (HTTP ${response.status}).${safeReason}`);
    }
    if (!validateOnly && !body.requestId) throw new Error('Data Manager returned no ingestion request ID.');
    return { success: true, stage, requestId: body.requestId as string | undefined, warningCount: Array.isArray(body.fieldWarnings) ? body.fieldWarnings.length : 0, enhancedConversionsActive: Boolean(payload.events[0].userData), message: validateOnly ? 'Data Manager validation passed; no conversion recorded.' : 'Conversion accepted by Data Manager for processing; attribution is not yet confirmed.' };
  } catch (error) {
    return { success: false, stage, requestId: undefined, warningCount: 0, enhancedConversionsActive: false, message: error instanceof Error ? error.message : 'Data Manager conversion request failed.' };
  }
}
