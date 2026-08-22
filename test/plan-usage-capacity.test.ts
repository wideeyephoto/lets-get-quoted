import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildWorkspaceCapacity } from '@/lib/billing/capacity-usage';
import type { PlanUsageLimits } from '@/lib/billing/plan-usage';
import type { WorkspaceStorageState } from '@/lib/billing/storage-usage';

/**
 * The capacity grid states, for the first time, what a workspace is USING. Its
 * whole risk is the direction it fails in: every count behind it comes from a
 * read that can be refused, and a grid that renders a refusal as a green tick
 * tells a contractor sitting at their limit that they have room.
 */

const LIMITS: PlanUsageLimits = {
  officeUsers: 2,
  crewUsers: 2,
  customDomainConnections: 1,
  dedicatedBusinessNumbers: 0,
  storageGb: 10,
  quickBooksConnections: 1,
  voiceConcurrentCalls: 1,
  voiceHistoryDays: 30,
};

const NO_SEATS = { officeUsers: 0, crewUsers: 0 } as const;
const bytes = (value: number) => `${value} B`;

function build(
  counts: Partial<Record<'officeSeatsUsed' | 'crewSeatsUsed' | 'customDomainsUsed', number | null>> = {},
  storage: WorkspaceStorageState | null = null,
  limits: PlanUsageLimits | null = LIMITS,
) {
  return buildWorkspaceCapacity(
    limits,
    NO_SEATS,
    { officeSeatsUsed: 1, crewSeatsUsed: 0, customDomainsUsed: 0, ...counts },
    storage,
    bytes,
  );
}

const row = (capacity: ReturnType<typeof build>, key: string) =>
  capacity.rows.find((candidate) => candidate.key === key);

describe('the capacity ladder fails to unknown, never to healthy', () => {
  it('reports an unreadable count as unknown with no bar', () => {
    const office = row(build({ officeSeatsUsed: null }), 'office_users');
    expect(office?.verdict).toBe('unknown');
    expect(office?.status).toBe('Not measured');
    // A bar drawn over a count that was never read says "you have used none of
    // it", which is the one thing an unmeasured row must not claim.
    expect(office?.percent).toBeNull();
  });

  it('reports an unknown LIMIT as unknown too, not as unlimited', () => {
    const office = row(build({}, null, { ...LIMITS, officeUsers: null }), 'office_users');
    expect(office?.verdict).toBe('unknown');
    expect(office?.percent).toBeNull();
  });

  it('never returns healthy for a null on either side', () => {
    for (const counts of [{ officeSeatsUsed: null }, { crewSeatsUsed: null }]) {
      for (const candidate of build(counts).rows) {
        if (candidate.used === null || candidate.limit === null) {
          expect(candidate.verdict, candidate.key).not.toBe('healthy');
        }
      }
    }
  });
});

describe('the verdicts a contractor will actually see', () => {
  it('calls a full plan at_limit, not a fault', () => {
    // Flex grants one office seat and the owner occupies it. That is what the
    // free plan IS, and painting it as a warning tells somebody the thing they
    // chose is broken.
    const office = row(build({ officeSeatsUsed: 1 }, null, { ...LIMITS, officeUsers: 1 }), 'office_users');
    expect(office?.verdict).toBe('at_limit');
    expect(office?.detail).toBe('1 of 1 used');
  });

  it('gives Solo room after the second seat landed', () => {
    const office = row(build({ officeSeatsUsed: 1 }), 'office_users');
    expect(office?.verdict).toBe('healthy');
    expect(office?.detail).toBe('1 of 2 used');
  });

  it('counts purchased seats into the limit, as the database does', () => {
    const capacity = buildWorkspaceCapacity(
      LIMITS,
      { officeUsers: 3, crewUsers: 0 },
      { officeSeatsUsed: 3, crewSeatsUsed: 0, customDomainsUsed: 0 },
      null,
      bytes,
    );
    expect(row(capacity, 'office_users')?.limit).toBe(5);
    expect(row(capacity, 'office_users')?.verdict).toBe('healthy');
  });

  it('calls over-limit over, and it is the only red', () => {
    expect(row(build({ crewSeatsUsed: 5 }), 'crew_users')?.verdict).toBe('over');
  });

  it('warns at 80% and not before', () => {
    const near = buildWorkspaceCapacity(
      { ...LIMITS, crewUsers: 10 }, NO_SEATS,
      { officeSeatsUsed: 1, crewSeatsUsed: 8, customDomainsUsed: 0 }, null, bytes,
    );
    const clear = buildWorkspaceCapacity(
      { ...LIMITS, crewUsers: 10 }, NO_SEATS,
      { officeSeatsUsed: 1, crewSeatsUsed: 7, customDomainsUsed: 0 }, null, bytes,
    );
    expect(row(near, 'crew_users')?.verdict).toBe('near');
    expect(row(clear, 'crew_users')?.verdict).toBe('healthy');
  });

  it('treats a zero limit as full rather than dividing by it', () => {
    const zero = buildWorkspaceCapacity(
      { ...LIMITS, crewUsers: 0 }, NO_SEATS,
      { officeSeatsUsed: 1, crewSeatsUsed: 0, customDomainsUsed: 0 }, null, bytes,
    );
    expect(row(zero, 'crew_users')?.verdict).toBe('at_limit');
    expect(row(zero, 'crew_users')?.percent).toBe(0);
  });
});

