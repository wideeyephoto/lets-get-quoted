import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runDatabasePoolGuard } from '@/lib/ai-operator/db-guard';
import { flushOperatorWrites, recordOperatorAudit } from '@/lib/ai-operator/audit';

vi.mock('@/lib/ai-operator/audit', () => ({ recordOperatorAudit: vi.fn(), flushOperatorWrites: vi.fn().mockResolvedValue(undefined) }));
beforeEach(() => vi.clearAllMocks());
const query = { pid: 123, query: 'select id from reports' };

describe('database guard evidence', () => {
  it('reports the observed missing-RPC error as warning and performs no cancellation', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [query], error: { message: 'Could not find get_long_running_queries', code: 'PGRST202' } });
    const report = await runDatabasePoolGuard({ rpc } as never);
    expect(report).toMatchObject({ status: 'warning', canceledQueriesCount: 0, activeConnectionsCount: null, errors: ['Could not find get_long_running_queries'] });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(recordOperatorAudit).not.toHaveBeenCalled();
  });

  it.each([null, {}, 'unavailable'])('does not turn invalid inspection data into a healthy empty result: %s', async data => {
    const report = await runDatabasePoolGuard({ rpc: vi.fn().mockResolvedValue({ data, error: null }) } as never);
    expect(report.status).toBe('warning');
    expect(report.errors).toHaveLength(1);
  });

  it('reports an inspection exception as warning', async () => {
    const report = await runDatabasePoolGuard({ rpc: vi.fn().mockRejectedValue(new Error('network unavailable')) } as never);
    expect(report.status).toBe('warning');
    expect(report.errors).toContain('network unavailable');
  });

  it('does not report simulated dry-run cancellations as completed work', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [query], error: null });
    const report = await runDatabasePoolGuard({ rpc } as never, { dryRun: true });
    expect(report).toMatchObject({ status: 'warning', longRunningQueriesCount: 1, canceledQueriesCount: 0 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(recordOperatorAudit).not.toHaveBeenCalled();
  });

  it.each([
    { data: null, error: { message: 'permission denied' } },
    { data: false, error: null },
    { data: null, error: null },
  ])('requires an acknowledged cancellation before counting success: %j', async cancellation => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [query], error: null }).mockResolvedValueOnce(cancellation);
    const report = await runDatabasePoolGuard({ rpc } as never);
    expect(report).toMatchObject({ status: 'warning', canceledQueriesCount: 0 });
    expect(report.errors).toHaveLength(1);
    expect(recordOperatorAudit).not.toHaveBeenCalled();
  });

  it('records acknowledged requests without claiming measured pool recovery and flushes the audit', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [query], error: null }).mockResolvedValueOnce({ data: true, error: null });
    const report = await runDatabasePoolGuard({ rpc } as never, { maxDurationSeconds: 90 });
    expect(report).toMatchObject({ status: 'cancellation_requested', canceledQueriesCount: 1, errors: [] });
    expect(recordOperatorAudit).toHaveBeenCalledWith(expect.objectContaining({ reasoningSummary: expect.stringContaining('exceeding 90s') }));
    expect(flushOperatorWrites).toHaveBeenCalledTimes(1);
  });

  it('keeps unmitigated writes visible as a warning', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ pid: 123, query: 'update accounts set enabled=true' }], error: null });
    const report = await runDatabasePoolGuard({ rpc } as never);
    expect(report.status).toBe('warning');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects an invalid duration: %s', async maxDurationSeconds => {
    const rpc = vi.fn();
    await expect(runDatabasePoolGuard({ rpc } as never, { maxDurationSeconds })).rejects.toThrow('duration must be positive');
    expect(rpc).not.toHaveBeenCalled();
  });
});
