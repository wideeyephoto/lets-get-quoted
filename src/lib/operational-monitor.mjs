import { sendMonitorFailureSms } from './operational-sms-paging.mjs';

// Shared by the authenticated Vercel cron and independent GitHub watchdog.
// All business tables are read through scan_operational_failures. Writes are
// confined to operational evidence tables; notifications go to configured operators.
export function cronMonitorConfig(crons) {
  return crons.map(({ path, schedule }) => {
    const [minute, hour, dom, month, dow] = schedule.split(/\s+/);
    let period = 1440;
    if (month !== '*') period = 366 * 1440;
    else if (dom !== '*') period = 31 * 1440;
    else if (dow !== '*') period = 7 * 1440;
    else if (hour === '*') period = minute === '*' ? 1 : /^\*\/\d+$/.test(minute) ? Number(minute.slice(2)) : 60;
    else if (/^\*\/\d+$/.test(hour)) period = Number(hour.slice(2)) * 60;
    return { job: path.replace('/api/cron/', ''), max_gap_minutes: period + Math.min(period, 15), required: true };
  });
}

/**
 * Sanitizes an error message removing authorization tokens, Bearer headers,
 * emails, phone numbers, and secrets.
 */
export function sanitizeErrorMessage(message) {
  if (!message) return 'unknown_error';
  const str = typeof message === 'string' ? message : (message.message || String(message));
  return str
    .replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, 'Bearer [REDACTED]')
    .replace(/apikey[=:\s]+[A-Za-z0-9_\-\.]+/gi, 'apikey=[REDACTED]')
    .replace(/key[=:\s]+[A-Za-z0-9_\-\.]+/gi, 'key=[REDACTED]')
    .replace(/[a-zA-Z0-9_\-\.]{40,}/g, '[TOKEN_REDACTED]')
    .replace(/\+?[1-9]\d{7,14}/g, '[PHONE_REDACTED]')
    .slice(0, 500);
}

/**
 * Structured Operational Monitor Error preserving stage, database code,
 * HTTP status, elapsed time, and retry attempt.
 */
export class OperationalMonitorError extends Error {
  constructor(options) {
    const {
      stage,
      rawMessage = 'database_error',
      dbCode = null,
      httpStatus = null,
      elapsedMs = 0,
      retryAttempt = 1,
      isGatewayTimeout = false,
      isNetworkError = false,
      isRateLimit = false,
      isFatal = false,
    } = options;

    const sanitized = sanitizeErrorMessage(rawMessage);
    // Legacy compatibility: If dbCode is present, use stage:code.
    // If it's a gateway timeout or network error without a code, preserve stage:gateway_timeout or stage:code.
    let codeStr = dbCode;
    if (!codeStr) {
      if (isGatewayTimeout) codeStr = 'gateway_timeout';
      else if (isNetworkError) codeStr = 'network_error';
      else if (isRateLimit) codeStr = 'rate_limit';
      else codeStr = 'database_error';
    }

    super(`${stage}:${codeStr}`);
    this.name = 'OperationalMonitorError';
    this.stage = stage;
    this.dbCode = dbCode;
    this.httpStatus = httpStatus;
    this.elapsedMs = elapsedMs;
    this.retryAttempt = retryAttempt;
    this.isGatewayTimeout = isGatewayTimeout;
    this.isNetworkError = isNetworkError;
    this.isRateLimit = isRateLimit;
    this.isFatal = isFatal;
    this.sanitizedMessage = sanitized;
    this.isRetryable = !isFatal && (isGatewayTimeout || isNetworkError || isRateLimit || httpStatus === 502 || httpStatus === 503 || dbCode === '08006' || dbCode === '08001');
  }
}

/**
 * Parses any error into a structured OperationalMonitorError.
 */
