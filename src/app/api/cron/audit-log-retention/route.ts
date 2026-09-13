import { cronRoute } from '@/lib/cron-runs';
import { createAdminClient } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Archives AI operator audit log entries older than 90 days to cold storage.
 * Keeps the hot audit table fast while preserving historical records.
 */
async function runAuditLogRetention() {
  const client = createAdminClient();
  const cutoffDate = new Date(Date.now() - 90 * 86400000).toISOString();

  // 1. Copy old records to archive table
  const { error: copyError } = await client.rpc('archive_old_audit_logs', {
    cutoff_date: cutoffDate,
  });

  // If the RPC doesn't exist yet, fall back to direct query approach
  if (copyError) {
    // Insert old rows into archive
    const { data: oldRows } = await client
      .from('ai_operator_audit_log')
      .select('*')
      .lt('created_at', cutoffDate)
      .limit(500);

    if (oldRows && oldRows.length > 0) {
      const { error: insertError } = await client
        .from('ai_operator_audit_archive')
        .insert(oldRows);

      if (insertError) {
        throw new Error(`Failed to archive audit logs: ${insertError.message}`);
      }

      // 2. Delete archived rows from the hot table
      const { error: deleteError } = await client
        .from('ai_operator_audit_log')
        .delete()
        .lt('created_at', cutoffDate)
        .limit(500);

      if (deleteError) {
        throw new Error(`Failed to prune archived audit logs: ${deleteError.message}`);
      }

      return {
        archivedCount: oldRows.length,
        cutoffDate,
        method: 'direct_query',
      };
    }

    return { archivedCount: 0, cutoffDate, method: 'no_rows_to_archive' };
  }

  return { cutoffDate, method: 'rpc' };
}

export const GET = cronRoute('audit-log-retention', runAuditLogRetention);
