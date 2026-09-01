import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { decryptWebhookSecret, type EncryptedSecretPayload } from '@/lib/public-api/webhook-vault-crypto';
import { computeWebhookSignature } from '@/lib/public-api/webhook-signatures';
import { validateWebhookUrl } from '@/lib/public-api/ssrf-guard';

export type ClaimedWebhookTask = {
  delivery_id: string;
  subscription_id: string;
  account_id: string;
  event_id: string;
  attempt_number: number;
  lease_token: string;
  lease_expires_at: string;
  target_url: string;
  encrypted_secret: EncryptedSecretPayload;
  event_payload: Record<string, unknown>;
};

export type WebhookBatchResult = {
  claimedCount: number;
  completedCount: number;
  failedCount: number;
  disabledCount: number;
  deadLetterCount: number;
};

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_PREVIEW_LENGTH = 2000;

export function calculateExponentialBackoffSeconds(attemptNumber: number): number {
  // 1st: 15s, 2nd: 60s, 3rd: 300s (5m), 4th: 900s (15m), 5th: 3600s (1h), 6th: 7200s (2h), 7th+: 14400s (4h)
  const schedule = [15, 60, 300, 900, 3600, 7200, 14400];
  const idx = Math.min(Math.max(0, attemptNumber - 1), schedule.length - 1);
  return schedule[idx] ?? 60;
}

export type DeliverTaskOutcome = 'completed' | 'failed' | 'disabled' | 'dead_letter';

