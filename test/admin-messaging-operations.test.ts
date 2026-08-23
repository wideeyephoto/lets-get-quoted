import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const loader = readFileSync('src/lib/admin-messaging.ts', 'utf8');
const page = readFileSync('src/app/admin/messaging/page.tsx', 'utf8');
const actions = readFileSync('src/app/admin/messaging/actions.ts', 'utf8');

describe('messaging operations surface', () => {
  it('shows missing reads as unavailable rather than healthy zeroes', () => {
    expect(loader).toContain("unavailable.push('sender inventory')");
    expect(loader).toContain("unavailable.push('delivery queue')");
    expect(page).toContain('Missing data is not an all-clear');
  });

  it('uses exact queue counts instead of silently truncating the operations view', () => {
    expect(loader).toContain("{ count: 'exact', head: true }");
    expect(loader).not.toContain('.limit(2000)');
  });

  it('does not mistake worker completion for final carrier delivery', () => {
    expect(loader).toContain('deliveryStatusCounts');
    expect(loader).toContain(".from('sms_events')");
    expect(page).toContain('Delivery failed');
    expect(page).toContain('customer-facing lifecycle after carrier callbacks');
  });

  it('surfaces exact review and messaging-webhook failure counts', () => {
    expect(loader).toContain('openReviewCount');
    expect(loader).toContain('unresolvedSmsWebhookFailureCount');
    expect(loader).toContain(".in('source', ['sms_inbound', 'sms_status'])");
    expect(page).toContain('/admin/failures#webhooks');
  });

  it('surfaces text-usage reconciliation failures without implying a resend', () => {
    expect(loader).toContain('usageReconciliationFailureCount');
    expect(loader).toContain(".eq('text_usage_state', 'reconciliation_failed')");
    expect(loader).toContain("unavailable.push('SMS usage reconciliation')");
    expect(page).toContain('Usage reconcile');
    expect(page).toContain('accounting review, not a resend');
  });

  it('surfaces every durable producer/action backlog and its repeated failures', () => {
    expect(loader).toContain('paymentProducerTaskCounts');
    expect(loader).toContain(".from('payment_sms_producer_tasks')");
    expect(loader).toContain('inboundActionTaskCounts');
    expect(loader).toContain(".from('sms_inbound_action_tasks')");
    expect(loader).toContain(".gte('attempt_count', 8)");
    expect(loader).toContain("unavailable.push('payment SMS producer queue')");
    expect(loader).toContain("unavailable.push('inbound SMS action queue')");
    expect(page).toContain('Payment SMS dead letters');
    expect(page).toContain('Inbound action deferred');
    expect(page).toContain('Inbound action dead letters');
    expect(loader).toContain("'dead_letter'");
    expect(page).toContain('neither authorizes a resend');
  });

  it('lists individual failed and indeterminate deliveries without offering blind retry', () => {
    expect(loader).toContain('deliveryExceptions');
    expect(loader).toContain(".in('task_state', ['failed', 'indeterminate'])");
    expect(loader).toContain(".from('sms_events')");
    expect(page).toContain('Delivery exceptions');
    expect(page).toContain('must never be retried');
    expect(page).not.toMatch(/retryMessaging|Retry delivery/);
  });

  it('reports all independent traffic-lane gates', () => {
    expect(loader).toContain('LGQ_SMS_SHARED_ENABLED');
    expect(loader).toContain('LGQ_SMS_DISPATCH_ENABLED');
    expect(loader).toContain('LGQ_SMS_CONTRACTOR_MESSAGING_ENABLED');
    expect(page).toContain('Traffic lanes');
  });

  it('requires MFA and an audited service-only RPC to close review work', () => {
    expect(actions).toContain("requireMfaPermission('ops.manage')");
    expect(actions).toContain("rpc('resolve_sms_operator_review_item'");
    expect(actions).toContain('logAdminAction');
    expect(actions).not.toMatch(/from\(['"]sms_operator_review_items['"]\)\.update/);
  });

  it('offers exact-event recovery only for an unmatched status review', () => {
    expect(actions).toContain('reconcileMessagingUnmatchedStatusAction');
    expect(actions).toContain("requireMfaPermission('ops.manage')");
    expect(actions).toContain("rpc('reconcile_sms_unmatched_status'");
    expect(actions).toContain('p_sms_event_id: smsEventId');
    expect(actions).toContain('p_resolution_actor: ctx.adminEmail');
    expect(actions).toContain('logAdminAction');
    expect(page).toContain("item.reason === 'unmatched_status'");
    expect(page).toContain('Exact SMS event UUID');
    expect(page).toContain('it never retries or resends');
  });

  it('does not expose full phone numbers in the review list', () => {
    expect(page).toContain('function maskPhone');
    expect(page).toContain('maskPhone(item.fromNumber)');
    expect(page).toContain('maskPhone(item.toNumber)');
    expect(page).toContain('maskPhone(item.phoneNumber)');
  });
});