export function parseStructuredError(error, stage, { elapsedMs = 0, retryAttempt = 1 } = {}) {
  if (error instanceof OperationalMonitorError) {
    error.stage = error.stage || stage;
    error.elapsedMs = elapsedMs || error.elapsedMs;
    error.retryAttempt = retryAttempt || error.retryAttempt;
    return error;
  }

  const rawMsg = typeof error === 'string' ? error : (error?.message || error?.error_description || String(error || ''));
  const dbCode = error?.code || null;
  const statusNum = error?.status || (typeof error?.statusCode === 'number' ? error.statusCode : null) ||
    (/status\s*[:=]\s*(\d{3})/i.exec(rawMsg)?.[1] ? Number(/status\s*[:=]\s*(\d{3})/i.exec(rawMsg)[1]) : null) ||
    (/(\d{3})\s*gateway\s*timeout/i.exec(rawMsg)?.[1] ? Number(/(\d{3})\s*gateway\s*timeout/i.exec(rawMsg)[1]) : null);

  const isGatewayTimeout = statusNum === 504 || /gateway\s*timeout/i.test(rawMsg) || /timed?\s*out/i.test(rawMsg) || error?.name === 'TimeoutError';
  const isNetworkError = /fetch failed|econnreset|etimedout|enotfound|network\s*error|socket/i.test(rawMsg);
  const isRateLimit = statusNum === 429 || /rate\s*limit/i.test(rawMsg);
  const isFatal = /401|403|unauthorized|forbidden|invalid_key|permission|jwt/i.test(rawMsg) || dbCode === '42501' || dbCode === '42883' || /invalid alert recipient/i.test(rawMsg);

  return new OperationalMonitorError({
    stage,
    rawMessage: rawMsg,
    dbCode,
    httpStatus: statusNum,
    elapsedMs,
    retryAttempt,
    isGatewayTimeout,
    isNetworkError,
    isRateLimit,
    isFatal,
  });
}

/**
 * Diagnostic logger that is safe against logging failures and redacts sensitive data.
 */
export function logMonitorDiagnostic(event, data = {}) {
  try {
    const payload = {
      event,
      timestamp: new Date().toISOString(),
      runId: data.runId || null,
      deploymentId: data.deploymentId || (typeof process !== 'undefined' ? process.env.VERCEL_GIT_COMMIT_SHA : null),
      source: data.source || 'unknown',
      stage: data.stage || null,
      state: data.state || null,
      error: data.error ? {
        stage: data.error.stage,
        code: data.error.dbCode,
        httpStatus: data.error.httpStatus,
        message: data.error.sanitizedMessage,
        isGatewayTimeout: data.error.isGatewayTimeout,
        retryAttempt: data.error.retryAttempt,
      } : null,
      interruptions: data.interruptions?.length || 0,
      active: data.active,
      queued: data.queued,
      claimed: data.claimed,
      accepted: data.accepted,
      delivered: data.delivered,
      failed: data.failed,
    };
    console.log(`[operational-monitor] ${event}:`, JSON.stringify(payload));
  } catch {
    // Diagnostic logging failures must never prevent fallback alerting
  }
}

/**
 * Evaluates Supabase query results and throws structured error if failed.
 */
export function requireResult(result, stage, { elapsedMs = 0, retryAttempt = 1 } = {}) {
  if (result.error) {
    throw parseStructuredError(result.error, stage, { elapsedMs, retryAttempt });
  }
  return result.data;
}

export async function resendRequest(path, { key, method = 'GET', payload, idempotencyKey, fetcher = fetch }) {
  if (!key) throw new Error('resend_key_missing');
  const response = await fetcher(`https://api.resend.com${path}`, {
    method, cache: 'no-store', signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  if (!response.ok) throw new Error(`resend_http_${response.status}`);
  const result = await response.json();
  if (result.error || result.name === 'validation_error') throw new Error('resend_provider_rejected');
  return result;
}

/**
 * Executes a function with safe exponential retries for transient gateway/network errors.
 */
export async function withSafeRetry(fn, stage, {
  maxAttempts = 3,
  baseDelayMs = typeof process !== 'undefined' && process.env.NODE_ENV === 'test' ? 10 : 400,
  maxDelayMs = 2000,
  overallDeadlineMs = 18000,
  startTime = Date.now(),
  pause = ms => new Promise(r => setTimeout(r, ms)),
  onInterruption = null,
} = {}) {
  let attempt = 0;
  let lastError = null;

  while (attempt < maxAttempts) {
    attempt++;
    const callStart = Date.now();
    try {
      if (Date.now() - startTime > overallDeadlineMs) {
        throw new OperationalMonitorError({
          stage,
          rawMessage: 'execution_deadline_exceeded',
          elapsedMs: Date.now() - startTime,
          retryAttempt: attempt,
          isFatal: false,
        });
      }
      return await fn(attempt);
    } catch (err) {
      const elapsedMs = Date.now() - callStart;
      const structured = parseStructuredError(err, stage, { elapsedMs, retryAttempt: attempt });
      lastError = structured;

      if (!structured.isRetryable || attempt >= maxAttempts || (Date.now() - startTime + baseDelayMs > overallDeadlineMs)) {
        throw structured;
      }

      if (onInterruption) {
        onInterruption(structured);
      }

      const jitter = Math.floor(Math.random() * 150);
      const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1) + jitter);
      await pause(delay);
    }
  }

  throw lastError;
}

