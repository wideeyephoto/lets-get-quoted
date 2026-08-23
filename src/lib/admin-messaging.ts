import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { outboundSmsSuppression, smsProviderSummary } from '@/lib/sms-provider';

type Row = Record<string, unknown>;

export type MessagingSenderHealth = Readonly<{
  id: string;
  provider: string;
  number: string;
  purpose: string;
  accountId: string | null;
  campaignId: string | null;
  assignmentState: string;
  provisioningStatus: string;
  inboundReady: boolean;
  inboundWebhookUrl: string | null;
  lastVerifiedAt: string | null;
}>;

export type MessagingReviewItem = Readonly<{
  id: string;
  reason: string;
  severity: string;
  provider: string;
  providerEventId: string | null;
  accountId: string | null;
  fromNumber: string | null;
  toNumber: string | null;
  providerStatus: string | null;
  providerErrorCode: string | null;
  body: string | null;
  createdAt: string;
}>;

export type MessagingDeliveryException = Readonly<{
  eventId: string;
  taskState: 'failed' | 'indeterminate';
  accountId: string;
  phoneNumber: string;
  messageKind: string | null;
  provider: string | null;
  deliveryStatus: string;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type MessagingOperationsHealth = Readonly<{
  provider: ReturnType<typeof smsProviderSummary>;
  suppression: string | null;
  workerEnabled: boolean;
  purposeGates: Readonly<Record<string, boolean>>;
  canaryAccounts: readonly string[];
  senders: readonly MessagingSenderHealth[];
  taskCounts: Readonly<Record<string, number>>;
  paymentProducerTaskCounts: Readonly<Record<string, number>>;
  inboundActionTaskCounts: Readonly<Record<string, number>>;
  deliveryStatusCounts: Readonly<Record<string, number>>;
  openReviewCount: number | null;
  unresolvedSmsWebhookFailureCount: number | null;
  usageReconciliationFailureCount: number | null;
  inboundActionHighAttemptCount: number | null;
  oldestQueuedAt: string | null;
  oldestPaymentProducerBacklogAt: string | null;
  oldestInboundActionBacklogAt: string | null;
  latestSuccessfulOutboundAt: string | null;
  latestInboundAt: string | null;
  openReviews: readonly MessagingReviewItem[];
  deliveryExceptions: readonly MessagingDeliveryException[];
  unavailable: readonly string[];
}>;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function rows(value: unknown): Row[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Row => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];
}

