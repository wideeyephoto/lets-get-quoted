'use server';

import { revalidatePath } from 'next/cache';
import { requireMfaPermission } from '@/lib/auth';
import { logAdminAction } from '@/lib/admin';

export type RequeueDeadLetterResult = {
  success: boolean;
  message: string;
  requeuedCount?: number;
};

/**
 * Requeues dead-lettered tasks or failed inbox events for a given billing operations ledger.
 * Strictly gated behind MFA with the 'ops.manage' permission.
 */
export async function requeueBillingDeadLettersAction(
  ledgerId: string,
  reason: string,
): Promise<RequeueDeadLetterResult> {
  const trimmedReason = reason?.trim() || '';
  if (trimmedReason.length < 4) {
    return { success: false, message: 'A specific operational reason (minimum 4 characters) is required.' };
  }

  try {
    const ctx = await requireMfaPermission('ops.manage');
    const { admin, staff } = ctx;
    const nowIso = new Date().toISOString();
    let count = 0;

    switch (ledgerId) {
      case 'quick_stop_payment_tasks': {
        const { data, error } = await admin
          .from('quick_stop_payment_tasks')
          .update({
            task_state: 'ready',
            dead_lettered_at: null,
            next_attempt_at: nowIso,
            lease_expires_at: null,
            last_error_code: null,
          })
          .eq('task_state', 'dead_letter')
          .select('id');
        if (error) throw error;
        count = data?.length ?? 0;
        break;
      }

      case 'direct_settlement_tasks': {
        const { data, error } = await admin
          .from('billing_direct_payment_settlement_tasks')
          .update({
            task_state: 'ready',
            dead_lettered_at: null,
            next_attempt_at: nowIso,
            lease_expires_at: null,
          })
          .eq('task_state', 'dead_letter')
          .select('id');
        if (error) throw error;
        count = data?.length ?? 0;
        break;
      }

      case 'subscription_events': {
        const { data, error } = await admin
          .from('billing_events')
          .update({
            processing_status: 'received',
            next_attempt_at: nowIso,
          })
          .eq('event_scope', 'platform_subscription')
          .eq('processing_status', 'failed')
          .is('next_attempt_at', null)
          .select('id');
        if (error) throw error;
        count = data?.length ?? 0;
        break;
      }

      case 'connected_success_events': {
        const { data, error } = await admin
          .from('billing_events')
          .update({
            processing_status: 'received',
            next_attempt_at: nowIso,
          })
          .eq('event_scope', 'connected_payment')
          .in('event_type', ['checkout.session.completed', 'checkout.session.async_payment_succeeded'])
          .eq('processing_status', 'failed')
          .is('next_attempt_at', null)
          .select('id');
        if (error) throw error;
        count = data?.length ?? 0;
        break;
      }

      case 'connected_expiration_events': {
        const { data, error } = await admin
          .from('billing_events')
          .update({
            processing_status: 'received',
            next_attempt_at: nowIso,
          })
          .eq('event_scope', 'connected_payment')
          .eq('event_type', 'checkout.session.expired')
          .eq('processing_status', 'failed')
          .is('next_attempt_at', null)
          .select('id');
        if (error) throw error;
        count = data?.length ?? 0;
        break;
      }

      default:
        return { success: false, message: `Unsupported or unknown ledger '${ledgerId}'.` };
    }

    await logAdminAction(admin, ctx, {
      action: 'billing_dead_letter_requeue',
      targetType: 'billing_ledger',
      targetId: ledgerId,
      reason: trimmedReason,
      meta: {
        ledgerId,
        requeuedCount: count,
        requeuedAt: nowIso,
        operatorEmail: staff?.email,
      },
    });

    revalidatePath('/admin/billing-operations');

    return {
      success: true,
      message: `Successfully requeued ${count} dead-lettered item(s) in '${ledgerId}'.`,
      requeuedCount: count,
    };
  } catch (err) {
    return {
      success: false,
      message: `Requeue failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
