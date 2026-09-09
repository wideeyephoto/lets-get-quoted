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
  // Authenticate before revealing supported recovery paths; let step-up redirects propagate.
  const ctx = await requireMfaPermission('ops.manage');
  const trimmedReason = reason?.trim() || '';
  if (trimmedReason.length < 4) {
    return { success: false, message: 'A specific operational reason (minimum 4 characters) is required.' };
  }

  if (ledgerId === 'subscription_events') {
    return {
      success: false,
      message: 'subscription_events: broad requeue is prohibited. Terminal subscription events require targeted recovery after verifying cause and idempotency.',
    };
  }

  // Guard must run before try so step-up redirects are not swallowed
  const { admin, staff } = ctx;
  const nowIso = new Date().toISOString();
  let count = 0;

  try {

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

    let message = `Successfully requeued ${count} dead-lettered item(s) in '${ledgerId}'.`;
    if (count === 0) {
      if (['connected_success_events', 'connected_expiration_events'].includes(ledgerId)) {
        const scope = 'connected_payment';
        let checkQuery = admin
          .from('billing_events')
          .select('id', { count: 'exact', head: true })
          .eq('event_scope', scope)
          .eq('processing_status', 'failed');
        if (ledgerId === 'connected_success_events') {
          checkQuery = checkQuery.in('event_type', ['checkout.session.completed', 'checkout.session.async_payment_succeeded']);
        } else if (ledgerId === 'connected_expiration_events') {
          checkQuery = checkQuery.eq('event_type', 'checkout.session.expired');
        }
        const { count: scheduledCount } = await checkQuery;
        if (scheduledCount && scheduledCount > 0) {
          message = `0 item(s) requeued in '${ledgerId}'. ${scheduledCount} failed event(s) have active retry backoffs scheduled (next_attempt_at is set) and were preserved.`;
        } else {
          message = `0 item(s) requeued in '${ledgerId}': no failed events exist.`;
        }
      } else {
        message = `0 item(s) requeued in '${ledgerId}': no dead-lettered tasks exist.`;
      }
    }

    return {
      success: true,
      message,
      requeuedCount: count,
    };
  } catch (err) {
    return {
      success: false,
      message: `Requeue failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
