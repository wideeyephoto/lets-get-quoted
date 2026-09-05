/**
 * Durable Closed-Loop Meta Conversions API (CAPI) Outbox.
 *
 * Persists, deduplicates, and retries offline Purchase events (fbclid, hashed email/phone)
 * when leads are closed and won.
 */

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Lead } from './leads';
import {
  buildMetaCapiPurchaseEvent,
  uploadMetaCapiEvents,
  type MetaCapiEventPayload,
  type MetaCapiUploadResult,
  type OfflineConversionInput,
} from './ad-closed-loop-sync';

export type MetaCapiQueueItem = {
  id: string;
  accountId: string;
  leadId?: string;
  orderId: string;
  amountDollars: number;
  currency: string;
  fbclid?: string;
  email?: string | null;
  phone?: string | null;
  trade?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
  eventSourceUrl?: string | null;
  pixelId?: string;
  status: 'pending' | 'uploaded' | 'failed';
  attempts: number;
  lastError?: string;
  createdAt: string;
  uploadedAt?: string;
};

// In-memory buffer for runtime processing
const memoryMetaCapiQueue: Map<string, MetaCapiQueueItem> = new Map();

/**
 * Enqueues a Meta CAPI offline conversion event for durable dispatch.
 */
export function enqueueMetaCapiConversion(
  input: Omit<MetaCapiQueueItem, 'id' | 'status' | 'attempts' | 'createdAt'>
): MetaCapiQueueItem {
  const id = `capi_outbox_${randomUUID()}`;
  const item: MetaCapiQueueItem = {
    ...input,
    id,
    status: 'pending',
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  memoryMetaCapiQueue.set(id, item);
  return item;
}

/**
 * Dispatches an offline conversion item to Meta CAPI with retry logic.
 */
export async function processMetaCapiConversionItem(
  item: MetaCapiQueueItem,
  maxAttempts = 3
): Promise<MetaCapiUploadResult> {
  item.attempts += 1;

  const input: OfflineConversionInput = {
    transactionId: item.orderId,
    accountId: item.accountId,
    amountDollars: item.amountDollars,
    currency: item.currency,
    customerEmail: item.email,
    customerPhone: item.phone,
    fbclid: item.fbclid,
    clientIpAddress: item.clientIpAddress,
    clientUserAgent: item.clientUserAgent,
    eventSourceUrl: item.eventSourceUrl,
    trade: item.trade,
  };

  const payload: MetaCapiEventPayload = buildMetaCapiPurchaseEvent(input);

  try {
    const result = await uploadMetaCapiEvents({
      events: [payload],
      pixelId: item.pixelId,
    });

    if (result.success) {
      item.status = 'uploaded';
      item.uploadedAt = new Date().toISOString();
      item.lastError = undefined;
    } else {
      item.status = item.attempts >= maxAttempts ? 'failed' : 'pending';
      item.lastError = result.message;
    }

    return result;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    item.status = item.attempts >= maxAttempts ? 'failed' : 'pending';
    item.lastError = errMsg;
    return {
      success: false,
      status: 'failed',
      message: `Meta CAPI upload error (attempt ${item.attempts}/${maxAttempts}): ${errMsg}`,
    };
  }
}

/**
 * High-level helper to trigger an immediate Meta CAPI won-job conversion.
 */
export async function syncLeadWonMetaCapiConversion(params: {
  accountId: string;
  leadId: string;
  wonValueDollars: number;
  currency?: string;
  fbclid?: string;
  email?: string | null;
  phone?: string | null;
  trade?: string | null;
  pixelId?: string;
}): Promise<MetaCapiUploadResult> {
  const {
    accountId,
    leadId,
    wonValueDollars,
    currency = 'USD',
    fbclid,
    email,
    phone,
    trade,
    pixelId,
  } = params;

  const item = enqueueMetaCapiConversion({
    accountId,
    leadId,
    orderId: leadId,
    amountDollars: wonValueDollars,
    currency,
    fbclid,
    email,
    phone,
    trade,
    pixelId,
  });

  return await processMetaCapiConversionItem(item);
}

/**
 * Durably triggers Meta CAPI offline conversion synchronization for a lead that was won.
 * Persists status directly on the lead's triage JSONB column in Supabase under `metaOfflineConversion`.
 */
export async function triggerWonLeadMetaCapiConversion(
  admin: SupabaseClient,
  accountId: string,
  lead: Lead,
  wonValueDollars = 500
): Promise<{ triggered: boolean; status: 'uploaded' | 'pending' | 'skipped' | 'failed'; message?: string }> {
  const triage = (lead.triage as Record<string, unknown>) || {};
  const existingConv = (triage.metaOfflineConversion as Record<string, unknown>) || {};

  // Idempotency: if already uploaded, do not re-upload
  if (existingConv.status === 'uploaded') {
    return { triggered: false, status: 'uploaded', message: 'Already uploaded to Meta CAPI.' };
  }

  // Extract attribution click ID if present
  const attribution = (triage.attribution as Record<string, unknown>) || {};
  const clickId = (attribution.clickId as string) || undefined;
  const clickIdType = (attribution.clickIdType as string) || undefined;

  const fbclid =
    (attribution.fbclid as string) ||
    (clickIdType === 'fbclid' ? clickId : undefined) ||
    undefined;

  const email = lead.email || null;
  const phone = lead.phone || null;

  // If there is neither fbclid nor email/phone customer matching data, skip
  if (!fbclid && !email && !phone) {
    return { triggered: false, status: 'skipped', message: 'No fbclid or customer contact data to match with Meta CAPI.' };
  }

  const currentAttempts = ((existingConv.attempts as number) || 0) + 1;
  const pendingRecord = {
    status: 'pending',
    attempts: currentAttempts,
    lastAttemptAt: new Date().toISOString(),
    fbclid,
    wonValueDollars,
  };

  // Record pending status durably in database before attempting dispatch
  await admin
    .from('leads')
    .update({
      triage: {
        ...triage,
        metaOfflineConversion: pendingRecord,
      },
    })
    .eq('id', lead.id);

  // Dispatch upload
  const result = await syncLeadWonMetaCapiConversion({
    accountId,
    leadId: lead.id,
    wonValueDollars,
    fbclid,
    email,
    phone,
    trade: lead.project_type || undefined,
  });

  const finalStatus = result.success ? 'uploaded' : currentAttempts >= 3 ? 'failed' : 'pending';
  await admin
    .from('leads')
    .update({
      triage: {
        ...triage,
        metaOfflineConversion: {
          ...pendingRecord,
          status: finalStatus,
          uploadedAt: result.success ? new Date().toISOString() : undefined,
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
 * Retries all pending Meta CAPI conversions recorded on won leads.
 * Called by scheduled cron jobs (e.g. ad-spend-sync).
 */
export async function retryPendingMetaCapiConversions(
  admin: SupabaseClient,
  limit = 20
): Promise<{ processed: number; succeeded: number; failed: number }> {
  const { data: leads, error } = await admin
    .from('leads')
    .select('*')
    .eq('status', 'won')
    .eq('triage->metaOfflineConversion->>status', 'pending')
    .limit(limit);

  if (error || !leads || leads.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;

  for (const lead of leads as Lead[]) {
    try {
      const res = await triggerWonLeadMetaCapiConversion(admin, lead.account_id, lead);
      if (res.status === 'uploaded') succeeded++;
      else failed++;
    } catch {
      failed++;
    }
  }

  return { processed: leads.length, succeeded, failed };
}
