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
