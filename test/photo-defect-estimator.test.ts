import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  requireOfficeContext: vi.fn().mockResolvedValue({
    supabase: {},
    accountId: 'acc-test',
  }),
}));

import { analyzePhotoDefectsAction } from '@/app/dashboard/jobs/photo-estimate-actions';
import { requireOfficeContext } from '@/lib/auth';

describe('Photo Defect Estimator Server Action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('analyzes photo defects and returns structured line items and costs', async () => {
    const result = await analyzePhotoDefectsAction({
      trade: 'Roofing',
      notes: 'Hail damage and missing tabs on south ridge',
    });

    expect(result.ok).toBe(true);
    expect(result.estimate).toBeDefined();
    if (result.estimate) {
      expect(result.estimate.trade).toBe('Roofing');
      expect(result.estimate.defects.length).toBeGreaterThan(0);
      expect(result.estimate.totalEstimatedRepairDollars).toBeGreaterThan(0);
      expect(result.estimate.suggestedQuoteDraft.lineItems.length).toBeGreaterThan(0);
      expect(result.estimate.urgency).toMatch(/routine|urgent|emergency/);
    }
  });

  it('defaults trade when omitted or empty', async () => {
    const result = await analyzePhotoDefectsAction({
      trade: '',
      notes: 'Cracked pipe in crawl space',
    });

    expect(result.ok).toBe(true);
    expect(result.estimate?.trade).toBe('General Repair');
  });

  it('catches and reports unauthorized errors gracefully', async () => {
    vi.mocked(requireOfficeContext).mockRejectedValueOnce(new Error('Unauthorized access'));

    const result = await analyzePhotoDefectsAction({
      trade: 'HVAC',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Unauthorized access');
  });
});