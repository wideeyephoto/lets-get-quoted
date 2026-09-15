'use server';

import { requireOfficeContext } from '@/lib/auth';
import {
  analyzePhotoDefectsAndEstimate,
  type DefectItem,
  type PhotoDefectEstimateResult,
} from '@/lib/multimodal-defect-estimator';

export interface AnalyzePhotoDefectsParams {
  trade: string;
  photoUrl?: string;
  notes?: string;
}

export interface AnalyzePhotoDefectsResponse {
  ok: boolean;
  estimate?: PhotoDefectEstimateResult;
  message?: string;
}

/**
 * Server action: Analyzes job or site photos for defects, recommending structured repairs
 * and calculating labor/material costs using the multimodal AI estimator.
 */
export async function analyzePhotoDefectsAction(
  params: AnalyzePhotoDefectsParams,
): Promise<AnalyzePhotoDefectsResponse> {
  try {
    await requireOfficeContext('jobs.read');

    const trade = params.trade?.trim() || 'General Repair';
    const notes = params.notes?.trim() || undefined;
    const photoUrl = params.photoUrl?.trim() || undefined;

    const estimate = await analyzePhotoDefectsAndEstimate({
      trade,
      photoUrl,
      notes,
    });

    return {
      ok: true,
      estimate,
    };
  } catch (error) {
    console.error('Failed to analyze photo defects:', error);
    const message = error instanceof Error ? error.message : 'Failed to analyze photo defects.';
    return {
      ok: false,
      message,
    };
  }
}