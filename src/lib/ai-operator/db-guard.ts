import type { SupabaseClient } from '@supabase/supabase-js';
import { flushOperatorWrites, recordOperatorAudit } from './audit';

export interface DbGuardReport {
  scannedAt: string;
  activeConnectionsCount: number | null;
  longRunningQueriesCount: number;
  canceledQueriesCount: number;
  status: 'healthy' | 'cancellation_requested' | 'warning';
  errors: string[];
}

/**
 * Autonomous SRE worker that guards database connection pool headroom and mitigates query lockups
 */
export async function runDatabasePoolGuard(
  supabase: SupabaseClient,
  opts: { dryRun?: boolean; maxDurationSeconds?: number } = {},
): Promise<DbGuardReport> {
  const maxDuration = opts.maxDurationSeconds ?? 45;
  if (!Number.isFinite(maxDuration) || maxDuration <= 0) {
    throw new Error('Database guard duration must be positive.');
  }

  const report: DbGuardReport = {
    scannedAt: new Date().toISOString(),
    // The current RPC only returns long-running queries, not pool occupancy.
    activeConnectionsCount: null,
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
      throw new Error(error.message);
    }

    if (!Array.isArray(longRunning)) throw new Error('Database guard inspection returned an invalid result.');
    const queries = longRunning;
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
          if (!Number.isInteger(q.pid) || q.pid <= 0) throw new Error('Invalid backend PID.');
          const { data: cancelled, error: cancelError } = await supabase.rpc('cancel_backend_query', { pid: q.pid });
          if (cancelError) throw new Error(cancelError.message);
          if (cancelled !== true) throw new Error('Database did not acknowledge query cancellation.');
          report.canceledQueriesCount++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          report.errors.push(`PID ${q.pid}: ${msg}`);
        }
      }
    }

    report.status = report.errors.length > 0 || queries.length > report.canceledQueriesCount
      ? 'warning'
      : report.canceledQueriesCount > 0 ? 'cancellation_requested' : 'healthy';

    // Audit Logging if queries were canceled
    if (!opts.dryRun && report.canceledQueriesCount > 0) {
      recordOperatorAudit({
        category: 'sre_platform',
        actionName: 'sre.db_long_queries_mitigated',
        severity: 'safe_auto',
        toolName: 'runDatabasePoolGuard',
        inputPayload: { longRunningCount: queries.length },
        outputResult: report,
        reasoningSummary: `Database acknowledged ${report.canceledQueriesCount} cancellation request(s) for queries exceeding ${maxDuration}s. Pool recovery has not been measured.`,
        status: report.errors.length > 0 ? 'failure' : 'success',
      });
      await flushOperatorWrites();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    report.errors.push(msg);
    report.status = 'warning';
  }

  return report;
}
