import type { SupabaseClient } from '@supabase/supabase-js';
import type { PhotoEstimate, PhotoEstimateInput, PhotoEstimateRun, PhotoEstimateReview, PhotoEstimateQuoteLink } from './contracts';

export async function getPhotoEstimate(
  supabase: SupabaseClient,
  estimateId: string
): Promise<PhotoEstimate | null> {
  const { data, error } = await supabase
    .from('photo_estimates')
    .select('*')
    .eq('id', estimateId)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    accountId: data.account_id,
    jobId: data.job_id,
    creatorId: data.creator_id,
    trade: data.trade,
    currentInputRevision: data.current_input_revision,
    currentReviewRevision: data.current_review_revision,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function createPhotoEstimate(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  creatorId: string,
  trade: string
): Promise<PhotoEstimate> {
  const { data, error } = await supabase
    .from('photo_estimates')
    .insert({
      account_id: accountId,
      job_id: jobId,
      creator_id: creatorId,
      trade,
      current_input_revision: 1,
      current_review_revision: 0,
    })
    .select('*')
    .single();

  if (error) throw error;

  return {
    id: data.id,
    accountId: data.account_id,
    jobId: data.job_id,
    creatorId: data.creator_id,
    trade: data.trade,
    currentInputRevision: data.current_input_revision,
    currentReviewRevision: data.current_review_revision,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function createPhotoEstimateInput(
  supabase: SupabaseClient,
  estimateId: string,
  revision: number,
  notes: string | undefined,
  selectedPhotoIds: string[],
  creatorId: string
): Promise<PhotoEstimateInput> {
  const { data, error } = await supabase
    .from('photo_estimate_inputs')
    .insert({
      estimate_id: estimateId,
      revision,
      notes,
      selected_photo_ids: selectedPhotoIds,
      created_by: creatorId,
    })
    .select('*')
    .single();

  if (error) throw error;

  return {
    id: data.id,
    estimateId: data.estimate_id,
    revision: data.revision,
    notes: data.notes,
    measurementSources: data.measurement_sources,
    selectedPhotoIds: data.selected_photo_ids,
    createdBy: data.created_by,
    createdAt: data.created_at,
  };
}

export async function createPhotoEstimateRun(
  supabase: SupabaseClient,
  estimateId: string,
  inputRevision: number,
  provider: string,
  status: 'pending' | 'processing' | 'completed' | 'failed',
  result: any = null,
  errorCategory: string | null = null,
): Promise<PhotoEstimateRun> {
  const { data, error } = await supabase
    .from('photo_estimate_runs')
    .insert({
      estimate_id: estimateId,
      input_revision: inputRevision,
      provider,
      status,
      result,
      error_category: errorCategory,
    })
    .select('*')
    .single();

  if (error) throw error;

  return {
    id: data.id,
    estimateId: data.estimate_id,
    inputRevision: data.input_revision,
    provider: data.provider,
    modelVersion: data.model_version,
    promptVersion: data.prompt_version,
    schemaVersion: data.schema_version,
    status: data.status,
    leaseToken: data.lease_token,
    leaseExpiresAt: data.lease_expires_at,
    attemptCount: data.attempt_count,
    result: data.result,
    errorCategory: data.error_category,
    usageMetadata: data.usage_metadata,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}


export async function createPhotoEstimateReview(
  supabase: any,
  estimateId: string,
  revision: number,
  reviewerId: string,
  reviewedFindings: any[],
  dismissedFindings: any[],
  confirmedQuantities: any[],
  serviceSnapshots: any[],
  calculatedLines: any[]
) {
  const { data, error } = await supabase
    .from('photo_estimate_reviews')
    .insert({
      estimate_id: estimateId,
      revision,
      reviewer_id: reviewerId,
      reviewed_findings: reviewedFindings,
      dismissed_findings: dismissedFindings,
      confirmed_quantities: confirmedQuantities,
      service_snapshots: serviceSnapshots,
      calculated_lines: calculatedLines,
    })
    .select()
    .single();

  if (error) {
    throw new Error(Failed to create photo estimate review: );
  }
  return data;
}

export async function createPhotoEstimateQuoteLink(
  supabase: any,
  estimateId: string,
  reviewRevision: number,
  jobId: string,
  stableQuoteItemId: string,
  sourceLineId: string
) {
  const { data, error } = await supabase
    .from('photo_estimate_quote_links')
    .insert({
      estimate_id: estimateId,
      review_revision: reviewRevision,
      job_id: jobId,
      stable_quote_item_id: stableQuoteItemId,
      source_line_id: sourceLineId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(Failed to create photo estimate quote link: );
  }
  return data;
}
