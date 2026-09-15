import { describe, it, expect, vi } from 'vitest';
import { getPhotoEstimate, createPhotoEstimate } from '@/lib/photo-estimate/repository';
import { claimPendingRun, recoverExpiredRuns } from '@/lib/photo-estimate/worker';

describe('Photo Estimate Contracts and Persistence', () => {
  it('defines the expected entities and types', () => {
    // This test just ensures the contracts are exported and have the expected names
    expect(getPhotoEstimate).toBeDefined();
    expect(createPhotoEstimate).toBeDefined();
  });

  it('provides a recovery mechanism for expired runs', () => {
    expect(recoverExpiredRuns).toBeDefined();
    expect(claimPendingRun).toBeDefined();
  });
});