describe('storage keeps the honesty the shipped card already had', () => {
  it('does not draw a bar for a workspace the sweep has not measured', () => {
    const storage: WorkspaceStorageState = {
      bytesUsed: null, objectCount: null, measuredAt: null, limitBytes: 1_000,
    };
    const capacity = build({}, storage);
    expect(row(capacity, 'storage')?.verdict).toBe('unknown');
    expect(row(capacity, 'storage')?.percent).toBeNull();
    expect(row(capacity, 'storage')?.detail).toContain('not measured yet');
  });

  it('does not invent a limit for a workspace that has none', () => {
    const storage: WorkspaceStorageState = {
      bytesUsed: 500, objectCount: 2, measuredAt: null, limitBytes: null,
    };
    expect(row(build({}, storage), 'storage')?.verdict).toBe('unknown');
    expect(row(build({}, storage), 'storage')?.percent).toBeNull();
  });

  it('omits the whole row when there is no storage state at all', () => {
    expect(row(build({}, null), 'storage')).toBeUndefined();
  });
});

describe('rows the product cannot honor are absent, not zeroed', () => {
  it('never renders dedicated business numbers or AI Voice', () => {
    const keys = build({}, null).rows.map((candidate) => candidate.key);
    // Every plan grants zero dedicated numbers and all three Voice SKUs are
    // withheld. "0 of 5 business numbers" on a $329 plan advertises five phone
    // numbers no plan grants.
    expect(keys).not.toContain('dedicated_business_numbers');
    expect(keys).not.toContain('voice');
    expect(keys).toEqual(['office_users', 'crew_users', 'custom_domains']);
  });

  it('omits the domain row when the entitlement states no allowance', () => {
    const capacity = build({}, null, { ...LIMITS, customDomainConnections: null });
    expect(row(capacity, 'custom_domains')).toBeUndefined();
  });
});

describe('the crew count matches the gate that enforces it', () => {
  it('uses the enforcement predicate verbatim', () => {
    // The SQL gate counts active, not-soft-deleted employees. Counting
    // subcontractors would show "8 of 2 - over plan limit" and press somebody to
    // buy seats the database would never have charged them for.
    const source = readFileSync(
      join(process.cwd(), 'src', 'lib', 'billing', 'capacity-usage.ts'),
      'utf8',
    );
    expect(source).toContain(".eq('active', true)");
    expect(source).toContain(".is('deleted_at', null)");
    expect(source).toContain(".eq('worker_type', 'employee')");

    const gate = readFileSync(
      join(process.cwd(), 'migrations', '20260816044858_crew_seat_entitlement_gate.sql'),
      'utf8',
    ).replace(/\r\n/g, '\n');
    expect(gate).toContain('c.active = true');
    expect(gate).toContain('c.deleted_at is null');
    expect(gate).toContain("c.worker_type = 'employee'");
  });
});
