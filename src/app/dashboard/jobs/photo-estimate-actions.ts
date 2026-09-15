'use server';

import { requireOfficeContext } from '@/lib/auth';
import {
  analyzePhotoDefectsAndEstimate,
  type DefectItem,
  type PhotoDefectEstimateResult,
} from '@/lib/multimodal-defect-estimator';

export interface AnalyzePhotoDefectsParams {
  trade: string;
  photoUrls?: string[];
  notes?: string;
}

export interface AnalyzePhotoDefectsResponse {
  ok: boolean;
  estimate?: PhotoDefectEstimateResult;
  message?: string;
}

export async function uploadEstimatePhotoAction(formData: FormData) {
  const context = await requireOfficeContext('jobs.write');
  const file = formData.get('photo') as File;
  if (!file) throw new Error('Missing photo');

  // We need uploadJobPhoto from job-photo-storage
  const { uploadJobPhoto, createJobPhotoUrls } = await import('@/lib/job-photo-storage');
  
  const path = await uploadJobPhoto(context.accountId, file);
  const [url] = await createJobPhotoUrls(context.accountId, [path]);
  
  return { path, url };
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
    const photoUrls = params.photoUrls || [];

    const estimate = await analyzePhotoDefectsAndEstimate({
      trade,
      photoUrls,
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