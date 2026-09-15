import { describe, it, expect, vi } from 'vitest';
import { analyzePhotoDefectsAction } from '@/app/dashboard/jobs/photo-estimate-actions';
import { requireOfficeContext } from '@/lib/auth';

// This is a placeholder for the ground truth eval harness as requested in Phase 5
const GROUND_TRUTH = [
  {
    id: 'test-case-1',
    trade: 'Roofing',
    notes: 'Wind damage',
    photoUrl: 'data:image/jpeg;base64,mocked_shingle_damage',
    expectedDefects: ['Missing Shingles'],
  },
];

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: JSON.stringify({
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
          })
        })
      }
    })),
    Type: { OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY', NUMBER: 'NUMBER' }
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

describe('Photo Estimate Evaluation Harness', () => {
  it('evaluates against ground truth', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    
    let passCount = 0;
    
    for (const testCase of GROUND_TRUTH) {
      const result = await analyzePhotoDefectsAction({
        trade: testCase.trade,
        notes: testCase.notes,
        photoUrls: [testCase.photoUrl],
      });
      
      expect(result.ok).toBe(true);
      expect(result.estimate).toBeDefined();
      
      const foundDefects = result.estimate?.defects.map(d => d.defectName) || [];
      
      const allExpectedFound = testCase.expectedDefects.every(expected => 
        foundDefects.some(found => found.includes(expected))
      );
      
      if (allExpectedFound) {
        passCount++;
      }
    }
    
    expect(passCount).toBe(GROUND_TRUTH.length);
  });
});
