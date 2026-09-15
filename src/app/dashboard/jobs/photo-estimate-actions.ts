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
  priceBook?: Array<{ id: string; name: string; unitPrice: number; unit: string }>;
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
      priceBook,
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
export interface ApplyPhotoDefectsParams {
  jobId: string;
  estimateId: string;
  items: Array<{
    name: string;
    cost: number;
    suggestedServiceId?: string;
    quantity?: number;
    defectName: string;
    recommendedRepair: string;
    severity: string;
  }>;
  priceBook: Array<{ id: string; name: string; unitPrice: number; unit: string }>;
}

export async function applyPhotoDefectsAction(params: ApplyPhotoDefectsParams) {
  const { supabase, accountId, userId } = await requireOfficeContext('jobs.write');
  const { createPhotoEstimateReview, createPhotoEstimateQuoteLink } = await import('@/lib/photo-estimate/repository');
  
  const reviewedFindings = params.items.map(item => ({
    defectName: item.defectName,
    recommendedRepair: item.recommendedRepair,
    severity: item.severity
  }));
  
  const confirmedQuantities = params.items.map(item => ({
    serviceId: item.suggestedServiceId,
    quantity: item.quantity || 1
  }));
  
  const serviceSnapshots = params.items
    .filter(item => item.suggestedServiceId)
    .map(item => {
      const pbItem = params.priceBook.find(pb => pb.id === item.suggestedServiceId);
      return {
        id: item.suggestedServiceId,
        rate: pbItem?.unitPrice || 0,
        name: pbItem?.name || item.name,
        unit: pbItem?.unit || 'each'
      };
    });
    
  const calculatedLines = params.items.map(item => ({
    name: item.name,
    cost: item.cost,
    source_service_id: item.suggestedServiceId
  }));
  
  // We need to fetch the current review revision from photo_estimates to increment it,
  // or just use 1 for now if this is the first apply.
  const { data: estimate } = await supabase
    .from('photo_estimates')
    .select('current_review_revision')
    .eq('id', params.estimateId)
    .single();
    
  const nextRevision = (estimate?.current_review_revision || 0) + 1;
  
  await supabase
    .from('photo_estimates')
    .update({ current_review_revision: nextRevision })
    .eq('id', params.estimateId);
    
  await createPhotoEstimateReview(
    supabase,
    params.estimateId,
    nextRevision,
    userId,
    reviewedFindings,
    [], // dismissed_findings
    confirmedQuantities,
    serviceSnapshots,
    calculatedLines
  );
  
  // For each applied line, create a quote link. We will generate stable IDs.
  const linesWithStableIds = params.items.map(item => ({
    ...item,
    stable_quote_item_id: crypto.randomUUID()
  }));
  
  for (const line of linesWithStableIds) {
    await createPhotoEstimateQuoteLink(
      supabase,
      params.estimateId,
      nextRevision,
      params.jobId,
      line.stable_quote_item_id,
      line.suggestedServiceId || 'manual'
    );
  }
  
  return { ok: true, lines: linesWithStableIds };
}