/**
 * Durable state recorder: Success.
 */
export async function recordDurableSuccess(admin, { source = 'vercel' } = {}) {
  try {
    const res = await admin.rpc('record_monitor_success', { p_source: source });
    if (res.data && res.data[0]) {
      return res.data[0];
    }
  } catch (err) {
    logMonitorDiagnostic('durable_success_record_failed', { error: err, source });
  }
  return { monitor_state: 'healthy', was_outage: false, outage_id: null };
}

/**
 * Durable state recorder: Failure / Interruption.
 */
export async function recordDurableFailure(admin, error, { source = 'vercel', deploymentId = null } = {}) {
  try {
    const stage = error?.stage || 'unknown';
    const errorMsg = error?.sanitizedMessage || error?.message || 'unknown_failure';
    const details = {
      dbCode: error?.dbCode || null,
      httpStatus: error?.httpStatus || null,
      isGatewayTimeout: !!error?.isGatewayTimeout,
      isFatal: !!error?.isFatal,
      source,
      deploymentId,
      timestamp: new Date().toISOString(),
    };

    const res = await admin.rpc('record_monitor_failure', {
      p_stage: stage,
      p_error: errorMsg,
      p_details: details,
      p_source: source,
    });

    if (res.data && res.data[0]) {
      return res.data[0];
    }
  } catch (err) {
    logMonitorDiagnostic('durable_failure_record_failed', { error: err, source });
  }

  // Fallback state if database RPC fails: treat DB unavailability as outage
  return {
    monitor_state: 'outage',
    consecutive_failures: 2,
    should_alert: true,
    is_first_outage_alert: true,
    outage_id: `fallback-db-${new Date().toISOString().slice(0, 13)}`,
  };
}

/**
 * Claims atomic dispatch right for outage or recovery notifications.
 */
export async function claimNotificationDispatch(admin, { outageId, type = 'outage' } = {}) {
  try {
    const res = await admin.rpc('claim_monitor_notification_dispatch', {
      p_outage_id: outageId,
      p_notification_type: type,
    });
    if (res.error) return false;
    return !!res.data;
  } catch {
    // If DB is unreachable, allow bounded fallback dispatch
    return true;
  }
}

// Email remains independent of the database. SMS requires its durable claim ledger.
// Stable payload and hourly key allow both watchdogs to report one outage safely.
export async function sendMonitorFailure({
  env = process.env,
  fetcher = fetch,
  now = new Date(),
  drill = false,
  error = null,
  stateInfo = null,
  source = 'vercel',
  deploymentId = null,
} = {}) {
  let emailId;
  let emailError;
  try {
    emailId = await sendMonitorFailureEmail({
      env,
      fetcher,
      now,
      drill,
      error,
      stateInfo,
      source,
      deploymentId,
    });
  } catch (err) {
    emailError = err;
  }

  // Page independently even if email was accepted: acceptance does not establish
  // that the operator's primary mailbox is available.
  if (env.ONCALL_PRIMARY_PHONE) {
    const sms = await sendMonitorFailureSms({ env, fetcher, now, drill });
    return emailId || sms.providerId;
  }
  if (emailError) throw emailError;
  return emailId;
}

