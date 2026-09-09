'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireMfaPermission } from '@/lib/auth';
import { logAdminAction } from '@/lib/admin';
import { signalWireVoiceScope } from '@/lib/voice/auth';
import { recoverVoiceReceipt } from '@/lib/voice/receipt-recovery';
import { safeVoiceReference } from '@/lib/admin-voice-receipts';

export async function retryVoiceReceiptAction(eventId: string, formData: FormData) {
  const ctx = await requireMfaPermission('ops.manage');
  const reason = String(formData.get('reason') ?? '').trim();
  if (reason.length < 10 || reason.length > 500) redirect('/admin/failures?voice=reason#voice-receipts');
  if (!safeVoiceReference(eventId)) redirect('/admin/failures?voice=review#voice-receipts');
  const scope = signalWireVoiceScope();
  if (!scope) redirect('/admin/failures?voice=review#voice-receipts');

  // Record intent durably before recovery, including when its response is lost.
  const audit = await ctx.admin.from('admin_actions').insert({
    admin_email: ctx.adminEmail, staff_id: ctx.staff?.id || null,
    ip: ctx.ip ?? null, request_id: ctx.requestId ?? null, permission: ctx.permission ?? null,
    action: 'voice_receipt_retry_requested', target_type: 'voice_event', target_id: eventId, reason,
  });
  if (audit.error) redirect('/admin/failures?voice=unconfirmed#voice-receipts');
  let outcome = 'unconfirmed';
  try {
    const result = await recoverVoiceReceipt(ctx.admin, eventId, { scope, apply: true });
    outcome = ['processed', 'processed_before'].includes(result.status) ? 'processed'
      : ['not_pending', 'ignored'].includes(result.status) ? 'complete'
        : ['busy', 'deferred'].includes(result.status) ? 'deferred'
          : result.status === 'retryable_failure' ? 'retry_scheduled' : 'review';
    await logAdminAction(ctx.admin, ctx, {
      action: 'voice_receipt_retry_result', targetType: 'voice_event', targetId: eventId,
      reason, meta: { status: result.status },
    });
  } catch {
    // A lost response is not evidence that settlement or notification failed.
    // The existing lease and idempotency keys decide whether a later retry runs.
  }
  revalidatePath('/admin/failures');
  redirect(`/admin/failures?voice=${outcome}#voice-receipts`);
}

export async function resolveWebhookGroupAction(ids: string[], formData: FormData) {
  const ctx = await requireMfaPermission('ops.manage');
  const reason = String(formData.get('reason') ?? '').trim();
  if (reason.length < 4) redirect('/admin/failures?error=reason#webhooks');
  const safeIds = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100);
  if (!safeIds.length) redirect('/admin/failures?error=missing#webhooks');
  const resolvedAt = new Date().toISOString();
  const { error } = await ctx.admin.from('webhook_failures').update({ resolved_at: resolvedAt, resolved_by: ctx.adminEmail }).in('id', safeIds);
  if (error) redirect('/admin/failures?error=failed#webhooks');
  await logAdminAction(ctx.admin, ctx, {
    action: 'webhook_failure_group_resolve',
    targetType: 'webhook_failure_group',
    reason,
    after: { resolved_at: resolvedAt },
    meta: { count: safeIds.length, ids: safeIds },
  });
  revalidatePath('/admin');
  revalidatePath('/admin/health');
  revalidatePath('/admin/failures');
  redirect('/admin/failures?done=resolved#webhooks');
}