function canaries(): string[] {
  return (process.env.LGQ_SMS_CANARY_ACCOUNT_IDS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/** Read-only operational snapshot. Missing dark migrations are shown, never disguised as zero. */
export async function loadMessagingOperationsHealth(
  admin: SupabaseClient,
): Promise<MessagingOperationsHealth> {
  const unavailable: string[] = [];
  const taskStates = ['queued', 'leased', 'failed', 'indeterminate', 'cancelled'] as const;
  const paymentProducerStates = ['ready', 'leased', 'retry_wait', 'completed', 'dead_letter'] as const;
  const inboundActionStates = ['pending', 'processing', 'failed', 'completed', 'dead_letter'] as const;
  const deliveryStatuses = ['queued', 'sending', 'sent', 'delivered', 'failed', 'indeterminate', 'cancelled'] as const;
  const [
    coreResults,
    taskCountResults,
    deliveryCountResults,
    reviewCountResult,
    webhookFailureCountResult,
    usageReconciliationFailureResult,
    paymentProducerCountResults,
    inboundActionCountResults,
    paymentProducerOldestResult,
    inboundActionOldestResult,
    inboundActionHighAttemptResult,
  ] = await Promise.all([
    Promise.all([
    admin.from('sms_sender_numbers')
      .select('id, provider, e164_number, purpose, account_id, campaign_id, assignment_state, provisioning_status, inbound_ready, inbound_webhook_url, last_verified_at')
      .order('created_at', { ascending: true })
      .limit(250),
    admin.from('sms_delivery_tasks')
      .select('created_at')
      .eq('task_state', 'queued')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin.from('sms_events')
      .select('provider_accepted_at, delivered_at, sent_at')
      .in('status', ['sent', 'delivered'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from('sms_messages')
      .select('created_at')
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from('sms_operator_review_items')
      .select('id, reason, severity, provider, provider_event_id, account_id, from_number, to_number, provider_status, provider_error_code, message_body, created_at')
      .eq('review_state', 'open')
      .order('created_at', { ascending: true })
      .limit(100),
    admin.from('sms_delivery_tasks')
      .select('sms_event_id, task_state, last_error_code, created_at, updated_at')
      .in('task_state', ['failed', 'indeterminate'])
      .order('updated_at', { ascending: false })
      .limit(100),
    ]),
    Promise.all(taskStates.map((state) => admin
      .from('sms_delivery_tasks')
      .select('sms_event_id', { count: 'exact', head: true })
      .eq('task_state', state))),
    Promise.all(deliveryStatuses.map((status) => admin
      .from('sms_events')
      .select('id', { count: 'exact', head: true })
      .eq('status', status))),
    admin.from('sms_operator_review_items')
      .select('id', { count: 'exact', head: true })
      .eq('review_state', 'open'),
    admin.from('webhook_failures')
      .select('id', { count: 'exact', head: true })
      .in('source', ['sms_inbound', 'sms_status'])
      .is('resolved_at', null),
    admin.from('sms_events')
      .select('id', { count: 'exact', head: true })
      .eq('text_usage_state', 'reconciliation_failed'),
    Promise.all(paymentProducerStates.map((state) => admin
      .from('payment_sms_producer_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('task_state', state))),
    Promise.all(inboundActionStates.map((state) => admin
      .from('sms_inbound_action_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('task_state', state))),
    admin.from('payment_sms_producer_tasks')
      .select('created_at, next_attempt_at')
      .in('task_state', ['ready', 'retry_wait'])
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin.from('sms_inbound_action_tasks')
      .select('created_at, next_attempt_at')
      .in('task_state', ['pending', 'failed'])
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin.from('sms_inbound_action_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('task_state', 'dead_letter')
      .gte('attempt_count', 8),
  ]);
  const [
    senderResult,
    oldestQueuedResult,
    outboundResult,
    inboundResult,
    reviewResult,
    deliveryExceptionTaskResult,
  ] = coreResults;

  if (senderResult.error) unavailable.push('sender inventory');
  if (oldestQueuedResult.error || taskCountResults.some((result) => result.error)) {
    unavailable.push('delivery queue');
  }
  if (outboundResult.error) unavailable.push('outbound lifecycle');
  if (inboundResult.error) unavailable.push('inbound lifecycle');
  if (reviewResult.error || reviewCountResult.error) unavailable.push('operator review');
  if (deliveryExceptionTaskResult.error) unavailable.push('delivery exception details');
  if (deliveryCountResults.some((result) => result.error)) unavailable.push('delivery lifecycle counts');
  if (webhookFailureCountResult.error) unavailable.push('SMS webhook failures');
  if (usageReconciliationFailureResult.error) unavailable.push('SMS usage reconciliation');
  if (paymentProducerCountResults.some((result) => result.error)
      || paymentProducerOldestResult.error) unavailable.push('payment SMS producer queue');
  if (inboundActionCountResults.some((result) => result.error)
      || inboundActionOldestResult.error || inboundActionHighAttemptResult.error) {
    unavailable.push('inbound SMS action queue');
  }

  const taskCounts: Record<string, number> = {};
  for (let index = 0; index < taskStates.length; index += 1) {
    const result = taskCountResults[index];
    if (!result?.error && typeof result?.count === 'number') {
      taskCounts[taskStates[index]] = result.count;
    }
  }
  const deliveryStatusCounts: Record<string, number> = {};
  for (let index = 0; index < deliveryStatuses.length; index += 1) {
    const result = deliveryCountResults[index];
    if (!result?.error && typeof result?.count === 'number') {
      deliveryStatusCounts[deliveryStatuses[index]] = result.count;
    }
  }
  const paymentProducerTaskCounts: Record<string, number> = {};
  for (let index = 0; index < paymentProducerStates.length; index += 1) {
    const result = paymentProducerCountResults[index];
    if (!result?.error && typeof result?.count === 'number') {
      paymentProducerTaskCounts[paymentProducerStates[index]] = result.count;
    }
  }
  const inboundActionTaskCounts: Record<string, number> = {};
  for (let index = 0; index < inboundActionStates.length; index += 1) {
    const result = inboundActionCountResults[index];
    if (!result?.error && typeof result?.count === 'number') {
      inboundActionTaskCounts[inboundActionStates[index]] = result.count;
    }
  }
  const oldestQueued = (oldestQueuedResult.data ?? null) as Row | null;
  const oldestQueuedAt = oldestQueuedResult.error ? null : text(oldestQueued?.created_at);
  const oldestPaymentProducer = (paymentProducerOldestResult.data ?? null) as Row | null;
  const oldestInboundAction = (inboundActionOldestResult.data ?? null) as Row | null;

  const outbound = (outboundResult.data ?? null) as Row | null;
  const inbound = (inboundResult.data ?? null) as Row | null;

  const exceptionTasks = deliveryExceptionTaskResult.error
    ? []
    : rows(deliveryExceptionTaskResult.data);
  const exceptionEventIds = exceptionTasks
    .map((task) => text(task.sms_event_id))
    .filter((value): value is string => value !== null);
  let exceptionEvents: Row[] = [];
  if (exceptionEventIds.length > 0) {
    const result = await admin.from('sms_events')
      .select('id, account_id, phone_number, message_kind, provider, status, created_at, updated_at')
      .in('id', exceptionEventIds);
    if (result.error) unavailable.push('delivery exception events');
    else exceptionEvents = rows(result.data);
  }
  const exceptionEventById = new Map(
    exceptionEvents.map((event) => [text(event.id), event] as const),
  );

  return Object.freeze({
    provider: smsProviderSummary(),
    suppression: outboundSmsSuppression(),
    workerEnabled: process.env.LGQ_SMS_DELIVERY_WORKER_ENABLED === '1',
    purposeGates: Object.freeze({
      lgq_shared: process.env.LGQ_SMS_SHARED_ENABLED === '1',
      lgq_dispatch: process.env.LGQ_SMS_DISPATCH_ENABLED === '1',
      contractor_dedicated: process.env.LGQ_SMS_CONTRACTOR_MESSAGING_ENABLED === '1',
    }),
    canaryAccounts: Object.freeze(canaries()),
    senders: Object.freeze((senderResult.error ? [] : rows(senderResult.data)).map((row) => Object.freeze({
      id: text(row.id) ?? '',
      provider: text(row.provider) ?? 'unknown',
      number: text(row.e164_number) ?? '—',
      purpose: text(row.purpose) ?? 'unknown',
      accountId: text(row.account_id),
      campaignId: text(row.campaign_id),
      assignmentState: text(row.assignment_state) ?? 'unknown',
      provisioningStatus: text(row.provisioning_status) ?? 'unknown',
      inboundReady: row.inbound_ready === true,
      inboundWebhookUrl: text(row.inbound_webhook_url),
      lastVerifiedAt: text(row.last_verified_at),
    }))),
    taskCounts: Object.freeze(taskCounts),
    paymentProducerTaskCounts: Object.freeze(paymentProducerTaskCounts),
    inboundActionTaskCounts: Object.freeze(inboundActionTaskCounts),
    deliveryStatusCounts: Object.freeze(deliveryStatusCounts),
    openReviewCount: reviewCountResult.error || typeof reviewCountResult.count !== 'number'
      ? null
      : reviewCountResult.count,
    unresolvedSmsWebhookFailureCount: webhookFailureCountResult.error
      || typeof webhookFailureCountResult.count !== 'number'
      ? null
      : webhookFailureCountResult.count,
    usageReconciliationFailureCount: usageReconciliationFailureResult.error
      || typeof usageReconciliationFailureResult.count !== 'number'
      ? null
      : usageReconciliationFailureResult.count,
    inboundActionHighAttemptCount: inboundActionHighAttemptResult.error
      || typeof inboundActionHighAttemptResult.count !== 'number'
      ? null
      : inboundActionHighAttemptResult.count,
    oldestQueuedAt,
    oldestPaymentProducerBacklogAt: paymentProducerOldestResult.error
      ? null
      : text(oldestPaymentProducer?.created_at),
    oldestInboundActionBacklogAt: inboundActionOldestResult.error
      ? null
      : text(oldestInboundAction?.created_at),
    latestSuccessfulOutboundAt: outbound
      ? text(outbound.delivered_at) ?? text(outbound.provider_accepted_at) ?? text(outbound.sent_at)
      : null,
    latestInboundAt: inbound ? text(inbound.created_at) : null,
    openReviews: Object.freeze((reviewResult.error ? [] : rows(reviewResult.data)).map((row) => Object.freeze({
      id: text(row.id) ?? '',
      reason: text(row.reason) ?? 'unknown',
      severity: text(row.severity) ?? 'warning',
      provider: text(row.provider) ?? 'unknown',
      providerEventId: text(row.provider_event_id),
      accountId: text(row.account_id),
      fromNumber: text(row.from_number),
      toNumber: text(row.to_number),
      providerStatus: text(row.provider_status),
      providerErrorCode: text(row.provider_error_code),
      body: text(row.message_body),
      createdAt: text(row.created_at) ?? '',
    }))),
    deliveryExceptions: Object.freeze(exceptionTasks.flatMap((task) => {
      const eventId = text(task.sms_event_id);
      const event = eventId ? exceptionEventById.get(eventId) : null;
      const taskState = text(task.task_state);
      if (!eventId || !event || (taskState !== 'failed' && taskState !== 'indeterminate')) return [];
      return [Object.freeze({
        eventId,
        taskState,
        accountId: text(event.account_id) ?? '',
        phoneNumber: text(event.phone_number) ?? '',
        messageKind: text(event.message_kind),
        provider: text(event.provider),
        deliveryStatus: text(event.status) ?? 'unknown',
        errorCode: text(task.last_error_code),
        createdAt: text(task.created_at) ?? text(event.created_at) ?? '',
        updatedAt: text(task.updated_at) ?? text(event.updated_at) ?? '',
      })];
    })),
    unavailable: Object.freeze(unavailable),
  });
}