export async function sendMonitorFailureEmail({
  env = process.env,
  fetcher = fetch,
  now = new Date(),
  drill = false,
  error = null,
  stateInfo = null,
  source = 'vercel',
  deploymentId = null,
} = {}) {
  const recipient = env.ONCALL_PRIMARY_EMAIL || env.FOUNDER_ALERT_EMAIL || 'hello@letsgetquoted.com';
  if (!recipient) throw new Error('alert_recipient_missing');
  const project = new URL(env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co').hostname.split('.')[0];

  const failedStage = error?.stage || stateInfo?.last_failed_stage || 'monitoring';
  const outageId = stateInfo?.outage_id || `outage-${now.toISOString().slice(0, 13)}`;
  const consecutiveFailures = stateInfo?.consecutive_failures || 1;
  const firstOccurrence = stateInfo?.first_failure_at
    ? new Date(stateInfo.first_failure_at).toISOString()
    : `${now.toISOString().slice(0, 13)}:00:00.000Z`;
  const lastSuccess = stateInfo?.last_complete_success_at ? new Date(stateInfo.last_complete_success_at).toISOString() : 'none recorded';
  const impactType = error?.stage === 'delivery_record' || error?.stage === 'delivery_read'
    ? 'alert delivery unconfirmed'
    : 'monitor unavailable';

  const key = `lgq-monitor-${project}-${drill ? 'drill' : 'outage'}-${outageId}`;

  const subject = `[LGQ Ops] ${drill ? 'DRILL: ' : ''}OUTAGE: operational monitor ${failedStage} (${impactType})`;

  const text = `The operational monitor is in an OUTAGE state for ${project}.

State: OUTAGE
Impact: ${impactType.toUpperCase()}
Failed Stage: ${failedStage}
Error: ${error?.sanitizedMessage || error?.message || 'timeout/database interruption'}
Code: ${error?.dbCode || error?.httpStatus || 'unspecified'}
First Occurrence: ${firstOccurrence}
Last Complete Success: ${lastSuccess}
Consecutive Failed Invocations: ${consecutiveFailures}
Attempts Made: ${error?.retryAttempt || 1}
Monitor Source: ${source}${deploymentId ? ` (Deployment: ${deploymentId})` : ''}
Outage ID: ${outageId}

Action Required:
Inspect the operational-alerts cron in https://app.letsgetquoted.com/admin/health and the Cron Health Monitor & Alerting GitHub workflow.
Vercel logs: https://vercel.com/lets-get-quoted/lets-get-quoted/logs?query=${encodeURIComponent(failedStage)}

Do not retry payments or compose customer messages to recover monitoring. Restore the monitor, rerun its existing job and verify delivery evidence.
${drill ? 'This is an authorized controlled notification failure drill.' : 'A sustained monitor failure requires immediate operator review.'}`;

  const result = await resendRequest('/emails', {
    key: env.RESEND_API_KEY,
    method: 'POST',
    fetcher,
    idempotencyKey: key,
    payload: {
      from: env.SYSTEM_EMAIL_FROM || "Let's Get Quoted Ops <system@letsgetquoted.com>",
      to: [recipient],
      subject,
      text,
    },
  });

  if (!result.id) throw new Error('resend_missing_email_id');
  return result.id;
}

/**
 * Sends a recovery notification when monitoring succeeds after an outage.
 */
export async function sendMonitorRecovery({
  admin,
  env = process.env,
  fetcher = fetch,
  now = new Date(),
  drill = false,
  result = {},
  stateInfo = {},
  source = 'vercel',
  deploymentId = null,
} = {}) {
  const outageId = stateInfo?.outage_id || result.outageId || `outage-${now.toISOString().slice(0, 13)}`;

  // Claim dispatch right atomically
  if (admin) {
    const claimed = await claimNotificationDispatch(admin, { outageId, type: 'recovery' });
    if (!claimed) return null;
  }

  const recipient = env.ONCALL_PRIMARY_EMAIL || env.FOUNDER_ALERT_EMAIL || 'hello@letsgetquoted.com';
  if (!recipient) throw new Error('alert_recipient_missing');
  const project = new URL(env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co').hostname.split('.')[0];

  const firstOccurrence = stateInfo?.first_failure_at ? new Date(stateInfo.first_failure_at).toISOString() : 'earlier';
  const key = `lgq-monitor-${project}-recovery-${outageId}`;

  const subject = `[LGQ Ops] ${drill ? 'DRILL: ' : ''}RECOVERED: operational monitor restored (${outageId})`;
  const text = `The operational monitor has RECOVERED and successfully completed all monitoring checks for ${project}.

State: HEALTHY (Recovered)
Outage ID: ${outageId}
First Occurrence: ${firstOccurrence}
Recovered At: ${now.toISOString()}
Run Summary: active=${result.active ?? 0}, queued=${result.queued ?? 0}, claimed=${result.claimed ?? 0}, accepted=${result.accepted ?? 0}, delivered=${result.delivered ?? 0}
Monitor Source: ${source}${deploymentId ? ` (Deployment: ${deploymentId})` : ''}

View current health: https://app.letsgetquoted.com/admin/health`;

  const sendRes = await resendRequest('/emails', {
    key: env.RESEND_API_KEY,
    method: 'POST',
    fetcher,
    idempotencyKey: key,
    payload: {
      from: env.SYSTEM_EMAIL_FROM || "Let's Get Quoted Ops <system@letsgetquoted.com>",
      to: [recipient],
      subject,
      text,
    },
  });

  return sendRes.id;
}

export async function runOperationalMonitor({
  admin,
  crons,
  env = process.env,
  fetcher = fetch,
  pause = ms => new Promise(r => setTimeout(r, ms)),
  source = (typeof process !== 'undefined' && process.env.CI) ? 'github-watchdog' : 'vercel',
  runId = null,
  deploymentId = (typeof process !== 'undefined' ? process.env.VERCEL_GIT_COMMIT_SHA : null),
}) {
  const recipient = env.ONCALL_PRIMARY_EMAIL || env.FOUNDER_ALERT_EMAIL || 'hello@letsgetquoted.com';
  if (!recipient || !env.RESEND_API_KEY) throw new Error('operational_alert_config_missing');

  const startTime = Date.now();
  const interruptions = [];
  const onInterruption = (structuredErr) => {
    interruptions.push(structuredErr);
    logMonitorDiagnostic('interruption_encountered', {
      error: structuredErr,
      source,
      runId,
      deploymentId,
      interruptionCount: interruptions.length,
    });
  };

  // Stage 1: Scan operational failures with safe retry
  const active = await withSafeRetry(
    async (attempt) => {
      const res = await admin.rpc('scan_operational_failures', { p_crons: cronMonitorConfig(crons) });
      return requireResult(res, 'scan', { retryAttempt: attempt });
    },
    'scan',
    { startTime, pause, onInterruption }
  );

  // Stage 2: Queue operational alerts with safe retry
  const queued = await withSafeRetry(
    async (attempt) => {
      const res = await admin.rpc('queue_operational_alerts', {
        p_recipient: recipient,
        p_from: env.SYSTEM_EMAIL_FROM || "Let's Get Quoted Ops <system@letsgetquoted.com>",
      });
      return requireResult(res, 'queue', { retryAttempt: attempt });
    },
    'queue',
    { startTime, pause, onInterruption }
  );

  // Stage 3: Claim operational alerts
  // Audit write safety: If claim times out, inspect whether rows were committed before blindly re-claiming
  const claimed = await withSafeRetry(
    async (attempt) => {
      if (attempt > 1) {
        // Check if rows were claimed in the last 30 seconds
        const checkExisting = await admin.from('operational_alert_deliveries')
          .select('id,payload,claim_token,lease_expires_at,state')
          .eq('state', 'sending')
          .gt('lease_expires_at', new Date().toISOString())
          .limit(5);

        if (checkExisting.data && checkExisting.data.length > 0) {
          logMonitorDiagnostic('claim_recovered_existing_lease', {
            count: checkExisting.data.length,
            source,
          });
          return checkExisting.data;
        }
      }

      const res = await admin.rpc('claim_operational_alerts', { p_limit: 5 });
      return requireResult(res, 'claim', { retryAttempt: attempt }) || [];
    },
    'claim',
    { startTime, pause, onInterruption }
  );

  let accepted = 0, delivered = 0, failed = 0;

  // Stage 4: Process claimed deliveries
  for (const alert of claimed) {
    await pause(600); // shared provider rate limit; cron leases prevent overlapping sends
    let result;
    try {
      result = await resendRequest('/emails', {
        key: env.RESEND_API_KEY,
        method: 'POST',
        payload: alert.payload,
        idempotencyKey: `lgq-operational-${alert.id}`,
        fetcher,
      });
      if (!result.id) throw new Error('resend_missing_email_id');
    } catch (error) {
      failed++;
      const code = /^resend_[a-z0-9_]+$/.test(error.message) ? error.message : 'send_outcome_unknown';
      requireResult(
        await admin.from('operational_alert_deliveries').update({
          state: 'pending',
          next_attempt_at: new Date(Date.now() + 5 * 60000).toISOString(),
          claim_token: null,
          lease_expires_at: null,
          last_error: code,
        }).eq('id', alert.id).eq('claim_token', alert.claim_token),
        'send_failure_record'
      );
      continue;
    }

    // A database failure here leaves the leased payload intact. Retry uses the
    // identical provider key, never a newly generated notification.
    const saved = requireResult(
      await admin.from('operational_alert_deliveries').update({
        state: 'accepted',
        provider_id: result.id,
        accepted_at: new Date().toISOString(),
        claim_token: null,
        lease_expires_at: null,
        last_error: null,
      }).eq('id', alert.id).eq('claim_token', alert.claim_token).select('id'),
      'accept_record'
    );
    if (saved.length !== 1) throw new Error('alert_claim_lost');
    accepted++;
  }

  // Stage 5: Check delivery receipts for pending accepted alerts
  const pending = requireResult(
    await admin.from('operational_alert_deliveries')
      .select('id,provider_id,accepted_at')
      .eq('state', 'accepted')
      .order('checked_at', { ascending: true, nullsFirst: true })
      .limit(10),
    'delivery_read'
  ) || [];

  for (const alert of pending) {
    try {
      // The existing signature-verified Resend webhook persists ordered status.
      // This works with a sending-only API key and does not broaden credentials.
      const evidence = requireResult(
        await admin.from('email_events')
          .select('status,occurred_at')
          .eq('provider_id', alert.provider_id)
          .maybeSingle(),
        'provider_receipt_read'
      );
      const status = evidence?.status;
      const reachedMailbox = ['delivered', 'opened', 'clicked'].includes(status);
      const rejected = ['bounced', 'complained', 'failed', 'suppressed', 'canceled'].includes(status);
      requireResult(
        await admin.from('operational_alert_deliveries').update({
          checked_at: new Date().toISOString(),
          provider_status: status || 'unknown',
          ...(reachedMailbox ? { state: 'delivered', delivered_at: new Date().toISOString() } : {}),
          ...(rejected ? { state: 'manual_review', last_error: `delivery_${status}` } : {}),
        }).eq('id', alert.id).eq('state', 'accepted'),
        'delivery_record'
      );
      if (reachedMailbox) delivered++;
      if (rejected || (!reachedMailbox && Date.now() - Date.parse(alert.accepted_at) > 30 * 60000)) failed++;
    } catch (error) {
      failed++;
      console.error('[operational-monitor] delivery verification unavailable', { alertId: alert.id, code: 'delivery_verification_failed' });
    }
  }

  // Stage 6: Read manual review count
  const review = await admin.from('operational_alert_deliveries').select('id', { count: 'exact', head: true }).eq('state', 'manual_review');
  requireResult(review, 'manual_review_read');
  failed += review.count || 0;

  // Durable state recording: Mark complete success
  const stateRecord = await recordDurableSuccess(admin, { source });

  const monitorState = interruptions.length > 0
    ? 'recovered_interruption'
    : (stateRecord.was_outage ? 'recovered' : 'healthy');

  logMonitorDiagnostic('run_completed', {
    source,
    runId,
    deploymentId,
    state: monitorState,
    interruptionCount: interruptions.length,
    active,
    queued,
    claimed: claimed.length,
    accepted,
    delivered,
    failed,
  });

  return {
    active,
    queued,
    claimed: claimed.length,
    accepted,
    delivered,
    failed,
    observedAt: new Date().toISOString(),
    state: monitorState,
    outageId: stateRecord.outage_id,
    wasOutage: !!stateRecord.was_outage,
    interruptions: interruptions.map(i => ({
      stage: i.stage,
      code: i.dbCode,
      httpStatus: i.httpStatus,
      elapsedMs: i.elapsedMs,
      retryAttempt: i.retryAttempt,
      isGatewayTimeout: i.isGatewayTimeout,
    })),
  };
}
