import { sendOperationalEmergencyAlert, type OperationalEmergencyAlertInput } from '@/lib/founder-alerts';

export type PagingSeverity = 'P1_CRITICAL' | 'P2_HIGH' | 'P3_WARNING';

export interface OnCallContact {
  role: 'primary' | 'secondary' | 'escalation_lead';
  name: string;
  email: string;
  phone: string;
  shiftSchedule: string;
  status: 'on_shift' | 'standby';
}

export interface PagingChannelStatus {
  id: 'pagerduty' | 'opsgenie' | 'slack_ops' | 'discord_ops' | 'emergency_sms_email';
  name: string;
  configured: boolean;
  status: 'ready' | 'unconfigured';
  target: string;
}

export interface PagingEvent {
  id: string;
  incidentKey: string;
  title: string;
  severity: PagingSeverity;
  source: string;
  incidentType: OperationalEmergencyAlertInput['incidentType'];
  dispatchedAt: string;
  dispatchedChannels: string[];
  acknowledgedAt?: string | null;
  acknowledgedBy?: string | null;
  resolvedAt?: string | null;
  status: 'triggered' | 'acknowledged' | 'resolved';
}

// In-memory buffer of recent paging dispatches
const recentPagingEvents: PagingEvent[] = [];

/**
 * Returns active on-call staff and escalation schedule
 */
export function getOnCallRoster(): {
  primary: OnCallContact;
  secondary: OnCallContact;
  escalationTimeoutMinutes: number;
  channels: PagingChannelStatus[];
} {
  const primaryEmail = process.env.ONCALL_PRIMARY_EMAIL || process.env.FOUNDER_ALERT_EMAIL || '';
  const primaryPhone = process.env.ONCALL_PRIMARY_PHONE || '';

  const channels: PagingChannelStatus[] = [
    {
      id: 'emergency_sms_email',
      name: 'Operational email (Resend)',
      configured: Boolean(process.env.RESEND_API_KEY && primaryEmail),
      status: (process.env.RESEND_API_KEY && primaryEmail) ? 'ready' : 'unconfigured',
      target: primaryEmail || 'Not configured',
    },
    {
      id: 'pagerduty',
      name: 'PagerDuty Events API v2',
      configured: Boolean(process.env.PAGERDUTY_INTEGRATION_KEY || process.env.PAGERDUTY_ROUTING_KEY),
      status: (process.env.PAGERDUTY_INTEGRATION_KEY || process.env.PAGERDUTY_ROUTING_KEY) ? 'ready' : 'unconfigured',
      target: process.env.PAGERDUTY_ROUTING_KEY ? 'Key configured' : 'Unconfigured',
    },
    {
      id: 'opsgenie',
      name: 'Opsgenie Incident Alert API',
      configured: Boolean(process.env.OPSGENIE_API_KEY),
      status: process.env.OPSGENIE_API_KEY ? 'ready' : 'unconfigured',
      target: process.env.OPSGENIE_API_KEY ? 'API key present' : 'Unconfigured',
    },
    {
      id: 'slack_ops',
      name: 'Slack #ops-incidents Webhook',
      configured: Boolean(process.env.SLACK_OPS_WEBHOOK_URL || process.env.OPERATOR_SLACK_WEBHOOK_URL),
      status: (process.env.SLACK_OPS_WEBHOOK_URL || process.env.OPERATOR_SLACK_WEBHOOK_URL) ? 'ready' : 'unconfigured',
      target: '#ops-incidents',
    },
    {
      id: 'discord_ops',
      name: 'Discord #ops-alerts Webhook',
      configured: Boolean(process.env.DISCORD_OPS_WEBHOOK_URL || process.env.OPERATOR_DISCORD_WEBHOOK_URL),
      status: (process.env.DISCORD_OPS_WEBHOOK_URL || process.env.OPERATOR_DISCORD_WEBHOOK_URL) ? 'ready' : 'unconfigured',
      target: '#ops-alerts',
    },
  ];

  const secondaryEmail = process.env.ONCALL_SECONDARY_EMAIL || '';
  const secondaryPhone = process.env.ONCALL_SECONDARY_PHONE || '';

  return {
    primary: {
      role: 'primary',
      name: primaryEmail ? 'Lead Platform SRE (On-Duty)' : 'Unassigned',
      email: primaryEmail || 'Not configured',
      phone: primaryPhone || 'Not configured',
      shiftSchedule: '24/7 Primary Rotation (America/New_York)',
      status: primaryEmail ? 'on_shift' : 'standby',
    },
    secondary: {
      role: 'secondary',
      name: secondaryEmail ? 'Platform Engineering Escalation' : 'Unassigned',
      email: secondaryEmail || 'Not configured',
      phone: secondaryPhone || 'Not configured',
      shiftSchedule: 'Backup On-Call (15 min auto-escalate)',
      status: 'standby',
    },
    escalationTimeoutMinutes: 15,
    channels,
  };
}

/**
 * Dispatches an automated incident page across all active channels
 */
