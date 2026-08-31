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
 * Atomically suspends the account, deactivates memberships, cancels queued SMS, and registers the closure job.
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
): Promise<Record<string, unknown> | null> {
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
  existingClaimToken?: string,
): Promise<{ success: boolean; completed: boolean; errors: string[] }> {
  const errors: string[] = [];
  const leaseToken = existingClaimToken || crypto.randomUUID();

  // 1. Fetch current job record
  const { data: job, error: fetchError } = await admin
    .from('account_closure_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (fetchError || !job) {
    return { success: false, completed: false, errors: [`Closure job ${jobId} not found`] };
  }

  let currentVersion = job.version;
  const accountId = job.closure_subject_id;
  const handles = decryptVendorHandles(job.encrypted_vendor_handles);

  // 2. Track A: Local Data Disposal
  if (job.local_disposal_state !== 'completed') {
    try {
      // Check legal hold on account (Fail-Closed)
      const { data: acct, error: acctErr } = await admin
        .from('accounts')
        .select('legal_hold')
        .eq('id', accountId)
        .single();

      if (acctErr) {
        throw new Error(`Failed to check account legal_hold status: ${acctErr.message}`);
      }

      const isLegalHold = Boolean(acct?.legal_hold);
      if (isLegalHold) {
        throw new Error(`Account ${accountId} is under active legal hold; local disposal suspended.`);
      }

      // Execute disposal using schema-verified disposition registry
      for (const [table, disposition] of Object.entries(DATA_DISPOSITION_REGISTRY)) {
        if (disposition.localAction === 'delete') {
          if (disposition.relationship === 'direct_account_id') {
            const { error: delErr } = await admin.from(table).delete().eq('account_id', accountId);
            if (delErr && delErr.code !== '42P01') {
              throw new Error(`Disposal delete on ${table} failed: ${delErr.message}`);
            }
          } else if (disposition.relationship === 'fk_chain' && disposition.fkPath && disposition.fkPath.length >= 2) {
            const [foreignKey, parentPath] = disposition.fkPath;
            const [parentTable, parentAccountIdCol] = parentPath.split('.');
            try {
              const { data: parentRows } = await admin
                .from(parentTable)
                .select('id')
                .eq(parentAccountIdCol || 'account_id', accountId);
              const parentIds = (parentRows ?? []).map((r: { id: string }) => r.id).filter(Boolean);
              if (parentIds.length > 0) {
                const { error: delErr } = await admin.from(table).delete().in(foreignKey, parentIds);
                if (delErr && delErr.code !== '42P01') {
                  throw new Error(`Disposal delete on ${table} failed: ${delErr.message}`);
                }
              }
            } catch (fkErr) {
              if (fkErr instanceof Error && !fkErr.message.includes('42P01')) {
                throw fkErr;
              }
            }
          }
        } else if (disposition.localAction === 'anonymize_columns' && disposition.targetColumns?.length) {
          const anonymizedFields: Record<string, unknown> = {};
          for (const col of disposition.targetColumns) {
            anonymizedFields[col] = '[REDACTED_CLOSED_ACCOUNT]';
          }

          let query = admin.from(table).update(anonymizedFields);
          if (disposition.relationship === 'account_primary_key') {
            query = query.eq(disposition.primaryKeyColumn || 'id', accountId);
          } else {
            query = query.eq('account_id', accountId);
          }

          const { error: updErr } = await query;
          if (updErr && updErr.code !== '42P01') {
            throw new Error(`Disposal anonymize on ${table} failed: ${updErr.message}`);
          }
        }
      }

      // Fenced stage update for local disposal
      const { data: ok, error: stageErr } = await admin.rpc('update_closure_job_stage', {
        p_job_id: jobId,
        p_lease_token: leaseToken,
        p_expected_version: currentVersion,
        p_stage: 'local_disposal',
        p_status: 'completed',
      });

      if (stageErr || !ok) {
        throw new Error(`Fenced update failed for local disposal: ${stageErr?.message}`);
      }
      currentVersion += 1;
    } catch (err) {
      const msg = `Local data disposal failed: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      await admin.rpc('update_closure_job_stage', {
        p_job_id: jobId,
        p_lease_token: leaseToken,
        p_expected_version: currentVersion,
        p_stage: 'local_disposal',
        p_status: 'failed',
        p_last_error: msg,
      });
      currentVersion += 1;
    }
  }

  // 3. Track B: Vendor Cleanups (Retriable)
  if (handles?.stripeCustomerId && job.stripe_state !== 'success' && job.stripe_state !== 'not_applicable') {
    try {
      const ok = adapters?.stripeCancel ? await adapters.stripeCancel(handles.stripeCustomerId) : true;
      if (ok) {
        handles.stripeCustomerId = null;
        handles.stripeSubscriptionId = null;
        const { data: stageOk, error: stageErr } = await admin.rpc('update_closure_job_stage', {
          p_job_id: jobId,
          p_lease_token: leaseToken,
          p_expected_version: currentVersion,
          p_stage: 'stripe',
          p_status: 'success',
          p_encrypted_handles: encryptVendorHandles(handles),
        });
        if (stageErr || !stageOk) throw new Error(`Fenced update failed for Stripe: ${stageErr?.message}`);
        currentVersion += 1;
      } else {
        throw new Error('Stripe cleanup adapter returned false');
      }
    } catch (err) {
      const msg = `Stripe cleanup error: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      await admin.rpc('update_closure_job_stage', {
        p_job_id: jobId,
        p_lease_token: leaseToken,
        p_expected_version: currentVersion,
        p_stage: 'stripe',
        p_status: 'retry',
        p_last_error: msg,
      });
      currentVersion += 1;
    }
  }

  if (handles?.quickbooksRealmId && job.quickbooks_state !== 'success' && job.quickbooks_state !== 'not_applicable') {
    try {
      const ok = adapters?.quickbooksRevoke ? await adapters.quickbooksRevoke(handles.quickbooksRealmId) : true;
      if (ok) {
        handles.quickbooksRealmId = null;
        const { data: stageOk, error: stageErr } = await admin.rpc('update_closure_job_stage', {
          p_job_id: jobId,
          p_lease_token: leaseToken,
          p_expected_version: currentVersion,
          p_stage: 'quickbooks',
          p_status: 'success',
          p_encrypted_handles: encryptVendorHandles(handles),
        });
        if (stageErr || !stageOk) throw new Error(`Fenced update failed for QuickBooks: ${stageErr?.message}`);
        currentVersion += 1;
      } else {
        throw new Error('QuickBooks revokeToken returned false');
      }
    } catch (err) {
      const msg = `QuickBooks cleanup error: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      await admin.rpc('update_closure_job_stage', {
        p_job_id: jobId,
        p_lease_token: leaseToken,
        p_expected_version: currentVersion,
        p_stage: 'quickbooks',
        p_status: 'retry',
        p_last_error: msg,
      });
      currentVersion += 1;
    }
  }

  if (handles?.storageFolderPrefix && job.storage_state !== 'success' && job.storage_state !== 'not_applicable') {
    try {
      const ok = adapters?.storageDelete ? await adapters.storageDelete(handles.storageFolderPrefix) : true;
      if (ok) {
        handles.storageFolderPrefix = null;
        const { data: stageOk, error: stageErr } = await admin.rpc('update_closure_job_stage', {
          p_job_id: jobId,
          p_lease_token: leaseToken,
          p_expected_version: currentVersion,
          p_stage: 'storage',
          p_status: 'success',
          p_encrypted_handles: encryptVendorHandles(handles),
        });
        if (stageErr || !stageOk) throw new Error(`Fenced update failed for Storage: ${stageErr?.message}`);
        currentVersion += 1;
      } else {
        throw new Error('Storage deletion returned false');
      }
    } catch (err) {
      const msg = `Storage cleanup error: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      await admin.rpc('update_closure_job_stage', {
        p_job_id: jobId,
        p_lease_token: leaseToken,
        p_expected_version: currentVersion,
        p_stage: 'storage',
        p_status: 'retry',
        p_last_error: msg,
      });
      currentVersion += 1;
    }
  }

  // 4. Track C: Multi-Tenant Safe Auth Identity Cleanup
  if (job.auth_cleanup_state !== 'success' && job.auth_cleanup_state !== 'not_applicable') {
    try {
      const ownerUserIds = handles?.ownerUserIds ?? [];
      for (const userId of ownerUserIds) {
        const { data: otherCount, error: rpcError } = await admin.rpc('check_user_active_memberships', {
          p_user_id: userId,
          p_closing_account_id: accountId,
        });

        if (rpcError || otherCount === null || typeof otherCount === 'undefined') {
          throw new Error(`Failed to check user memberships for ${userId}: ${rpcError?.message ?? 'Null count returned'}`);
        }

        if (Number(otherCount) === 0) {
          const { error: delErr } = await admin.auth.admin.deleteUser(userId);
          if (delErr) {
            throw new Error(`Failed to delete Auth identity for ${userId}: ${delErr.message}`);
          }
        }
      }

      const { data: stageOk, error: stageErr } = await admin.rpc('update_closure_job_stage', {
        p_job_id: jobId,
        p_lease_token: leaseToken,
        p_expected_version: currentVersion,
        p_stage: 'auth_cleanup',
        p_status: 'success',
      });
      if (stageErr || !stageOk) throw new Error(`Fenced update failed for Auth: ${stageErr?.message}`);
      currentVersion += 1;
    } catch (err) {
      const msg = `Auth cleanup error: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      await admin.rpc('update_closure_job_stage', {
        p_job_id: jobId,
        p_lease_token: leaseToken,
        p_expected_version: currentVersion,
        p_stage: 'auth_cleanup',
        p_status: 'retry',
        p_last_error: msg,
      });
      currentVersion += 1;
    }
  }

  // 5. Final Terminal Completion Gate
  const { data: latestJob } = await admin
    .from('account_closure_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  const allVendorsResolved =
    ['success', 'not_applicable'].includes(latestJob?.stripe_state) &&
    ['success', 'not_applicable'].includes(latestJob?.quickbooks_state) &&
    ['success', 'not_applicable'].includes(latestJob?.storage_state) &&
    ['success', 'not_applicable'].includes(latestJob?.auth_cleanup_state);

  let completed = false;
  if (latestJob?.local_disposal_state === 'completed' && allVendorsResolved) {
    const { data: compOk } = await admin.rpc('complete_closure_job', {
      p_job_id: jobId,
      p_lease_token: leaseToken,
      p_expected_version: currentVersion,
      p_manifest: {
        closure_subject_id: accountId,
        completed_at: new Date().toISOString(),
        status: 'verified_completed',
      },
    });
    completed = Boolean(compOk);
  }

  return { success: errors.length === 0, completed, errors };
}

export function buildProductionClosureAdapters(admin: SupabaseClient): ClosureAdapters {
  return {
    stripeCancel: async (customerId: string) => {
      try {
        const { getStripeClient } = await import('@/lib/stripe');
        const stripe = getStripeClient();
        if (!stripe) return true;
        const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
        for (const sub of subs.data) {
          if (sub.status !== 'canceled') {
            await stripe.subscriptions.cancel(sub.id);
          }
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
        const { KNOWN_STORAGE_BUCKETS } = await import('@/lib/account-deletion-saga');
        for (const bucket of KNOWN_STORAGE_BUCKETS) {
          const queue: string[] = [prefix];
          const allFiles: string[] = [];

          while (queue.length > 0) {
            const currentPrefix = queue.shift()!;
            let offset = 0;
            const limit = 100;
            let hasMore = true;

            while (hasMore) {
              const { data, error: listErr } = await admin.storage.from(bucket).list(currentPrefix, {
                limit,
                offset,
              });

              if (listErr) {
                const isNotFound = listErr.message?.toLowerCase().includes('not found') ||
                  (listErr as { statusCode?: string | number })?.statusCode === 404 ||
                  (listErr as { status?: number })?.status === 404;
                if (isNotFound) {
                  hasMore = false;
                  break;
                }
                console.error(`Storage list error on bucket ${bucket}:`, listErr.message);
                return false;
              }

              if (!data || data.length === 0) {
                hasMore = false;
                break;
              }

              for (const item of data) {
                const fullPath = currentPrefix ? `${currentPrefix}/${item.name}` : item.name;
                if (item.id === null) {
                  queue.push(fullPath);
                } else {
                  allFiles.push(fullPath);
                }
              }

              if (data.length < limit) {
                hasMore = false;
              } else {
                offset += limit;
              }
            }
          }

          if (allFiles.length > 0) {
            for (let i = 0; i < allFiles.length; i += 100) {
              const chunk = allFiles.slice(i, i + 100);
              const { error: delErr } = await admin.storage.from(bucket).remove(chunk);
              if (delErr) {
                console.error(`Storage delete error on ${bucket}:`, delErr.message);
                return false;
              }
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

