import { GoogleGenAI } from '@google/genai';

export interface DefectItem {
  defectName: string;
  severity: 'minor' | 'moderate' | 'severe' | 'structural';
  recommendedRepair: string;
  estimatedLaborHours: number;
  estimatedMaterialCostDollars: number;
  estimatedTotalDollars: number;
}

export interface PhotoDefectEstimateResult {
  trade: string;
  overallDamageSummary: string;
  defects: DefectItem[];
  totalEstimatedRepairDollars: number;
  urgency: 'routine' | 'urgent' | 'emergency';
  suggestedQuoteDraft: {
    title: string;
    lineItems: Array<{ name: string; cost: number }>;
  };
}

/**
 * Analyzes visual defects from homeowner or field photos and generates structured quote line items.
 */
export async function analyzePhotoDefectsAndEstimate(params: {
  trade: string;
  photoUrl?: string;
  notes?: string;
}): Promise<PhotoDefectEstimateResult> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const { trade, notes, photoUrl } = params;

  if (!photoUrl) {
    throw new Error('A damage or inspection photo is required to run the AI defect estimator.');
  }

  // Temporary unavailability until real analysis (Phase 3) is implemented
  throw new Error('AI photo analysis is currently undergoing upgrades to support true multimodal processing. Please proceed with a manual quote for this job.');
}
