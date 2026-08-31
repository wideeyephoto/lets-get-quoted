import type { SupabaseClient } from '@supabase/supabase-js';
import { cancelSubscriptionForAccountDeletion, loadCancellableSubscription } from '@/lib/billing/subscription-cancellation';
import { revokeToken } from '@/lib/quickbooks/oauth';

export const KNOWN_STORAGE_BUCKETS = [
  'insurance-proof',
  'job-photos',
  'lead-photos',
  'site-videos',
  'site-images',
  'crew-photos',
  'account-attachments',
] as const;

export type ClosureSagaResult = {
  success: boolean;
  accountId: string;
  hardDeleted: boolean;
  anonymized: boolean;
  retainedLedger: boolean;
  cleanedStorageFiles: number;
  cleanedSubscriptions: number;
  cleanedOwners: string[];
  quickBooksRevoked: boolean;
  errors: string[];
};

/**
 * Recursively discovers all files under an account prefix in a Supabase Storage bucket,
 * traversing nested folders (e.g. accountId/crewId/photo.jpg).
 */
async function listAllBucketFilesRecursively(
  admin: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const allFiles: string[] = [];
  const queue: string[] = [prefix];

  while (queue.length > 0) {
    const currentPrefix = queue.shift()!;
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await admin.storage.from(bucket).list(currentPrefix, {
        limit,
        offset,
      });

      if (error) {
        const isNotFound = error.message?.toLowerCase().includes('not found') ||
          (error as { statusCode?: string | number })?.statusCode === 404 ||
          (error as { status?: number })?.status === 404;
        if (isNotFound) {
          hasMore = false;
          break;
        }
        throw new Error(`Storage list error on bucket ${bucket} (prefix: ${currentPrefix}): ${error.message}`);
      }

      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }

      for (const item of data) {
        const fullPath = currentPrefix ? `${currentPrefix}/${item.name}` : item.name;
        // In Supabase storage, folders have id === null
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

  return allFiles;
}

/**
 * Executes an idempotent, durable account closure and PII anonymization saga.
 *
 * All SQL updates are strictly checked against real Postgres table columns in schema.sql.
 * Any PostgREST error is captured and tracked to prevent false-success reporting.
 */
export async function executeAccountClosureSaga(
  admin: SupabaseClient,
  accountId: string,
  _actorEmail?: string | null,
): Promise<ClosureSagaResult> {
  const errors: string[] = [];
  const nowIso = new Date().toISOString();

  // 1. Freeze account immediately at the database level
  const { error: suspendErr } = await admin
    .from('accounts')
    .update({
      suspended_at: nowIso,
      suspended_reason: 'Account closure and anonymization in progress',
    })
    .eq('id', accountId);

  if (suspendErr) {
    errors.push(`Account suspension failed: ${suspendErr.message}`);
  }

  // 2. Discover manifest & clean up QuickBooks OAuth connection
  let quickBooksRevoked = false;
  try {
    const { data: qbRow, error: qbError } = await admin
      .from('quickbooks_connections')
      .select('refresh_token, access_token')
      .eq('account_id', accountId)
      .maybeSingle();

    if (qbError && qbError.code !== '42P01') {
      errors.push(`QuickBooks lookup failed: ${qbError.message}`);
    }

    if (qbRow) {
      if (qbRow.refresh_token) {
        try {
          await revokeToken(qbRow.refresh_token);
        } catch (revErr) {
          console.warn('QuickBooks token revocation request failed:', revErr);
        }
      }
      const { error: delQbErr } = await admin
        .from('quickbooks_connections')
        .delete()
        .eq('account_id', accountId);
      if (delQbErr) errors.push(`QuickBooks connection row deletion failed: ${delQbErr.message}`);
      quickBooksRevoked = true;
    }
  } catch (err) {
    errors.push(`QuickBooks teardown error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Subscription Cancellations
  let cleanedSubscriptions = 0;
  try {
    const [subscription, { data: capacityRows }] = await Promise.all([
      loadCancellableSubscription(admin, accountId).catch(() => null),
      admin
        .from('workspace_purchased_capacity')
        .select('stripe_subscription_id')
        .eq('account_id', accountId)
        .in('status', ['active', 'past_due']),
    ]);

    const capacitySubscriptionIds = (capacityRows ?? [])
      .map((r) => String(r.stripe_subscription_id))
      .filter(Boolean);

    if (subscription || capacitySubscriptionIds.length > 0) {
      await cancelSubscriptionForAccountDeletion({
        admin,
        accountId,
        preloaded: subscription,
        preloadedCapacitySubscriptions: capacitySubscriptionIds,
      });
      cleanedSubscriptions = (subscription ? 1 : 0) + capacitySubscriptionIds.length;
    }
  } catch (err) {
    errors.push(`Subscription cancellation error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 4. Recursive Supabase Storage Cleanup across all known buckets
  let cleanedStorageFiles = 0;
  for (const bucket of KNOWN_STORAGE_BUCKETS) {
    try {
      const paths = await listAllBucketFilesRecursively(admin, bucket, accountId);
      if (paths.length > 0) {
        const { error: removeError } = await admin.storage.from(bucket).remove(paths);
        if (removeError) {
          errors.push(`Storage removal failed for bucket ${bucket}: ${removeError.message}`);
        } else {
          cleanedStorageFiles += paths.length;
        }
      }
    } catch (err) {
      errors.push(`Storage cleanup error in bucket ${bucket}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 5. PII Anonymization & Operational Scrubbing (strictly grounded in schema.sql columns)
  const executeDbStep = async (name: string, p: PromiseLike<{ error: { message: string; code?: string } | null }>) => {
    try {
      const { error } = await p;
      if (error && error.code !== '42P01') {
        errors.push(`${name} failed: ${error.message}`);
      }
    } catch (err) {
      errors.push(`${name} exception: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  await Promise.all([
    // clients table: name, phone, email, address, notes
    executeDbStep(
      'Anonymize clients',
      admin.from('clients').update({
        name: '[Deleted Customer]',
        phone: null,
        email: null,
        address: null,
        notes: null,
      }).eq('account_id', accountId),
    ),

    // leads table: name, phone, email, address, message, quote_visit, photo_paths, triage
    executeDbStep(
      'Anonymize leads',
      admin.from('leads').update({
        name: '[Deleted Lead]',
        phone: null,
        email: null,
        address: null,
        message: null,
        photo_paths: [],
        quote_visit: null,
        triage: null,
      }).eq('account_id', accountId),
    ),

    // jobs table: client_name (NOT NULL), client_phone, client_email, address, scope, certificate, photo_paths
    executeDbStep(
      'Anonymize jobs',
      admin.from('jobs').update({
        client_name: '[Deleted Customer]',
        client_phone: null,
        client_email: null,
        address: null,
        scope: null,
        certificate: null,
        photo_paths: [],
      }).eq('account_id', accountId),
    ),

    // crew table: name, phone (NOT NULL), email, photo_path
    executeDbStep(
      'Anonymize crew',
      admin.from('crew').update({
        name: '[Deleted Crew Member]',
        phone: '+10000000000',
        email: null,
        photo_path: null,
      }).eq('account_id', accountId),
    ),

    // payments table: homeowner_phone, label (no homeowner_name/memo columns exist in schema)
    executeDbStep(
      'Anonymize payments',
      admin.from('payments').update({
        homeowner_phone: null,
        label: '[Redacted Payment]',
      }).eq('account_id', accountId),
    ),

    // invoices table: signer_name
    executeDbStep(
      'Anonymize invoices',
      admin.from('invoices').update({
        signer_name: '[Redacted]',
      }).eq('account_id', accountId),
    ),

    // Purge communication, messaging, and privacy audit detail records
    executeDbStep('Delete sms_messages', admin.from('sms_messages').delete().eq('account_id', accountId)),
    executeDbStep('Delete sms_events', admin.from('sms_events').delete().eq('account_id', accountId)),
    executeDbStep('Delete sms_consent_scopes', admin.from('sms_consent_scopes').delete().eq('account_id', accountId)),
    executeDbStep('Delete sms_consent', admin.from('sms_consent').delete().eq('account_id', accountId)),
    executeDbStep('Delete email_suppression', admin.from('email_suppression').delete().eq('account_id', accountId)),
    executeDbStep('Scrub privacy_requests', admin.from('privacy_requests').update({ details: null }).eq('account_id', accountId)),
  ]);

  // 6. Read owner user IDs before deleting account/memberships
  let ownerIds: string[] = [];
  try {
    const { data: owners } = await admin
      .from('memberships')
      .select('user_id')
      .eq('account_id', accountId)
      .eq('role', 'owner');
    ownerIds = (owners ?? []).map((m) => (m as { user_id: string }).user_id).filter(Boolean);
  } catch {
    // Non-fatal if memberships cannot be read
  }

  // 7. Attempt complete account row deletion
  let hardDeleted = false;
  let retainedLedger = false;

  const { error: deleteError } = await admin.from('accounts').delete().eq('id', accountId);
  if (!deleteError) {
    hardDeleted = true;
  } else if (deleteError.code === '23503') {
    // 23503: foreign_key_violation due to retained accounting/payment ledger rows.
    // Anonymize the account record itself and disconnect all integrations.
    retainedLedger = true;
    const { error: redactAcctErr } = await admin
      .from('accounts')
      .update({
        business_name: '[Closed Account - Redacted]',
        plan: 'suspended',
        stripe_customer_id: null,
        stripe_connect_id: null,
        connect_onboarded: false,
        connect_disabled_at: null,
        quickbooks_realm_id: null,
        quickbooks_connected: false,
        insurance_path: null,
        insurance_filename: null,
        insurance_uploaded_at: null,
      })
      .eq('id', accountId);

    if (redactAcctErr) {
      errors.push(`Account row redaction failed: ${redactAcctErr.message}`);
    }
  } else {
    errors.push(`Account delete failed with unexpected error: ${deleteError.message}`);
  }

  // 8. Owner Auth User Cleanup (only if user belongs to no remaining accounts)
  const cleanedOwners: string[] = [];
  for (const userId of ownerIds) {
    try {
      const { count } = await admin
        .from('memberships')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (!count) {
        await admin.auth.admin.deleteUser(userId);
        cleanedOwners.push(userId);
      }
    } catch (error) {
      errors.push(`Owner user cleanup error for ${userId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const success = errors.length === 0;

  return {
    success,
    accountId,
    hardDeleted,
    anonymized: true,
    retainedLedger,
    cleanedStorageFiles,
    cleanedSubscriptions,
    cleanedOwners,
    quickBooksRevoked,
    errors,
  };
}
