import { describe, expect, it } from 'vitest';

import {
  BYTES_PER_GB,
  STORAGE_CAP_ENFORCEMENT_FLAG,
  decideStorageAdmission,
  formatStorageBytes,
  normalizeStorageState,
  storageCapEnforcementEnabled,
  storageRefusalMessage,
  type WorkspaceStorageState,
} from '@/lib/billing/storage-usage';
import { summarizeWorkspaceStorageUsageSweep } from '@/lib/billing/billing-worker-cron';

const MEASURED: WorkspaceStorageState = {
  bytesUsed: 2 * BYTES_PER_GB,
  objectCount: 400,
  measuredAt: '2026-08-19T00:00:00.000Z',
  limitBytes: 5 * BYTES_PER_GB,
};

describe('the enforcement flag', () => {
  it('is off for every value except the exact string 1', () => {
    expect(storageCapEnforcementEnabled({})).toBe(false);
    expect(storageCapEnforcementEnabled({ [STORAGE_CAP_ENFORCEMENT_FLAG]: '' })).toBe(false);
    expect(storageCapEnforcementEnabled({ [STORAGE_CAP_ENFORCEMENT_FLAG]: 'true' })).toBe(false);
    expect(storageCapEnforcementEnabled({ [STORAGE_CAP_ENFORCEMENT_FLAG]: '1 ' })).toBe(false);
    expect(storageCapEnforcementEnabled({ [STORAGE_CAP_ENFORCEMENT_FLAG]: '1' })).toBe(true);
  });
});

describe('reading the measurement', () => {
  it('keeps a missing row as unknown rather than empty', () => {
    expect(normalizeStorageState(null)).toEqual({
      bytesUsed: null,
      objectCount: null,
      measuredAt: null,
      limitBytes: null,
    });
  });

  it('accepts bigints as numbers or strings', () => {
    const state = normalizeStorageState({
      bytes_used: '1073741824',
      object_count: 12,
      measured_at: '2026-08-19T00:00:00.000Z',
      limit_bytes: '5368709120',
    });
    expect(state.bytesUsed).toBe(BYTES_PER_GB);
    expect(state.objectCount).toBe(12);
    expect(state.limitBytes).toBe(5 * BYTES_PER_GB);
  });

  it('refuses to reinterpret a malformed value as zero', () => {
    const state = normalizeStorageState({
      bytes_used: 'not-a-number',
      object_count: -4,
      measured_at: 'never',
      limit_bytes: 1.5,
    });
    expect(state.bytesUsed).toBeNull();
    expect(state.objectCount).toBeNull();
    expect(state.measuredAt).toBeNull();
    expect(state.limitBytes).toBeNull();
  });
});

describe('deciding one upload', () => {
  it('allows a file that fits', () => {
    expect(decideStorageAdmission(MEASURED, 1024, true)).toEqual({ kind: 'allowed' });
  });

  it('refuses a file that would cross the cap', () => {
    const admission = decideStorageAdmission(MEASURED, 4 * BYTES_PER_GB, true);
    expect(admission.kind).toBe('refused');
  });

  it('allows a file that lands exactly on the cap', () => {
    // At the limit is not over it. The next byte is what crosses.
    const admission = decideStorageAdmission(MEASURED, 3 * BYTES_PER_GB, true);
    expect(admission).toEqual({ kind: 'allowed' });
  });

  describe('fails open, which is the whole risk of this module', () => {
    it('when the workspace has never been swept', () => {
      const unmeasured: WorkspaceStorageState = { ...MEASURED, bytesUsed: null };
      expect(decideStorageAdmission(unmeasured, 9 * BYTES_PER_GB, true))
        .toEqual({ kind: 'allowed_unmeasured' });
    });

    it('when the workspace has no known limit', () => {
      const noLimit: WorkspaceStorageState = { ...MEASURED, limitBytes: null };
      expect(decideStorageAdmission(noLimit, 9 * BYTES_PER_GB, true))
        .toEqual({ kind: 'allowed_no_limit' });
    });

    it('when enforcement is off, while still reporting what it would have done', () => {
      // The dark state has to be observable, or there is no way to tell whether
      // turning enforcement on would refuse anybody before it does.
      expect(decideStorageAdmission(MEASURED, 4 * BYTES_PER_GB, false))
        .toEqual({ kind: 'allowed_not_enforced', wouldRefuse: true });
      expect(decideStorageAdmission(MEASURED, 1024, false))
        .toEqual({ kind: 'allowed_not_enforced', wouldRefuse: false });
    });
  });

  it('treats a nonsense incoming size as zero rather than a pass', () => {
    const atLimit: WorkspaceStorageState = { ...MEASURED, bytesUsed: 5 * BYTES_PER_GB };
    expect(decideStorageAdmission(atLimit, Number.NaN, true)).toEqual({ kind: 'allowed' });
    const over: WorkspaceStorageState = { ...MEASURED, bytesUsed: 6 * BYTES_PER_GB };
    expect(decideStorageAdmission(over, Number.NaN, true).kind).toBe('refused');
  });
});

describe('what the owner is told', () => {
  it('names what is stored, what is allowed, and what to do', () => {
    const admission = decideStorageAdmission(MEASURED, 4 * BYTES_PER_GB, true);
    if (admission.kind !== 'refused') throw new Error('expected a refusal');
    const message = storageRefusalMessage(admission);
    expect(message).toContain('2.0 GB');
    expect(message).toContain('5.0 GB');
    expect(message).toMatch(/Delete files|add storage/);
  });

  it('never reports a bare byte count', () => {
    expect(formatStorageBytes(0)).toBe('0 KB');
    expect(formatStorageBytes(4096)).toBe('4 KB');
    expect(formatStorageBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatStorageBytes(300 * 1024 * 1024)).toBe('300 MB');
    expect(formatStorageBytes(BYTES_PER_GB)).toBe('1.0 GB');
    expect(formatStorageBytes(100 * BYTES_PER_GB)).toBe('100 GB');
    expect(formatStorageBytes(-1)).toBe('0 MB');
  });
});

describe('the sweep summary', () => {
  it('reports counts on success', () => {
    expect(summarizeWorkspaceStorageUsageSweep({
      status: 'completed',
      workspacesMeasured: 12,
      workspacesZeroed: 3,
      bytesTotal: 999,
    })).toEqual({
      status: 'completed',
      workspaces_measured: 12,
      workspaces_zeroed: 3,
      bytes_total: 999,
    });
  });

  it('reports a failure as zeroes rather than a partial count', () => {
    // The sweep is one transaction over every workspace, so a failure measured
    // nobody. Reporting anything else would suggest partial progress.
    expect(summarizeWorkspaceStorageUsageSweep({ status: 'failed' })).toEqual({
      status: 'failed',
      workspaces_measured: 0,
      workspaces_zeroed: 0,
      bytes_total: 0,
    });
  });
});
