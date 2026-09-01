import { createAdminClient } from '@/lib/auth';
import { recordTenantAuditEvent } from '@/lib/tenant-audit';
import { claimClosureJob, processClosureJob, buildProductionClosureAdapters } from '@/lib/account-closure-orchestrator';

export interface PurgeResult {
  purgedDeletionsCount: number;
  processedClosureJobsCount: number;
  errors: string[];
}

/**
 * Background Purge Engine
 * Executes daily to safely hard-delete expired soft-deleted items (>30 days) and finalized closed accounts,
 * strictly verifying that legal hold is NOT enabled.
 */
export async function runPurgeWorker(batchSize = 50): Promise<PurgeResult> {
  const supabase = createAdminClient();
  const errors: string[] = [];
  let purgedDeletionsCount = 0;
  let processedClosureJobsCount = 0;

  // --------------------------------------------------------------------------
  // 1. Process Expired Recoverable Deletions
  // --------------------------------------------------------------------------
  try {
    const { data: claimedItems, error: claimError } = await supabase.rpc(
      'claim_recoverable_deletions_for_purge',
      { p_batch_size: batchSize }
    );

    if (claimError) {
      console.error('[purge-worker] Error claiming recoverable deletions:', claimError);
      errors.push(`Claim error: ${claimError.message}`);
    } else if (claimedItems && claimedItems.length > 0) {
      for (const item of claimedItems as any[]) {
        try {
          // Double check legal hold on account before permanent destruction
          const { data: acct } = await supabase
            .from('accounts')
            .select('legal_hold')
            .eq('id', item.account_id)
            .single();

          if (acct?.legal_hold) {
            console.warn(`[purge-worker] Account ${item.account_id} is under legal hold; skipping purge for ${item.id}`);
            await supabase
              .from('recoverable_deletions')
              .update({ purge_locked: false, legal_hold: true })
              .eq('id', item.id);
            continue;
          }

          // Delete quarantined storage files
          const storageManifest = item.storage_manifest || [];
          for (const storageItem of storageManifest) {
            if (storageItem.bucket && storageItem.path) {
              try {
                await supabase.storage.from(storageItem.bucket).remove([storageItem.path]);
              } catch (storageErr) {
                console.error(`[purge-worker] Failed to remove storage file ${storageItem.path}:`, storageErr);
              }
            }
          }

          // Permanently delete database record
          const tableName = getTableName(item.entity_type);
          await supabase
            .from(tableName)
            .delete()
            .eq('account_id', item.account_id)
            .eq('id', item.entity_id);

          // Mark as purged in manifest
          await supabase
            .from('recoverable_deletions')
            .update({
              status: 'purged',
              purge_locked: false,
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id);

          // Write audit log
          await recordTenantAuditEvent({
            accountId: item.account_id,
            entityType: item.entity_type,
            entityId: item.entity_id,
            action: `${item.entity_type}.purged`,
            actor: { role: 'system_cron', authType: 'service_role' },
            source: 'cron',
            deleteOperationId: item.id,
            reason: 'Automated purge following expiration of 30-day trash grace period',
          });

          purgedDeletionsCount++;
        } catch (itemErr: any) {
          console.error(`[purge-worker] Error purging item ${item.id}:`, itemErr);
          errors.push(`Item ${item.id} error: ${itemErr.message}`);
          await supabase
            .from('recoverable_deletions')
            .update({ purge_locked: false })
            .eq('id', item.id);
        }
      }
    }
  } catch (err: any) {
    errors.push(`Recoverable deletions batch error: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // 2. Process Expired Account Closure Jobs
  // --------------------------------------------------------------------------
  try {
    const leaseToken = crypto.randomUUID();
    const claimedJob = await claimClosureJob(supabase, leaseToken, 600);

    if (claimedJob && claimedJob.id) {
      const adapters = buildProductionClosureAdapters(supabase);
      const result = await processClosureJob(supabase, String(claimedJob.id), adapters, leaseToken);
      if (result.completed) {
        processedClosureJobsCount++;
      }
      if (result.errors && result.errors.length > 0) {
        errors.push(...result.errors);
      }
    }
  } catch (closureErr: any) {
    errors.push(`Closure worker error: ${closureErr.message}`);
  }

  return {
    purgedDeletionsCount,
    processedClosureJobsCount,
    errors,
  };
}

function getTableName(entityType: string): string {
  switch (entityType) {
    case 'lead':
      return 'leads';
    case 'crew':
      return 'crew';
    case 'service':
      return 'services';
    case 'job':
      return 'jobs';
    case 'attachment':
      return 'account_attachments';
    default:
      throw new Error(`Unsupported entity type: ${entityType}`);
  }
}
