// Shared by the authenticated Vercel cron and independent GitHub watchdog.
// All business tables are read through scan_operational_failures. Writes are
// confined to the operational evidence tables and the provider receives email only.
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

function requireResult(result, stage) {
  if (result.error) throw new Error(`${stage}:${result.error.code || 'database_error'}`);
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

// Independent of the database: this still pages if the database/scan cannot run.
// Stable payload and hourly key allow both watchdogs to report one outage safely.
export async function sendMonitorFailure({ env = process.env, fetcher = fetch, now = new Date(), drill = false } = {}) {
  const recipient = env.ONCALL_PRIMARY_EMAIL || env.FOUNDER_ALERT_EMAIL || 'hello@letsgetquoted.com';
  if (!recipient) throw new Error('alert_recipient_missing');
  const project = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
  const key = `lgq-monitor-${project}-${drill ? 'drill' : 'failure'}-${now.toISOString().slice(0, 13)}`;
  const result = await resendRequest('/emails', { key: env.RESEND_API_KEY, method: 'POST', fetcher, idempotencyKey: key,
    payload: { from: env.SYSTEM_EMAIL_FROM || "Let's Get Quoted Ops <system@letsgetquoted.com>", to: [recipient],
      subject: `[LGQ Ops] ${drill ? 'DRILL: ' : ''}operational monitoring cannot complete`,
      text: `The operational monitor could not complete its scan or notification delivery for ${project}.\nCheck the operational-alerts cron in https://app.letsgetquoted.com/admin/health and the Cron Health Monitor & Alerting GitHub workflow. Inspect the recorded stage/code, database availability, email credentials and operational_alert_deliveries.\nDo not retry payments or compose customer messages to recover monitoring. Restore the monitor, rerun its existing job and verify delivery evidence.\n${drill ? 'This is an authorized controlled notification failure drill.' : 'A missing monitor result is not a healthy system.'}` } });
  if (!result.id) throw new Error('resend_missing_email_id');
  return result.id;
}

export async function runOperationalMonitor({ admin, crons, env = process.env, fetcher = fetch, pause = ms => new Promise(r => setTimeout(r, ms)) }) {
  const recipient = env.ONCALL_PRIMARY_EMAIL || env.FOUNDER_ALERT_EMAIL || 'hello@letsgetquoted.com';
  if (!recipient || !env.RESEND_API_KEY) throw new Error('operational_alert_config_missing');
  const active = requireResult(await admin.rpc('scan_operational_failures', { p_crons: cronMonitorConfig(crons) }), 'scan');
  const queued = requireResult(await admin.rpc('queue_operational_alerts', {
    p_recipient: recipient, p_from: env.SYSTEM_EMAIL_FROM || "Let's Get Quoted Ops <system@letsgetquoted.com>",
  }), 'queue');
  const claimed = requireResult(await admin.rpc('claim_operational_alerts', { p_limit: 5 }), 'claim') || [];
  let accepted = 0, delivered = 0, failed = 0;
  for (const alert of claimed) {
    await pause(600); // shared provider rate limit; cron leases prevent overlapping sends
    let result;
    try {
      result = await resendRequest('/emails', { key: env.RESEND_API_KEY, method: 'POST', payload: alert.payload,
        idempotencyKey: `lgq-operational-${alert.id}`, fetcher });
      if (!result.id) throw new Error('resend_missing_email_id');
    } catch (error) {
      failed++;
      const code = /^resend_[a-z0-9_]+$/.test(error.message) ? error.message : 'send_outcome_unknown';
      requireResult(await admin.from('operational_alert_deliveries').update({ state: 'pending',
        next_attempt_at: new Date(Date.now() + 5 * 60000).toISOString(), claim_token: null, lease_expires_at: null, last_error: code,
      }).eq('id', alert.id).eq('claim_token', alert.claim_token), 'send_failure_record');
      continue;
    }
    // A database failure here leaves the leased payload intact. Retry uses the
    // identical provider key, never a newly generated notification.
    const saved = requireResult(await admin.from('operational_alert_deliveries').update({ state: 'accepted', provider_id: result.id,
      accepted_at: new Date().toISOString(), claim_token: null, lease_expires_at: null, last_error: null,
    }).eq('id', alert.id).eq('claim_token', alert.claim_token).select('id'), 'accept_record');
    if (saved.length !== 1) throw new Error('alert_claim_lost');
    accepted++;
  }
  const pending = requireResult(await admin.from('operational_alert_deliveries').select('id,provider_id,accepted_at')
    .eq('state', 'accepted').order('checked_at', { ascending: true, nullsFirst: true }).limit(10), 'delivery_read') || [];
  for (const alert of pending) {
    await pause(600);
    try {
      const evidence = await resendRequest(`/emails/${encodeURIComponent(alert.provider_id)}`, { key: env.RESEND_API_KEY, fetcher });
      const status = evidence.last_event;
      const reachedMailbox = ['delivered', 'opened', 'clicked'].includes(status);
      const rejected = ['bounced', 'complained', 'failed', 'suppressed', 'canceled'].includes(status);
      requireResult(await admin.from('operational_alert_deliveries').update({ checked_at: new Date().toISOString(), provider_status: status || 'unknown',
        ...(reachedMailbox ? { state: 'delivered', delivered_at: new Date().toISOString() } : {}),
        ...(rejected ? { state: 'manual_review', last_error: `delivery_${status}` } : {}),
      }).eq('id', alert.id).eq('state', 'accepted'), 'delivery_record');
      if (reachedMailbox) delivered++;
      if (rejected || (!reachedMailbox && Date.now() - Date.parse(alert.accepted_at) > 30 * 60000)) failed++;
    } catch (error) {
      failed++;
      console.error('[operational-monitor] delivery verification unavailable', { alertId: alert.id, code: 'delivery_verification_failed' });
    }
  }
  const review = await admin.from('operational_alert_deliveries').select('id', { count: 'exact', head: true }).eq('state', 'manual_review');
  requireResult(review, 'manual_review_read');
  failed += review.count || 0;
  return { active, queued, claimed: claimed.length, accepted, delivered, failed, observedAt: new Date().toISOString() };
}
