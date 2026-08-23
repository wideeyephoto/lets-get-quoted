'use server';

import { revalidatePath } from 'next/cache';

import { logAdminAction } from '@/lib/admin';
import { requireMfaPermission } from '@/lib/auth';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function resolveMessagingReviewAction(formData: FormData): Promise<void> {
  const ctx = await requireMfaPermission('ops.manage');
  const reviewId = String(formData.get('reviewId') ?? '').trim().toLowerCase();
  const resolution = String(formData.get('resolution') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  if (!UUID.test(reviewId)) throw new Error('Messaging review item is invalid.');
  if (!['resolved', 'dismissed'].includes(resolution)) throw new Error('Messaging review resolution is invalid.');
  if (note.length < 3 || note.length > 2000) throw new Error('Add a short resolution note.');

  const { data, error } = await ctx.admin.rpc('resolve_sms_operator_review_item', {
    p_review_item_id: reviewId,
    p_resolution: resolution,
    p_resolution_note: note,
  });
  if (error || data !== true) throw new Error('Messaging review could not be resolved.');

  await logAdminAction(ctx.admin, ctx, {
    action: 'sms_operator_review_resolve',
    targetType: 'sms_operator_review_item',
    targetId: reviewId,
    reason: note,
    meta: { resolution },
  });
  revalidatePath('/admin/messaging');
  revalidatePath('/admin/health');
}

/** Bind one unmatched authenticated status receipt to an exact uncertain send. */
export async function reconcileMessagingUnmatchedStatusAction(
  formData: FormData,
): Promise<void> {
  const ctx = await requireMfaPermission('ops.manage');
  const reviewId = String(formData.get('reviewId') ?? '').trim().toLowerCase();
  const smsEventId = String(formData.get('smsEventId') ?? '').trim().toLowerCase();
  const note = String(formData.get('note') ?? '').trim();
  if (!UUID.test(reviewId)) throw new Error('Messaging review item is invalid.');
  if (!UUID.test(smsEventId)) throw new Error('Enter the exact SMS event UUID.');
  if (note.length < 3 || note.length > 2000) throw new Error('Add a short reconciliation note.');

  const { data, error } = await ctx.admin.rpc('reconcile_sms_unmatched_status', {
    p_review_item_id: reviewId,
    p_sms_event_id: smsEventId,
    p_resolution_note: note,
    p_resolution_actor: ctx.adminEmail,
  });
  if (error || data !== true) {
    throw new Error('Unmatched status could not be reconciled to that SMS event.');
  }

  await logAdminAction(ctx.admin, ctx, {
    action: 'sms_unmatched_status_reconcile',
    targetType: 'sms_operator_review_item',
    targetId: reviewId,
    reason: note,
    meta: { smsEventId },
  });
  revalidatePath('/admin/messaging');
  revalidatePath('/admin/health');
}
