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

  it('rejects analysis without a photo', async () => {
    const result = await analyzePhotoDefectsAction({
      trade: 'Roofing',
      notes: 'Hail damage and missing tabs on south ridge',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('A damage or inspection photo is required');
    expect(result.estimate).toBeUndefined();
  });

  it('rejects analysis when API key is missing (fallback removed)', async () => {
    // Pass a dummy photo to pass the photo check, but it should fail on missing API key (unless set in env, so let's mock it)
    const originalEnv = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    
    const result = await analyzePhotoDefectsAction({
      trade: 'General Repair',
      photoUrl: 'data:image/jpeg;base64,dummy',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('AI photo analysis is currently undergoing upgrades');
    
    // Restore env if needed
    if (originalEnv) process.env.GEMINI_API_KEY = originalEnv;
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