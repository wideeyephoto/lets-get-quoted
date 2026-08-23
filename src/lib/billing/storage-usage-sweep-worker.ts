import 'server-only';

import { createAdminClient } from '@/lib/auth';

/**
 * DARK server-only worker: recompute every workspace's storage measurement.
 *
 * Unlike the other billing workers this one claims nothing and has no batch
 * size. There is no queue to drain and no per-workspace lease, because the
 * database does the whole job in a single grouped pass over storage.objects --
 * see 20260819000000. Batching it would mean holding a cursor across calls for
 * a query that is cheaper run whole.
 *
 * That also means it is safely re-runnable and safely concurrent: the sweep is
 * one transaction that recomputes wholesale, so two overlapping runs produce the
 * same rows rather than double-counting anything.
 */

export type StorageUsageSweepResult =
  | Readonly<{
    status: 'completed';
    workspacesMeasured: number;
    workspacesZeroed: number;
    bytesTotal: number;
  }>
  | Readonly<{ status: 'failed' }>;

type SweepRow = {
  workspaces_measured: unknown;
  workspaces_zeroed: unknown;
  bytes_total: unknown;
};

function safeCount(value: unknown): number | null {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof parsed === 'number' && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Runs the sweep and reduces the result to counts.
 *
 * Failures collapse to a bare `failed` with no message: this value is returned
 * to the cron HTTP response and written to cron_runs, and a database error
 * string from a function that reads every object in the project is not something
 * to publish there.
 */
export async function runWorkspaceStorageUsageSweep(): Promise<StorageUsageSweepResult> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('reconcile_workspace_storage_usage_v1');
    if (error) {
      console.error('workspace storage usage sweep failed:', error);
      return { status: 'failed' };
    }

    const rows = Array.isArray(data) ? (data as SweepRow[]) : [];
    const row = rows[0];
    if (!row) return { status: 'failed' };

    const workspacesMeasured = safeCount(row.workspaces_measured);
    const workspacesZeroed = safeCount(row.workspaces_zeroed);
    const bytesTotal = safeCount(row.bytes_total);
    if (workspacesMeasured === null || workspacesZeroed === null || bytesTotal === null) {
      return { status: 'failed' };
    }

    return { status: 'completed', workspacesMeasured, workspacesZeroed, bytesTotal };
  } catch (error) {
    console.error('workspace storage usage sweep threw:', error);
    return { status: 'failed' };
  }
}
