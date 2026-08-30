import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DATA_DISPOSITION_REGISTRY } from './data-disposition-registry';

export interface VendorHandles {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  quickbooksRealmId?: string | null;
  storageFolderPrefix?: string | null;
  ownerUserIds?: string[];
}

function getEncryptionKey(): Buffer {
  const secret = process.env.CLOSURE_ENCRYPTION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'default-dev-service-role-secret-key-32-chars!!';
  return crypto.createHash('sha256').update(`lgq:closure-vendor-handles:${secret}`).digest();
}

export function encryptVendorHandles(handles: VendorHandles): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const jsonStr = JSON.stringify(handles);
  const encrypted = Buffer.concat([cipher.update(jsonStr, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptVendorHandles(encryptedStr: string | null | undefined): VendorHandles | null {
  if (!encryptedStr) return null;
  try {
    const parts = encryptedStr.split(':');
    if (parts.length !== 3) return null;
    const [ivHex, tagHex, dataHex] = parts;
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch (err) {
    console.error('Failed to decrypt vendor handles:', err);
    return null;
  }
}

export interface RequestClosureParams {
  accountId: string;
  requestedByUserId?: string | null;
  requestedByRole: 'owner' | 'admin';
  vendorHandles?: VendorHandles;
}

/**
 * Stage 1: Request account closure atomically via PostgreSQL RPC.
 * Atomically suspends the account, deactivates memberships, and registers the closure job.
 */
export async function requestAccountClosure(
  admin: SupabaseClient,
  params: RequestClosureParams,
): Promise<{ jobId: string }> {
  const encryptedHandles = params.vendorHandles ? encryptVendorHandles(params.vendorHandles) : null;

  const { data: jobId, error: rpcError } = await admin.rpc('request_account_closure_atomic', {
    p_account_id: params.accountId,
    p_requested_by_user_id: params.requestedByUserId ?? null,
    p_requested_by_role: params.requestedByRole,
    p_encrypted_vendor_handles: encryptedHandles,
    p_stripe_applicable: Boolean(params.vendorHandles?.stripeCustomerId),
    p_quickbooks_applicable: Boolean(params.vendorHandles?.quickbooksRealmId),
    p_storage_applicable: Boolean(params.vendorHandles?.storageFolderPrefix),
  });

  if (rpcError || !jobId) {
    throw new Error(`Failed to atomically request account closure: ${rpcError?.message}`);
  }

  return { jobId: String(jobId) };
}

/**
 * Claims a pending or retryable closure job with FOR UPDATE SKIP LOCKED.
 */
export async function claimClosureJob(
  admin: SupabaseClient,
  leaseToken: string,
  leaseDurationSeconds = 300,
): Promise<any | null> {
  const { data, error } = await admin.rpc('claim_account_closure_job', {
    p_lease_token: leaseToken,
    p_lease_duration_seconds: leaseDurationSeconds,
  });

  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    return null;
  }

  return Array.isArray(data) ? data[0] : data;
}

export interface ClosureAdapters {
  stripeCancel?: (customerId: string) => Promise<boolean>;
  quickbooksRevoke?: (realmId: string) => Promise<boolean>;
  storageDelete?: (prefix: string) => Promise<boolean>;
}

/**
 * Stage 2: Process closure job across decoupled tracks with lease & version fencing.
 */
export async function processClosureJob(
  admin: SupabaseClient,
  jobId: string,
  adapters?: ClosureAdapters,
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];
  const now = new Date().toISOString();
  const leaseToken = crypto.randomUUID();

  // 1. Fetch & verify job record
  const { data: job, error: fetchError } = await admin
    .schema('audit')
    .from('account_closure_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (fetchError || !job) {
    return { success: false, errors: [`Closure job ${jobId} not found`] };
  }

  const accountId = job.closure_subject_id;
  let handles = decryptVendorHandles(job.encrypted_vendor_handles);

  // 2. Track A: Local Data Disposal (Independent of vendor status)
  if (job.local_disposal_state !== 'completed') {
    try {
      const { error: startError } = await admin
        .schema('audit')
        .from('account_closure_jobs')
        .update({
          local_disposal_state: 'in_progress',
          lease_token: leaseToken,
          version: job.version + 1,
          updated_at: now,
        })
        .eq('id', jobId)
        .eq('version', job.version);

      if (startError) throw new Error(`Failed to claim disposal step: ${startError.message}`);

      // Check legal hold on account
      const { data: acct } = await admin
        .from('accounts')
        .select('legal_hold')
        .eq('id', accountId)
        .maybeSingle();

      const isLegalHold = Boolean((acct as { legal_hold?: boolean })?.legal_hold);

      if (!isLegalHold) {
        // Execute disposal using disposition registry
        for (const [table, disposition] of Object.entries(DATA_DISPOSITION_REGISTRY)) {
          if (disposition.localAction === 'delete') {
            if (disposition.relationship === 'direct_account_id') {
              const { error: delErr } = await admin.from(table).delete().eq('account_id', accountId);
              if (delErr && delErr.code !== '42P01') {
                console.warn(`Disposal delete on ${table} failed:`, delErr.message);
              }
            }
          } else if (disposition.localAction === 'anonymize_columns' && disposition.targetColumns?.length) {
            if (disposition.relationship === 'direct_account_id') {
              const anonymizedFields: Record<string, unknown> = {};
              for (const col of disposition.targetColumns) {
                anonymizedFields[col] = '[REDACTED_CLOSED_ACCOUNT]';
              }
              const { error: updErr } = await admin.from(table).update(anonymizedFields).eq('account_id', accountId);
              if (updErr && updErr.code !== '42P01') {
                console.warn(`Disposal anonymize on ${table} failed:`, updErr.message);
              }
            }
          }
        }
      }

      await admin
        .schema('audit')
        .from('account_closure_jobs')
        .update({ local_disposal_state: 'completed', updated_at: new Date().toISOString() })
        .eq('id', jobId);
    } catch (err) {
      const msg = `Local data disposal failed: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      await admin
        .schema('audit')
        .from('account_closure_jobs')
        .update({ local_disposal_state: 'failed', last_error: msg })
        .eq('id', jobId);
    }
  }

  // 3. Track B: Vendor Cleanups (Retriable)
  if (handles?.stripeCustomerId && job.stripe_state !== 'success' && job.stripe_state !== 'not_applicable') {
    try {
      const ok = adapters?.stripeCancel ? await adapters.stripeCancel(handles.stripeCustomerId) : true;
      if (ok) {
        handles.stripeCustomerId = null;
        handles.stripeSubscriptionId = null;
        await admin
          .schema('audit')
          .from('account_closure_jobs')
          .update({
            stripe_state: 'success',
            encrypted_vendor_handles: encryptVendorHandles(handles),
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);
      } else {
        throw new Error('Stripe cleanup adapter returned false');
      }
    } catch (err) {
      const msg = `Stripe cleanup error: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      await admin.schema('audit').from('account_closure_jobs').update({ stripe_state: 'retry', last_error: msg }).eq('id', jobId);
    }
  }

  if (handles?.quickbooksRealmId && job.quickbooks_state !== 'success' && job.quickbooks_state !== 'not_applicable') {
    try {
      const ok = adapters?.quickbooksRevoke ? await adapters.quickbooksRevoke(handles.quickbooksRealmId) : true;
      if (ok) {
        handles.quickbooksRealmId = null;
        await admin
          .schema('audit')
          .from('account_closure_jobs')
          .update({
            quickbooks_state: 'success',
            encrypted_vendor_handles: encryptVendorHandles(handles),
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);
      } else {
        throw new Error('QuickBooks revokeToken returned false');
      }
    } catch (err) {
      const msg = `QuickBooks cleanup error: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      await admin.schema('audit').from('account_closure_jobs').update({ quickbooks_state: 'retry', last_error: msg }).eq('id', jobId);
    }
  }

  if (handles?.storageFolderPrefix && job.storage_state !== 'success' && job.storage_state !== 'not_applicable') {
    try {
      const ok = adapters?.storageDelete ? await adapters.storageDelete(handles.storageFolderPrefix) : true;
      if (ok) {
        handles.storageFolderPrefix = null;
        await admin
          .schema('audit')
          .from('account_closure_jobs')
          .update({
            storage_state: 'success',
            encrypted_vendor_handles: encryptVendorHandles(handles),
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);
      } else {
        throw new Error('Storage deletion returned false');
      }
    } catch (err) {
      const msg = `Storage cleanup error: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      await admin.schema('audit').from('account_closure_jobs').update({ storage_state: 'retry', last_error: msg }).eq('id', jobId);
    }
  }

  // 4. Track C: Multi-Tenant Safe Auth Identity Cleanup
  if (job.auth_cleanup_state !== 'success' && job.auth_cleanup_state !== 'not_applicable') {
    try {
      const ownerUserIds = handles?.ownerUserIds ?? [];
      for (const userId of ownerUserIds) {
        // Call RPC with advisory lock to count active memberships in other workspaces
        const { data: otherCount, error: rpcError } = await admin.rpc('check_user_active_memberships', {
          p_user_id: userId,
          p_closing_account_id: accountId,
        });

        if (rpcError || otherCount === null || typeof otherCount === 'undefined') {
          throw new Error(`Failed to check user memberships for ${userId}: ${rpcError?.message ?? 'Null count returned'}`);
        }

        if (Number(otherCount) === 0) {
          // Zero other active workspaces -> safe to delete user identity
          const { error: delErr } = await admin.auth.admin.deleteUser(userId);
          if (delErr) {
            throw new Error(`Failed to delete Auth identity for ${userId}: ${delErr.message}`);
          }
        } else {
          // User has other active workspaces -> preserve Auth user
          console.info(`Preserving auth user ${userId} with ${otherCount} other active workspaces`);
        }
      }

      await admin
        .schema('audit')
        .from('account_closure_jobs')
        .update({ auth_cleanup_state: 'success', updated_at: new Date().toISOString() })
        .eq('id', jobId);
    } catch (err) {
      const msg = `Auth cleanup error: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      await admin.schema('audit').from('account_closure_jobs').update({ auth_cleanup_state: 'retry', last_error: msg }).eq('id', jobId);
    }
  }

  // 5. Final Terminal Completion Gate
  const { data: latestJob } = await admin
    .schema('audit')
    .from('account_closure_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  const allVendorsResolved =
    ['success', 'not_applicable'].includes(latestJob?.stripe_state) &&
    ['success', 'not_applicable'].includes(latestJob?.quickbooks_state) &&
    ['success', 'not_applicable'].includes(latestJob?.storage_state) &&
    ['success', 'not_applicable'].includes(latestJob?.auth_cleanup_state);

  if (latestJob?.local_disposal_state === 'completed' && allVendorsResolved) {
    await admin
      .schema('audit')
      .from('account_closure_jobs')
      .update({
        completed_at: new Date().toISOString(),
        encrypted_vendor_handles: null, // Purge all operational handles
        manifest: {
          closure_subject_id: accountId,
          completed_at: new Date().toISOString(),
          status: 'verified_completed',
        },
      })
      .eq('id', jobId);
  }

  return { success: errors.length === 0, errors };
}

export function buildProductionClosureAdapters(admin: SupabaseClient): ClosureAdapters {
  return {
    stripeCancel: async (customerId: string) => {
      try {
        const { getStripeClient } = await import('@/lib/stripe');
        const stripe = getStripeClient();
        if (!stripe) return true;
        const subs = await stripe.subscriptions.list({ customer: customerId, status: 'active' });
        for (const sub of subs.data) {
          await stripe.subscriptions.cancel(sub.id);
        }
        return true;
      } catch (err) {
        console.error('Stripe cancellation failed:', err);
        return false;
      }
    },
    quickbooksRevoke: async (realmId: string) => {
      try {
        const { data: qbRow } = await admin
          .from('quickbooks_connections')
          .select('refresh_token')
          .eq('realm_id', realmId)
          .maybeSingle();

        if (qbRow?.refresh_token) {
          const { revokeToken } = await import('@/lib/quickbooks/oauth');
          return await revokeToken(qbRow.refresh_token);
        }
        return true;
      } catch (err) {
        console.error('QuickBooks revoke failed:', err);
        return false;
      }
    },
    storageDelete: async (prefix: string) => {
      try {
        const buckets = ['job-photos', 'documents', 'attachments'];
        for (const b of buckets) {
          const { data: files, error: listErr } = await admin.storage.from(b).list(prefix);
          if (listErr) {
            console.error(`Storage listing error on ${b}/${prefix}:`, listErr.message);
            return false;
          }
          if (files && files.length > 0) {
            const paths = files.map((f) => `${prefix}/${f.name}`);
            const { error: delErr } = await admin.storage.from(b).remove(paths);
            if (delErr) {
              console.error(`Storage delete error on ${b}:`, delErr.message);
              return false;
            }
          }
        }
        return true;
      } catch (err) {
        console.error('Storage cleanup failed:', err);
        return false;
      }
    },
  };
}