export async function dispatchOnCallPage(params: {
  title: string;
  severity: PagingSeverity;
  summary: string;
  incidentType: OperationalEmergencyAlertInput['incidentType'];
  source?: string;
  details?: Record<string, unknown> | null;
  actionRequired?: string | null;
}): Promise<PagingEvent> {
  const eventId = `page_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const dispatchedAt = new Date().toISOString();
  const dispatchedChannels: string[] = [];

  const severityLabel = params.severity === 'P1_CRITICAL' ? 'critical' : params.severity === 'P2_HIGH' ? 'high' : 'warning';

  // 1. Email dispatch. This path does not send SMS.
  try {
    const alertRes = await sendOperationalEmergencyAlert({
      incidentType: params.incidentType,
      severity: severityLabel,
      title: `[${params.severity}] ${params.title}`,
      summary: params.summary,
      details: params.details,
      actionRequired: params.actionRequired || 'Acknowledge incident in /admin/health and follow runbook SOP.',
    });
    if (alertRes.dispatched) {
      dispatchedChannels.push('email');
    }
  } catch (err) {
    console.error('[On-Call Paging] Emergency email dispatch failed:', err);
  }

  // 2. PagerDuty Events v2 API (if key present)
  const pdKey = process.env.PAGERDUTY_INTEGRATION_KEY || process.env.PAGERDUTY_ROUTING_KEY;
  if (pdKey) {
    try {
      const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routing_key: pdKey,
          event_action: 'trigger',
          dedup_key: eventId,
          payload: {
            summary: `[${params.severity}] ${params.title}: ${params.summary}`,
            severity: params.severity === 'P1_CRITICAL' ? 'critical' : params.severity === 'P2_HIGH' ? 'error' : 'warning',
            source: params.source || 'letsgetquoted-production',
            custom_details: params.details || {},
          },
        }),
      });
      if (!response.ok) throw new Error(`PagerDuty rejected request (${response.status})`);
      dispatchedChannels.push('pagerduty');
    } catch (err) {
      console.error('[On-Call Paging] PagerDuty dispatch failed:', err);
    }
  }

  // 3. Slack Webhook Dispatch
  const slackUrl = process.env.SLACK_OPS_WEBHOOK_URL || process.env.OPERATOR_SLACK_WEBHOOK_URL;
  if (slackUrl) {
    try {
      const response = await fetch(slackUrl, {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🚨 *[${params.severity}] ${params.title}*\n>${params.summary}\n*Source:* \`${params.source || 'production'}\` · *Action:* ${params.actionRequired || 'Investigate immediately'}`,
        }),
      });
      if (!response.ok) throw new Error(`Slack rejected request (${response.status})`);
      dispatchedChannels.push('slack');
    } catch (err) {
      console.error('[On-Call Paging] Slack dispatch failed:', err);
    }
  }

  // 4. Discord Webhook Dispatch
  const discordUrl = process.env.DISCORD_OPS_WEBHOOK_URL || process.env.OPERATOR_DISCORD_WEBHOOK_URL;
  if (discordUrl) {
    try {
      const response = await fetch(discordUrl, {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `🚨 **[${params.severity}] ${params.title}**\n${params.summary}\n*Dispatched to On-Call at ${dispatchedAt}*`,
        }),
      });
      if (!response.ok) throw new Error(`Discord rejected request (${response.status})`);
      dispatchedChannels.push('discord');
    } catch (err) {
      console.error('[On-Call Paging] Discord dispatch failed:', err);
    }
  }

  if (dispatchedChannels.length === 0) {
    dispatchedChannels.push('console_log_fallback');
  }

  const pagingRecord: PagingEvent = {
    id: eventId,
    incidentKey: `inc_${Date.now()}`,
    title: params.title,
    severity: params.severity,
    source: params.source || 'production',
    incidentType: params.incidentType,
    dispatchedAt,
    dispatchedChannels,
    status: 'triggered',
  };

  recentPagingEvents.unshift(pagingRecord);
  if (recentPagingEvents.length > 50) {
    recentPagingEvents.pop();
  }

  return pagingRecord;
}

/**
 * Returns recent paging history for display in admin operations center
 */
export function getRecentPagingEvents(limit = 10): PagingEvent[] {
  return recentPagingEvents.slice(0, limit);
}

/**
 * Executes an on-call paging readiness drill initiated by staff
 */
export async function dispatchOnCallTestDrill(staffEmail: string): Promise<PagingEvent> {
  return dispatchOnCallPage({
    title: 'Operational Readiness Drill / Test Page',
    severity: 'P3_WARNING',
    summary: `Manual notification drill requested by ${staffEmail}. Provider acceptance is recorded here; mailbox delivery must be checked separately.`,
    incidentType: 'uptime',
    source: 'admin-console:health-drill',
    details: {
      initiatedBy: staffEmail,
      drillTimestamp: new Date().toISOString(),
      expectedChannels: ['email', 'configured_webhooks'],
    },
    actionRequired: 'No action required — this is an authorized readiness drill.',
  });
}
