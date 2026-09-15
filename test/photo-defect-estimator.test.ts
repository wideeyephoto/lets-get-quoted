import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateContent = vi.fn();
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent
      }
    })),
    Type: {
      OBJECT: 'OBJECT',
      STRING: 'STRING',
      ARRAY: 'ARRAY',
      NUMBER: 'NUMBER',
    }
  };
});

vi.mock('@/lib/auth', () => ({
  requireOfficeContext: vi.fn().mockResolvedValue({
    supabase: {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        then: vi.fn((cb) => cb({ data: [], error: null })),
      }),
    },
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
      notes: 'Missing shingles',
      photoUrls: [], // No photo
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('photo is required');
  });

  it('successfully processes photos and returns AI estimate', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const mockEstimate = {
      trade: 'Roofing',
      overallDamageSummary: 'Missing shingles detected.',
      defects: [{
        defectName: 'Missing Shingles',
        severity: 'minor',
        recommendedRepair: 'Replace 3 tabs',
        suggestedServiceId: 'service-1',
        suggestedQuantity: 3,
        uncertaintyExplanation: null,
        missingInformation: []
      }],
      urgency: 'routine',
    };

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(mockEstimate)
    });

    const result = await analyzePhotoDefectsAction({
      jobId: 'job-123',
      trade: 'Roofing',
      photoUrls: ['data:image/jpeg;base64,dummy'],
    });

    expect(result.ok).toBe(true);
    expect(result.estimate).toBeDefined();
    expect(result.estimate?.defects[0].suggestedQuantity).toBe(3);
  });

  it('handles AI returning malformed JSON gracefully', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockGenerateContent.mockResolvedValueOnce({
      text: '{ invalid_json '
    });

    const result = await analyzePhotoDefectsAction({
      trade: 'Roofing',
      photoUrls: ['data:image/jpeg;base64,dummy'],
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Failed to parse estimate data');
  });

  it('rejects analysis when API key is missing (fallback removed)', async () => {
    const original = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    const result = await analyzePhotoDefectsAction({
      trade: 'Plumbing',
      photoUrls: ['data:image/jpeg;base64,dummy'],
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('AI photo analysis is currently undergoing upgrades');

    process.env.GEMINI_API_KEY = original;
  });

  it('handles AI quota exhaustion (429) gracefully', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockGenerateContent.mockRejectedValueOnce({
      status: 429,
      message: 'Quota exceeded for quota metric'
    });

    const result = await analyzePhotoDefectsAction({
      trade: 'Roofing',
      photoUrls: ['data:image/jpeg;base64,dummy'],
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Service is currently busy or over quota');
  });

  it('catches and reports unauthorized errors gracefully', async () => {
    // Mock requireOfficeContext to throw
    vi.mocked(requireOfficeContext).mockRejectedValueOnce(new Error('Unauthorized access'));

    const result = await analyzePhotoDefectsAction({
      trade: 'HVAC',
      photoUrls: ['data:image/jpeg;base64,dummy'],
    });

    expect(result.ok).toBe(false);
    expect(result.message).toBe('Unauthorized access');
  });
});