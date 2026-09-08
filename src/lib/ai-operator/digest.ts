import type { ExecutiveBriefing } from './types';
import { Resend } from 'resend';

let resendClient: Resend | null = null;
function getResend() {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

/**
 * Resolves who operator mail goes to.
 *
 * There is deliberately no fallback address. This used to default to
 * `founder@letsgetquoted.com`, which is not a real mailbox: a live run on
 * 2026-09-08 hard-bounced two seconds after sending, while the cron reported
 * `digestDelivered: true`. Left alone that is a hard bounce every morning at
 * 11:00 UTC forever, which is also how a sending reputation gets destroyed.
 * Silence when unconfigured is better than mail aimed at a dead address.
 */
function resolveOperatorRecipient(explicit?: string): string | null {
  const recipient = explicit || process.env.ADMIN_ALERT_EMAIL;
  return recipient && recipient.includes('@') ? recipient : null;
}

/**
 * Sends a daily morning executive digest email to the founder and staff
 */
export async function dispatchExecutiveBriefingDigest(
  briefing: ExecutiveBriefing,
  options?: { recipientEmail?: string },
): Promise<{ success: boolean; deliveredVia: string[]; error?: string }> {
  const recipient = resolveOperatorRecipient(options?.recipientEmail);
  const deliveredVia: string[] = [];
  const failures: string[] = [];

  if (!recipient) {
    failures.push('no recipient configured (set ADMIN_ALERT_EMAIL)');
  }

  // 1. Dispatch via Resend Email if configured
  const resend = getResend();
  if (!resend) failures.push('RESEND_API_KEY not configured');
  if (resend && recipient) {
    try {
      const subject = `☀️ Morning Briefing: $${briefing.revenue.mrrEstimated}/mo MRR • ${briefing.contractors.totalActive} Contractors • ${briefing.operations.queueHealth.toUpperCase()}`;
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b1523; color: #f7f5ef; margin: 0; padding: 24px; }
    .container { max-width: 600px; margin: 0 auto; background: #0f1b2c; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 24px; }
    .header { border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 16px; margin-bottom: 20px; }
    h1 { color: #f7f5ef; font-size: 20px; margin: 0 0 8px 0; }
    .status-badge { display: inline-block; padding: 4px 10px; border-radius: 16px; font-size: 12px; font-weight: bold; background: ${briefing.operations.queueHealth === 'healthy' ? '#22c55e22' : '#ef444422'}; color: ${briefing.operations.queueHealth === 'healthy' ? '#4ade80' : '#f87171'}; }
    .kpi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
    .kpi-tile { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 12px; }
    .kpi-label { font-size: 11px; color: rgba(247,245,239,0.6); text-transform: uppercase; margin-bottom: 4px; }
    .kpi-val { font-size: 18px; font-weight: bold; color: #f7f5ef; }
    .content { font-size: 14px; line-height: 1.6; color: rgba(247,245,239,0.85); white-space: pre-wrap; margin-bottom: 24px; }
    .cta-btn { display: inline-block; background: #ff9447; color: #06131f; font-weight: bold; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 14px; }
    .footer { font-size: 11px; color: rgba(247,245,239,0.4); text-align: center; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚡ LGQ AI Operator Morning Briefing</h1>
      <span class="status-badge">${briefing.headline}</span>
    </div>

    <div class="kpi-grid">
      <div class="kpi-tile">
        <div class="kpi-label">Estimated MRR</div>
        <div class="kpi-val">$${briefing.revenue.mrrEstimated}/mo</div>
      </div>
      <div class="kpi-tile">
        <div class="kpi-label">Contractor Accounts</div>
        <div class="kpi-val">${briefing.contractors.totalActive} (${briefing.contractors.onboardedInPeriod} Connected)</div>
      </div>
      <div class="kpi-tile">
        <div class="kpi-label">SMS Deliverability</div>
        <div class="kpi-val">${
          briefing.operations.smsDeliverabilityPct === null
            ? 'No sends'
            : `${briefing.operations.smsDeliverabilityPct}%`
        }</div>
      </div>
      <div class="kpi-tile">
        <div class="kpi-label">Webhook SRE</div>
        <div class="kpi-val">${briefing.operations.unresolvedWebhooksCount === 0 ? '🟢 100% OK' : `🔴 ${briefing.operations.unresolvedWebhooksCount} Failures`}</div>
      </div>
    </div>

    <div class="content">${briefing.markdownSummary}</div>

    <div style="text-align: center; margin: 20px 0;">
      <a href="https://app.letsgetquoted.com/admin/operator" class="cta-btn">Open AI Operator Cockpit →</a>
    </div>

    <div class="footer">
      Generated autonomously by Let's Get Quoted AI Operator Core • ${new Date(briefing.generatedAt).toLocaleString()}
    </div>
  </div>
</body>
</html>
`.trim();

      // The Resend SDK returns { data, error } and does NOT throw on an API-level
      // rejection, so the old unchecked `await send(); deliveredVia.push()` reported
      // delivery for sends the provider had refused outright.
      const { data, error } = await resend.emails.send({
        from: "LGQ AI Operator <alerts@letsgetquoted.com>",
        to: recipient,
        subject,
        html,
      });

      if (error) {
        failures.push(`email rejected: ${error.message ?? String(error)}`);
        console.error('Failed to send email digest:', error);
      } else {
        deliveredVia.push(`email:${recipient}`);
        if (data?.id) console.info(`[ai-operator] digest queued to ${recipient} (${data.id})`);
      }
    } catch (e) {
      failures.push(`email threw: ${e instanceof Error ? e.message : String(e)}`);
      console.error('Failed to send email digest:', e);
    }
  }

  // 2. Dispatch to Slack/Discord Webhook if configured
  const webhookUrl = process.env.OPERATOR_SLACK_WEBHOOK_URL || process.env.OPERATOR_DISCORD_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `☀️ *LGQ AI Operator Executive Briefing*\n*MRR:* $${briefing.revenue.mrrEstimated}/mo | *Contractors:* ${briefing.contractors.totalActive} | *Webhooks:* ${briefing.operations.unresolvedWebhooksCount}\n\n${briefing.markdownSummary}\n\n👉 <https://app.letsgetquoted.com/admin/operator|Open Cockpit>`,
        }),
      });
      // A 4xx from Slack still resolves the fetch; only the status says it posted.
      if (res.ok) deliveredVia.push('webhook');
      else failures.push(`webhook rejected: HTTP ${res.status}`);
    } catch (e) {
      failures.push(`webhook threw: ${e instanceof Error ? e.message : String(e)}`);
      console.error('Failed to post webhook digest:', e);
    }
  }

  // `deliveredVia` means the provider ACCEPTED the message, which is not the same as
  // it reaching anyone -- the 2026-09-08 run was accepted and hard-bounced two seconds
  // later. The bounce arrives asynchronously on the Resend webhook and lands in
  // email_events; that table, not this return value, is the record of delivery.
  //
  // The old code substituted ['in-memory-logged'] when nothing was sent, which made a
  // total failure to dispatch read as a delivery channel.
  return {
    success: deliveredVia.length > 0,
    deliveredVia,
    ...(failures.length > 0 ? { error: failures.join('; ') } : {}),
  };
}

/**
 * Dispatches an instant emergency escalation alert for critical platform events
 */
export async function dispatchCriticalAnomalyAlert(incident: {
  title: string;
  details: string;
  severity: 'critical' | 'warning';
}): Promise<void> {
  console.warn(`[OPERATOR CRITICAL ALERT] ${incident.title}: ${incident.details}`);

  const resend = getResend();
  const recipient = resolveOperatorRecipient();

  // Same dead default as the digest, but this is the critical-incident path: every
  // emergency alert was addressed to a mailbox that hard-bounces, and the send result
  // was never inspected, so nobody was ever paged and nothing recorded that.
  if (!recipient) {
    console.error(
      `[OPERATOR CRITICAL ALERT] NOT SENT -- no ADMIN_ALERT_EMAIL configured. Alert was: ${incident.title}`,
    );
    return;
  }

  if (resend) {
    try {
      const { error } = await resend.emails.send({
        from: "LGQ SRE Guardian <alerts@letsgetquoted.com>",
        to: recipient,
        subject: `🚨 [CRITICAL ALERT] ${incident.title}`,
        html: `<p><strong>Incident Alert:</strong> ${incident.title}</p><p>${incident.details}</p><p><a href="https://app.letsgetquoted.com/admin/operator">Open Operator Cockpit</a></p>`,
      });
      if (error) {
        console.error('Emergency alert REJECTED by provider:', error.message ?? error);
      }
    } catch (err) {
      console.error('Failed to send emergency alert email:', err);
    }
  } else {
    console.error('[OPERATOR CRITICAL ALERT] NOT SENT -- RESEND_API_KEY not configured.');
  }
}
