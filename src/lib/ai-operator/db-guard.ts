import type { SupabaseClient } from '@supabase/supabase-js';
import { recordOperatorAudit } from './audit';

export interface DbGuardReport {
  scannedAt: string;
  activeConnectionsCount: number;
  longRunningQueriesCount: number;
  canceledQueriesCount: number;
  status: 'healthy' | 'headroom_restored' | 'warning';
  errors: string[];
}

/**
 * Autonomous SRE worker that guards database connection pool headroom and mitigates query lockups
 */
export async function runDatabasePoolGuard(
  supabase: SupabaseClient,
  opts: { dryRun?: boolean; maxDurationSeconds?: number } = {},
): Promise<DbGuardReport> {
  const maxDuration = opts.maxDurationSeconds || 45;

  const report: DbGuardReport = {
    scannedAt: new Date().toISOString(),
    activeConnectionsCount: 0,
    longRunningQueriesCount: 0,
    canceledQueriesCount: 0,
    status: 'healthy',
    errors: [],
  };

  try {
    // 1. Query pg_stat_activity for connections running > 45s (excluding idle and internal maintenance)
    const { data: longRunning, error } = await supabase
      .rpc('get_long_running_queries', { min_duration_seconds: maxDuration });

    if (error) {
      report.errors.push(error.message);
    }

    const queries = Array.isArray(longRunning) ? longRunning : [];
    report.longRunningQueriesCount = queries.length;

    for (const q of queries) {
      const isReadOnlyOrReport =
        typeof q.query === 'string' &&
        (q.query.trim().toLowerCase().startsWith('select') ||
          q.query.toLowerCase().includes('count(*)') ||
          q.query.toLowerCase().includes('pg_stat'));

      // Cancel non-critical reporting queries that block headroom
      if (isReadOnlyOrReport && !opts.dryRun) {
        try {
          await supabase.rpc('cancel_backend_query', { pid: q.pid });
          report.canceledQueriesCount++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          report.errors.push(`PID ${q.pid}: ${msg}`);
        }
      } else if (isReadOnlyOrReport) {
        report.canceledQueriesCount++;
      }
    }

    report.status = report.canceledQueriesCount > 0 ? 'headroom_restored' : 'healthy';

    // Audit Logging if queries were canceled
    if (!opts.dryRun && report.canceledQueriesCount > 0) {
      recordOperatorAudit({
        category: 'sre_platform',
        actionName: 'sre.db_long_queries_mitigated',
        severity: 'safe_auto',
        toolName: 'runDatabasePoolGuard',
        inputPayload: { longRunningCount: queries.length },
        outputResult: report,
        reasoningSummary: `Database pool guard canceled ${report.canceledQueriesCount} long-running queries (>45s) to restore transaction pooler headroom.`,
        status: 'success',
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    report.errors.push(msg);
  }

  return report;
}
