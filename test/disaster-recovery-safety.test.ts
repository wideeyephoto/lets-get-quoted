import { beforeEach, describe, expect, it, vi } from 'vitest';
// Unit tests of guards and reporting. These never certify an actual restore.
const stub = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), end: vi.fn(), options: vi.fn() }));
vi.mock('pg', () => ({ Client: class {
  constructor(options: unknown) { stub.options(options); }
  query = stub.query;
  connect = stub.connect;
  end = stub.end;
} }));
vi.mock('node:fs/promises', () => ({ readFile: vi.fn(async () => 'DATABASE_URL=postgresql://postgres:secret@db.mfuvvtrkipkigwqqtcal.supabase.co/postgres') }));
// @ts-expect-error JS script module without declarations
import { assertScratchTarget, databaseTarget, restoreArguments } from '../scripts/lib/dr-target.mjs';
// @ts-expect-error JS script module without declarations
import { verifyRestoredDatabase } from '../scripts/run-pitr-restore-drill.mjs';

const production = 'mfuvvtrkipkigwqqtcal';
const staging = 'uydlabvgauzujdwuqzxq';
const scratch = 'abcdefghijklmnopqrst';
const direct = (ref: string) => `postgresql://postgres:secret@db.${ref}.supabase.co:5432/postgres`;
const pool = (ref: string) => `postgresql://postgres.${ref}:secret@aws-0-us-west-2.pooler.supabase.com:5432/postgres`;
const tables = ['accounts','memberships','staff','jobs','clients','invoices','payments','estimate_offers','extra_stop_requests','email_suppression'];

beforeEach(() => {
  vi.clearAllMocks();
  stub.query.mockImplementation(async (sql: string) => {
    if (sql.includes('information_schema.tables')) return { rows: tables.map((table_name) => ({ table_name })) };
    return { rows: [{ count: 0 }] };
  });
});

describe('restore target safety', () => {
  it.each([direct(production), pool(production)])('rejects production before connecting: %s', async (url) => {
    await expect(verifyRestoredDatabase(url)).rejects.toThrow('REFUSING');
    expect(stub.connect).not.toHaveBeenCalled();
  });
  it('recognizes a changed production project across direct and pooler aliases', () => {
    expect(() => assertScratchTarget(pool(scratch), direct(scratch))).toThrow('REFUSING');
  });
  it('distinguishes separate projects sharing a pooler hostname', () => {
    expect(assertScratchTarget(pool(staging), pool(production), staging).projectRef).toBe(staging);
  });
  it.each(['?host=db.mfuvvtrkipkigwqqtcal.supabase.co','?hostaddr=127.0.0.1','?dbname=other','?service=production','#ignored'])('rejects URL override %s', (suffix) => {
    expect(() => databaseTarget(direct(staging) + suffix)).toThrow();
  });
  it.each([direct(staging).replace(':5432', ':6543'),direct(staging).replace('/postgres','/another'), 'postgresql://postgres:secret@example.com/postgres','https://example.com'])('fails closed on unsupported target %s', (url) => {
    expect(() => databaseTarget(url)).toThrow();
  });
  it('requires the explicitly selected project to match', () => {
    expect(() => assertScratchTarget(direct(staging), direct(production), scratch)).toThrow('explicitly selected');
  });
  it('is dry-run by default and requires the exact destruction acknowledgement', () => {
    const target = assertScratchTarget(direct(staging), direct(production));
    expect(restoreArguments({ apply: false, target })).toBeNull();
    expect(() => restoreArguments({ apply: true, target, confirmedProjectRef: scratch })).toThrow('confirm-destroy');
    const args = restoreArguments({ apply: true, target, confirmedProjectRef: staging, archive: 'copy.dump' });
    expect(args).toContain('--single-transaction');
    expect(args).toContain('--exit-on-error');
    expect(args).not.toContain('--no-privileges');
  });
});

describe('actual validator reporting with a simulated connection', () => {
  it('uses estimate_offers and labels counts as observations, not recovery proof', async () => {
    const result = await verifyRestoredDatabase(direct(staging));
    expect(result.passed).toBe(true);
    expect(result.fullRecoveryVerified).toBe(false);
    expect(result.restorePerformed).toBe(false);
    expect(result.checks.find((c: { name: string }) => c.name === 'table_row_counts')).toMatchObject({ status:'recorded', counts: { estimate_offers:0 } });
    expect(stub.query.mock.calls[0][1][0]).not.toContain('quotes');
    expect(stub.options).toHaveBeenCalledWith(expect.objectContaining({ options:'-c default_transaction_read_only=on', connectionTimeoutMillis:15000 }));
  });
  it('reports missing tables without querying absent relationships', async () => {
    stub.query.mockResolvedValue({ rows: [] });
    const result = await verifyRestoredDatabase(direct(staging));
    expect(result.passed).toBe(false);
    expect(result.checks[0].detail).toContain('accounts');
    expect(stub.query).toHaveBeenCalledTimes(1);
    expect(stub.end).toHaveBeenCalledOnce();
  });
  it('fails on orphaned account references', async () => {
    stub.query.mockImplementation(async (sql: string) => sql.includes('information_schema.tables')
      ? { rows:tables.map((table_name) => ({table_name})) } : { rows:[{count:2}] });
    const result = await verifyRestoredDatabase(direct(staging));
    expect(result.passed).toBe(false);
    expect(result.checks.filter((c: { status: string }) => c.status === 'failed')).toHaveLength(2);
  });
  it('closes the connection on a query error', async () => {
    stub.query.mockRejectedValue(new Error('query failed'));
    await expect(verifyRestoredDatabase(direct(staging))).rejects.toThrow('query failed');
    expect(stub.end).toHaveBeenCalledOnce();
  });
});
