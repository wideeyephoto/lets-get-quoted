'use server';

import { requireOfficeContext } from '@/lib/auth';
import {
  analyzePhotoDefectsAndEstimate,
  type DefectItem,
  type PhotoDefectEstimateResult,
} from '@/lib/multimodal-defect-estimator';

export interface AnalyzePhotoDefectsParams {
  jobId?: string;
  trade: string;
  photoUrls?: string[];
  photoPaths?: string[];
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
    const { supabase, accountId, userId } = await requireOfficeContext('jobs.read');

    const trade = params.trade?.trim() || 'General Repair';
    const notes = params.notes?.trim() || undefined;
    const photoUrls = params.photoUrls || [];

    const { listServices } = await import('@/lib/services');
    const priceBookData = await listServices(supabase, accountId, { activeOnly: true });
    const priceBook = priceBookData.map(s => ({
      id: s.id,
      name: s.name,
      unitPrice: s.unit_price,
      unit: s.unit
    }));

    const estimateResult = await analyzePhotoDefectsAndEstimate({
      trade,
      photoUrls,
      notes,
      priceBook,
    });

    if (params.jobId) {
      const { createPhotoEstimate, createPhotoEstimateInput, createPhotoEstimateRun } = await import('@/lib/photo-estimate/repository');
      
      const estimate = await createPhotoEstimate(supabase, accountId, params.jobId, userId, trade);
      await createPhotoEstimateInput(supabase, estimate.id, 1, notes, params.photoPaths || [], userId);
      await createPhotoEstimateRun(
        supabase,
        estimate.id,
        1,
        'gemini',
        'completed',
        estimateResult,
        null
      );
    }

    return {
      ok: true,
      estimate: estimateResult,
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