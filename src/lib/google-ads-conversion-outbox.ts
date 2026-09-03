/**
 * Durable Closed-Loop Google Ads Offline Conversion Outbox.
 *
 * Persists, deduplicates, and retries offline click conversions (gclid, gbraid, wbraid,
 * and first-party Enhanced Conversions) when leads are closed/won.
 */

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Lead } from './leads';
import { uploadOfflineConversion, type OfflineConversionParams, type OfflineConversionResult } from './google-ads-api';

export type OfflineConversionQueueItem = {
  id: string;
  accountId: string;
  leadId?: string;
  orderId: string;
  conversionActionName: string;
  conversionValueDollars: number;
  currencyCode: string;
  conversionDateTime: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  postalCode?: string | null;
  clientCustomerId?: string;
  status: 'pending' | 'uploaded' | 'failed';
  attempts: number;
  lastError?: string;
  createdAt: string;
  uploadedAt?: string;
};

/**
 * Normalizes phone numbers to E.164 format (+1XXXXXXXXXX for US).
 */
export function normalizeE164Phone(phone?: string | null): string | null {
  if (!phone || !phone.trim()) return null;
  const digits = phone.replace(/[^\d]/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (phone.trim().startsWith('+')) return `+${digits}`;
  return `+${digits}`;
}

/**
 * Normalizes email address for Google Ads Enhanced Conversions matching.
 */
export function normalizeEmail(email?: string | null): string | null {
  if (!email || !email.trim()) return null;
  return email.trim().toLowerCase();
}

/**
 * Checks whether a Click ID (gclid/gbraid/wbraid) has exceeded Google Ads 90-day lifetime.
 */
export function isClickIdExpired(conversionDateTime: string, maxAgeDays = 90): boolean {
  if (!conversionDateTime) return false;
  try {
    const convTime = new Date(conversionDateTime).getTime();
    if (isNaN(convTime)) return false;
    const ageMs = Date.now() - convTime;
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    return ageMs > maxAgeMs;
  } catch {
    return false;
  }
}

// In-memory durable buffer for runtime outbox processing
const memoryConversionQueue: Map<string, OfflineConversionQueueItem> = new Map();

/**
 * Enqueues an offline conversion for durable background or synchronous dispatch.
 */
export function enqueueOfflineConversion(
  input: Omit<OfflineConversionQueueItem, 'id' | 'status' | 'attempts' | 'createdAt'>
): OfflineConversionQueueItem {
  const id = `conv_outbox_${randomUUID()}`;
  const normalizedPhone = normalizeE164Phone(input.phone);
  const normalizedEmail = normalizeEmail(input.email);

  const item: OfflineConversionQueueItem = {
    ...input,
    email: normalizedEmail,
    phone: normalizedPhone,
    id,
    status: 'pending',
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  memoryConversionQueue.set(id, item);
  return item;
}

/**
 * Executes an offline conversion upload with automatic retry and error logging.
 * Includes 90-day Click ID expiration guard with automatic Enhanced Conversions fallback.
 */
export async function processOfflineConversionItem(
  item: OfflineConversionQueueItem,
  maxAttempts = 3
): Promise<OfflineConversionResult> {
  item.attempts += 1;

  const isExpired = isClickIdExpired(item.conversionDateTime, 90);
  const effectiveGclid = isExpired ? undefined : item.gclid;
  const effectiveGbraid = isExpired ? undefined : item.gbraid;
  const effectiveWbraid = isExpired ? undefined : item.wbraid;

  const uploadParams: OfflineConversionParams = {
    gclid: effectiveGclid,
    gbraid: effectiveGbraid,
    wbraid: effectiveWbraid,
    conversionActionName: item.conversionActionName,
    conversionDateTime: item.conversionDateTime,
    conversionValueDollars: item.conversionValueDollars,
    currencyCode: item.currencyCode,
    orderId: item.orderId,
    email: item.email,
    phone: item.phone,
    firstName: item.firstName,
    lastName: item.lastName,
    postalCode: item.postalCode,
    clientCustomerId: item.clientCustomerId,
  };

  try {
    const result = await uploadOfflineConversion(uploadParams);
    if (result.success) {
      item.status = 'uploaded';
      item.uploadedAt = new Date().toISOString();
      item.lastError = undefined;
    } else {
      item.status = item.attempts >= maxAttempts ? 'failed' : 'pending';
      item.lastError = result.message;
    }
    return result;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    item.status = item.attempts >= maxAttempts ? 'failed' : 'pending';
    item.lastError = errMsg;
    return {
      success: false,
      gclid: effectiveGclid,
      gbraid: effectiveGbraid,
      wbraid: effectiveWbraid,
      conversionValueDollars: item.conversionValueDollars,
      enhancedConversionsActive: Boolean(item.email || item.phone),
      uploadedAt: new Date().toISOString(),
      message: `Conversion upload error (attempt ${item.attempts}/${maxAttempts}): ${errMsg}`,
    };
  }
}

/**
 * Flushes all pending conversion items in the outbox.
 */
export async function flushOfflineConversionQueue(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  let succeeded = 0;
  let failed = 0;
  const pendingItems = Array.from(memoryConversionQueue.values()).filter((i) => i.status === 'pending');

  for (const item of pendingItems) {
    const res = await processOfflineConversionItem(item);
    if (res.success) {
      succeeded += 1;
    } else {
      failed += 1;
    }
  }

  return {
    processed: pendingItems.length,
    succeeded,
    failed,
  };
}

/**
 * High-level helper to trigger a durable won-job conversion from lead closure.
 */
export async function syncLeadWonConversion(params: {
  accountId: string;
  leadId: string;
  wonValueDollars: number;
  currencyCode?: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  postalCode?: string | null;
  conversionActionName?: string;
  clientCustomerId?: string;
}): Promise<OfflineConversionResult> {
  const {
    accountId,
    leadId,
    wonValueDollars,
    currencyCode = 'USD',
    gclid,
    gbraid,
    wbraid,
    email,
    phone,
    firstName,
    lastName,
    postalCode,
    conversionActionName = params.conversionActionName
      || process.env.GOOGLE_ADS_CONVERSION_ACTION_ID_WON_JOB
      || process.env.GOOGLE_ADS_CONVERSION_ACTION_WON_JOB
      || 'Job Won',
    clientCustomerId,
  } = params;

  const item = enqueueOfflineConversion({
    accountId,
    leadId,
    orderId: leadId,
    conversionActionName,
    conversionValueDollars: wonValueDollars,
    currencyCode,
    conversionDateTime: new Date().toISOString().replace('T', ' ').replace('Z', '+00:00'),
    gclid,
    gbraid,
    wbraid,
    email,
    phone,
    firstName,
    lastName,
    postalCode,
    clientCustomerId,
  });

  return await processOfflineConversionItem(item);
}

/**
 * Durably triggers offline conversion synchronization for a lead that was won.
 * Persists status directly on the lead's triage JSONB column in Supabase.
 */
export async function triggerWonLeadOfflineConversion(
  admin: SupabaseClient,
  accountId: string,
  lead: Lead,
  wonValueDollars = 500
): Promise<{ triggered: boolean; status: 'uploaded' | 'pending' | 'skipped' | 'failed'; message?: string }> {
  const triage = (lead.triage as Record<string, unknown>) || {};
  const existingConv = (triage.offlineConversion as Record<string, unknown>) || {};

  // Idempotency: if already uploaded, do not re-upload
  if (existingConv.status === 'uploaded') {
    return { triggered: false, status: 'uploaded', message: 'Already uploaded.' };
  }

  // Extract attribution click ID if present
  const attribution = (triage.attribution as Record<string, unknown>) || {};
  const clickId = (attribution.clickId as string) || (attribution.gclid as string) || undefined;
  const clickIdType = (attribution.clickIdType as string) || (clickId ? 'gclid' : undefined);

  const gclid = clickIdType === 'gclid' ? clickId : undefined;
  const gbraid = clickIdType === 'gbraid' ? clickId : (attribution.gbraid as string) || undefined;
  const wbraid = clickIdType === 'wbraid' ? clickId : (attribution.wbraid as string) || undefined;

  const email = lead.email || null;
  const phone = lead.phone || null;

  // If there is neither click ID nor customer match data, skip
  if (!gclid && !gbraid && !wbraid && !email && !phone) {
    return { triggered: false, status: 'skipped', message: 'No click ID or customer data to match.' };
  }

  // Parse name into first and last
  let firstName: string | null = null;
  let lastName: string | null = null;
  if (lead.name) {
    const parts = lead.name.trim().split(/\s+/);
    firstName = parts[0] || null;
    lastName = parts.slice(1).join(' ') || null;
  }

  // Extract postal code from address if available
  let postalCode: string | null = null;
  if (lead.address) {
    const zipMatch = /\b\d{5}(?:-\d{4})?\b/.exec(lead.address);
    if (zipMatch) postalCode = zipMatch[0];
  }

  // Record pending status durably in database before attempting dispatch
  const currentAttempts = ((existingConv.attempts as number) || 0) + 1;
  const pendingRecord = {
    status: 'pending',
    attempts: currentAttempts,
    lastAttemptAt: new Date().toISOString(),
    gclid,
    gbraid,
    wbraid,
    wonValueDollars,
  };

  await admin
    .from('leads')
    .update({
      triage: {
        ...triage,
        offlineConversion: pendingRecord,
      },
    })
    .eq('id', lead.id);

  // Dispatch upload
  const result = await syncLeadWonConversion({
    accountId,
    leadId: lead.id,
    wonValueDollars,
    gclid,
    gbraid,
    wbraid,
    email,
    phone,
    firstName,
    lastName,
    postalCode,
  });

  // Update lead with durable result
  const finalStatus = result.success ? 'uploaded' : (currentAttempts >= 3 ? 'failed' : 'pending');
  await admin
    .from('leads')
    .update({
      triage: {
        ...triage,
        offlineConversion: {
          ...pendingRecord,
          status: finalStatus,
          uploadedAt: result.success ? result.uploadedAt : undefined,
          lastError: result.success ? undefined : result.message,
        },
      },
    })
    .eq('id', lead.id);

  return {
    triggered: true,
    status: finalStatus,
    message: result.message,
  };
}

/**
 * Retries all pending offline conversions recorded on leads.
 * Called by scheduled cron jobs (e.g. ad-spend-sync).
 */
export async function retryPendingOfflineConversions(
  admin: SupabaseClient,
  limit = 20
): Promise<{ processed: number; succeeded: number; failed: number }> {
  // Query leads with pending offline conversions
  const { data: leads, error } = await admin
    .from('leads')
    .select('*')
    .eq('status', 'won')
    .eq('triage->offlineConversion->>status', 'pending')
    .limit(limit);

  if (error || !leads || leads.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;

  for (const lead of leads as Lead[]) {
    try {
      const res = await triggerWonLeadOfflineConversion(admin, lead.account_id, lead);
      if (res.status === 'uploaded') succeeded++;
      else failed++;
    } catch {
      failed++;
    }
  }

  return { processed: leads.length, succeeded, failed };
}