export async function deliverSingleWebhookTask(
  admin: SupabaseClient,
  task: ClaimedWebhookTask
): Promise<DeliverTaskOutcome> {
  const startTime = Date.now();
  let secret: string;
  try {
    secret = decryptWebhookSecret(task.encrypted_secret);
  } catch {
    // Un-decryptable secret -> fatal, dead-letter
    await admin.rpc('fail_webhook_delivery', {
      p_delivery_id: task.delivery_id,
      p_lease_token: task.lease_token,
      p_error_code: 'crypto_secret_invalid',
      p_error_message: 'Failed to decrypt webhook signing secret.',
      p_retryable: false,
      p_backoff_seconds: 0,
      p_disable_subscription: false,
    });
    return 'dead_letter';
  }

  // SSRF Validation
  const ssrf = await validateWebhookUrl(task.target_url);
  if (!ssrf.safe) {
    await admin.rpc('fail_webhook_delivery', {
      p_delivery_id: task.delivery_id,
      p_lease_token: task.lease_token,
      p_error_code: 'ssrf_blocked',
      p_error_message: ssrf.reason,
      p_retryable: false,
      p_backoff_seconds: 0,
      p_disable_subscription: true,
      p_disable_reason: 'ssrf_policy_violation',
    });
    return 'disabled';
  }

  const rawBody = JSON.stringify(task.event_payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const sigHeader = computeWebhookSignature(secret, task.event_id, rawBody, timestamp);

  try {
    const response = await fetch(task.target_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LetsGetQuoted-Webhooks/1.0',
        'LGQ-Event-Id': task.event_id,
        'LGQ-Timestamp': String(timestamp),
        'LGQ-Signature': sigHeader.headerValue,
      },
      body: rawBody,
      redirect: 'manual', // Prevent following unchecked redirects
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    const durationMs = Math.max(1, Date.now() - startTime);
    const httpStatus = response.status;
    let responseBodyPreview = '';
    try {
      const text = await response.text();
      responseBodyPreview = text.slice(0, MAX_PREVIEW_LENGTH);
    } catch {
      // Body reading error
    }

    if (response.ok) {
      // 2xx Success
      await admin.rpc('complete_webhook_delivery', {
        p_delivery_id: task.delivery_id,
        p_lease_token: task.lease_token,
        p_duration_ms: durationMs,
        p_http_status: httpStatus,
        p_response_preview: responseBodyPreview,
      });
      return 'completed';
    }

    if (httpStatus === 410) {
      // 410 Gone: Destination has permanently unsubscribed
      await admin.rpc('fail_webhook_delivery', {
        p_delivery_id: task.delivery_id,
        p_lease_token: task.lease_token,
        p_error_code: 'http_410_gone',
        p_error_message: `HTTP 410 Gone: ${responseBodyPreview.slice(0, 200)}`,
        p_retryable: false,
        p_backoff_seconds: 0,
        p_disable_subscription: true,
        p_disable_reason: 'received_410_gone',
      });
      return 'disabled';
    }

    if (httpStatus === 429) {
      // 429 Too Many Requests: inspect Retry-After
      const retryAfterHeader = response.headers.get('retry-after');
      let backoffSeconds = calculateExponentialBackoffSeconds(task.attempt_number);
      if (retryAfterHeader) {
        const parsed = Number.parseInt(retryAfterHeader, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          backoffSeconds = Math.min(86400, Math.max(5, parsed));
        }
      }

      await admin.rpc('fail_webhook_delivery', {
        p_delivery_id: task.delivery_id,
        p_lease_token: task.lease_token,
        p_error_code: 'http_429_rate_limited',
        p_error_message: `HTTP 429 Rate Limited: ${responseBodyPreview.slice(0, 200)}`,
        p_retryable: true,
        p_backoff_seconds: backoffSeconds,
        p_disable_subscription: false,
      });
      return 'failed';
    }

    // 4xx client errors (400, 401, 403, 404, etc.) are non-retryable by default
    if (httpStatus >= 400 && httpStatus < 500) {
      await admin.rpc('fail_webhook_delivery', {
        p_delivery_id: task.delivery_id,
        p_lease_token: task.lease_token,
        p_error_code: `http_${httpStatus}`,
        p_error_message: `HTTP ${httpStatus}: ${responseBodyPreview.slice(0, 200)}`,
        p_retryable: false,
        p_backoff_seconds: 0,
        p_disable_subscription: false,
      });
      return 'dead_letter';
    }

    // 5xx Server errors: retry with backoff
    const backoff = calculateExponentialBackoffSeconds(task.attempt_number);
    await admin.rpc('fail_webhook_delivery', {
      p_delivery_id: task.delivery_id,
      p_lease_token: task.lease_token,
      p_error_code: `http_${httpStatus}`,
      p_error_message: `HTTP ${httpStatus} server error: ${responseBodyPreview.slice(0, 200)}`,
      p_retryable: true,
      p_backoff_seconds: backoff,
      p_disable_subscription: false,
    });
    return 'failed';
  } catch (networkError) {
    const isTimeout = networkError instanceof Error && networkError.name === 'TimeoutError';
    const errorCode = isTimeout ? 'timeout' : 'network_error';
    const errorMessage = networkError instanceof Error ? networkError.message : 'Unknown network failure';
    const backoff = calculateExponentialBackoffSeconds(task.attempt_number);

    await admin.rpc('fail_webhook_delivery', {
      p_delivery_id: task.delivery_id,
      p_lease_token: task.lease_token,
      p_error_code: errorCode,
      p_error_message: errorMessage,
      p_retryable: true,
      p_backoff_seconds: backoff,
      p_disable_subscription: false,
    });
    return 'failed';
  }
}

/**
 * Runs a single leased batch of pending/retrying webhook deliveries.
 */
export async function runWebhookDeliveryBatch(
  batchSize = 10,
  admin: SupabaseClient = createAdminClient()
): Promise<WebhookBatchResult> {
  const result: WebhookBatchResult = {
    claimedCount: 0,
    completedCount: 0,
    failedCount: 0,
    disabledCount: 0,
    deadLetterCount: 0,
  };

  const { data: claims, error: claimError } = await admin.rpc('claim_webhook_delivery_tasks', {
    p_batch_size: Math.min(50, Math.max(1, batchSize)),
  });

  if (claimError) {
    throw new Error(`claim_webhook_delivery_tasks failed: ${claimError.message}`);
  }

  if (!Array.isArray(claims) || claims.length === 0) {
    return result;
  }

  const tasks = claims as ClaimedWebhookTask[];
  result.claimedCount = tasks.length;

  for (const task of tasks) {
    const outcome = await deliverSingleWebhookTask(admin, task);
    if (outcome === 'completed') result.completedCount += 1;
    else if (outcome === 'failed') result.failedCount += 1;
    else if (outcome === 'disabled') result.disabledCount += 1;
    else if (outcome === 'dead_letter') result.deadLetterCount += 1;
  }

  return result;
}
