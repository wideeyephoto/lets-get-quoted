import { Resend } from 'resend';
import { APP_ORIGIN } from '@/lib/app-origin';
import { escapeHtml, renderBrandedEmail, FONT_STACK } from '@/emails/brand';

let resendClient: Resend | null = null;
function getResend() {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

function alertRow(label: string, value: string, highlight?: boolean) {
  return `
    <tr>
      <td style="padding:9px 12px;font-family:${FONT_STACK};font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0">${escapeHtml(label)}</td>
      <td align="right" style="padding:9px 12px;font-family:${FONT_STACK};font-size:13px;font-weight:700;color:${highlight ? '#0f172a' : '#334155'};border-bottom:1px solid #e2e8f0">${escapeHtml(value)}</td>
    </tr>
  `;
}

export type FounderSignupAlertInput = {
  accountId: string;
  businessName: string;
  trade: string;
  postalCode: string;
  plan?: string | null;
  billing?: string | null;
  ownerEmail?: string | null;
};

/**
 * Dispatch an instant email notification to the founder when a new contractor
 * completes first-run onboarding.
 *
 * Designed to be 100% resilient: errors are logged and caught so a notification
 * issue never blocks the contractor from entering their dashboard.
 */
export async function sendFounderSignupAlert(input: FounderSignupAlertInput): Promise<void> {
  const recipient = process.env.FOUNDER_ALERT_EMAIL || 'hello@letsgetquoted.com';

  const resend = getResend();
  if (!resend || !process.env.RESEND_API_KEY) {
    console.info('[founder-alerts] Resend API key not configured; skipping email dispatch for new contractor:', {
      businessName: input.businessName,
      trade: input.trade,
      postalCode: input.postalCode,
    });
    return;
  }

  try {
    const adminLink = `${APP_ORIGIN}/admin/accounts`;
    const planDisplay = input.plan ? `${input.plan} (${input.billing || 'monthly'})` : 'Free / Flex';
    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

    const tableRows = [
      alertRow('Trade / Specialty', input.trade || 'General Trade', true),
      alertRow('ZIP / Postal Code', input.postalCode, true),
      alertRow('Plan Selection', planDisplay, true),
      input.ownerEmail ? alertRow('Owner Email', input.ownerEmail) : '',
      alertRow('Account ID', input.accountId),
      alertRow('Activation Time (ET)', timestamp),
    ].filter(Boolean).join('');

    const bodyHtml = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;overflow:hidden">
        ${tableRows}
      </table>
    `;

    await resend.emails.send({
      from: process.env.SYSTEM_EMAIL_FROM || "Let's Get Quoted <system@letsgetquoted.com>",
      to: recipient,
      subject: `🚀 New Contractor Signup: ${input.businessName} (${input.trade || 'General'} · ${input.postalCode})`,
      html: renderBrandedEmail({
        brand: {
          businessName: "Let's Get Quoted Admin",
          accent: '#0284c7',
          theme: 'spotlight',
          logoUrl: null,
          phone: null,
          siteUrl: APP_ORIGIN,
          replyTo: null,
        },
        preheader: `New contractor activation: ${input.businessName} · ${input.trade || 'General'}`,
        eyebrow: 'New Contractor Activation',
        heading: input.businessName,
        bodyHtml,
        cta: {
          label: 'Open Admin Console',
          url: adminLink,
        },
        footerHtml: `<p style="margin:10px 0 0;font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:#64748b">Automated Founder Alert · Let's Get Quoted Platform System</p>`,
      }),
    });
    console.info(`[founder-alerts] Successfully dispatched new contractor signup alert for ${input.businessName}`);
  } catch (err) {
    console.error('[founder-alerts] Failed to send founder alert email:', err);
  }
}

export type FounderMessagingApplicationAlertInput = {
  applicationId: string;
  accountId: string;
  businessName: string;
  dbaName?: string | null;
  businessType: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  desiredAreaCode: string;
  setupFeePaid?: string | null;
  einLastFour?: string | null;
  websiteUrl?: string | null;
};

/**
 * Dispatch an instant email notification to the founder when a contractor submits
 * an application for a dedicated business number / 10DLC registration.
 */
export async function sendFounderMessagingApplicationAlert(
  input: FounderMessagingApplicationAlertInput,
): Promise<void> {
  const recipient = process.env.FOUNDER_ALERT_EMAIL || 'hello@letsgetquoted.com';

  const resend = getResend();
  if (!resend || !process.env.RESEND_API_KEY) {
    console.info('[founder-alerts] Resend API key not configured; skipping email dispatch for messaging application:', {
      businessName: input.businessName,
      applicationId: input.applicationId,
      desiredAreaCode: input.desiredAreaCode,
    });
    return;
  }

  try {
    const adminLink = `${APP_ORIGIN}/admin/messaging/registrations?application=${encodeURIComponent(input.applicationId)}`;
    const feeDisplay = input.setupFeePaid || '$49.99 (Paid)';
    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

    const tableRows = [
      alertRow('Business Name', `${input.businessName}${input.dbaName ? ` (DBA: ${input.dbaName})` : ''}`, true),
      alertRow('Setup Fee', feeDisplay, true),
      alertRow('Desired Area Code', `(${input.desiredAreaCode})`, true),
      alertRow('Business Type', input.businessType.toUpperCase()),
      alertRow('Contact Person', input.contactName),
      alertRow('Contact Email', input.contactEmail),
      alertRow('Contact Phone', input.contactPhone),
      input.einLastFour ? alertRow('Tax ID / EIN', `XX-XXX${input.einLastFour}`) : '',
      input.websiteUrl ? alertRow('Website URL', input.websiteUrl) : '',
      alertRow('Account ID', input.accountId),
      alertRow('Submitted Time (ET)', timestamp),
    ].filter(Boolean).join('');

    const bodyHtml = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;overflow:hidden">
        ${tableRows}
      </table>
    `;

    await resend.emails.send({
      from: process.env.SYSTEM_EMAIL_FROM || "Let's Get Quoted <system@letsgetquoted.com>",
      to: recipient,
      subject: `📱 Dedicated Number Application: ${input.businessName} (Area code ${input.desiredAreaCode} · ${feeDisplay})`,
      html: renderBrandedEmail({
        brand: {
          businessName: "Let's Get Quoted Admin",
          accent: '#0284c7',
          theme: 'spotlight',
          logoUrl: null,
          phone: null,
          siteUrl: APP_ORIGIN,
          replyTo: null,
        },
        preheader: `Dedicated Number Application: ${input.businessName} · Area (${input.desiredAreaCode})`,
        eyebrow: '2-Way Number & 10DLC Application',
        heading: input.businessName,
        bodyHtml,
        cta: {
          label: 'Review in Admin Console',
          url: adminLink,
        },
        footerHtml: `<p style="margin:10px 0 0;font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:#64748b">Automated Founder Alert · Let's Get Quoted Platform System</p>`,
      }),
    });
    console.info(`[founder-alerts] Successfully dispatched messaging application alert for ${input.businessName}`);
  } catch (err) {
    console.error('[founder-alerts] Failed to send founder messaging application alert email:', err);
  }
}

export type OperationalEmergencyAlertInput = {
  incidentType:
    | 'uptime'
    | 'runtime_exception'
    | 'cron_failure'
    | 'webhook_dead_letter'
    | 'billing_reconciliation'
    | 'sms_queue_stall'
    | 'provider_outage';
  severity: 'critical' | 'high' | 'warning';
  title: string;
  summary: string;
  details?: Record<string, unknown> | null;
  affectedAccountsCount?: number | null;
  actionRequired?: string | null;
};

/**
 * Dispatch an emergency operational / SRE alert email to the platform founder
 * or on-call engineer for critical incidents, dead-letter accumulation, cron failures,
 * or provider outages.
 */
export async function sendOperationalEmergencyAlert(
  input: OperationalEmergencyAlertInput,
): Promise<{ dispatched: boolean; recipient: string }> {
  const recipient = process.env.FOUNDER_ALERT_EMAIL || 'hello@letsgetquoted.com';
  const resend = getResend();

  if (!resend || !process.env.RESEND_API_KEY) {
    console.warn('[founder-alerts] Resend API key not configured; operational alert logged to console:', {
      incidentType: input.incidentType,
      severity: input.severity,
      title: input.title,
      summary: input.summary,
      details: input.details,
    });
    return { dispatched: false, recipient };
  }

  try {
    const adminLink = `${APP_ORIGIN}/admin/system`;
    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const severityBadge = input.severity === 'critical' ? '🔴 CRITICAL' : input.severity === 'high' ? '🟠 HIGH' : '🟡 WARNING';

    const tableRows = [
      alertRow('Incident Type', input.incidentType.toUpperCase().replace(/_/g, ' '), true),
      alertRow('Severity', severityBadge, true),
      alertRow('Summary', input.summary),
      input.affectedAccountsCount !== undefined && input.affectedAccountsCount !== null
        ? alertRow('Affected Accounts', String(input.affectedAccountsCount), true)
        : '',
      input.actionRequired ? alertRow('Action Required', input.actionRequired, true) : '',
      alertRow('Alert Timestamp (ET)', timestamp),
    ].filter(Boolean).join('');

    let detailsHtml = '';
    if (input.details && Object.keys(input.details).length > 0) {
      detailsHtml = `
        <div style="margin-top:16px;padding:12px;background:#0f172a;color:#f8fafc;border-radius:8px;font-family:monospace;font-size:12px;overflow-x:auto;">
          <pre style="margin:0;white-space:pre-wrap;">${escapeHtml(JSON.stringify(input.details, null, 2))}</pre>
        </div>
      `;
    }

    const bodyHtml = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;overflow:hidden">
        ${tableRows}
      </table>
      ${detailsHtml}
    `;

    await resend.emails.send({
      from: process.env.SYSTEM_EMAIL_FROM || "Let's Get Quoted Ops <system@letsgetquoted.com>",
      to: recipient,
      subject: `🚨 [${severityBadge}] SRE Alert: ${input.title}`,
      html: renderBrandedEmail({
        brand: {
          businessName: "Let's Get Quoted SRE Ops",
          accent: input.severity === 'critical' ? '#dc2626' : '#ea580c',
          theme: 'spotlight',
          logoUrl: null,
          phone: null,
          siteUrl: APP_ORIGIN,
          replyTo: null,
        },
        preheader: `SRE Incident Alert [${input.severity}]: ${input.title}`,
        eyebrow: 'Platform SRE Incident Alert',
        heading: input.title,
        bodyHtml,
        cta: {
          label: 'Open Platform SRE Console',
          url: adminLink,
        },
        footerHtml: `<p style="margin:10px 0 0;font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:#64748b">Critical Operational Alert · Let's Get Quoted Incident Management</p>`,
      }),
    });

    console.info(`[founder-alerts] Successfully dispatched operational emergency alert: ${input.title}`);
    return { dispatched: true, recipient };
  } catch (err) {
    console.error('[founder-alerts] Failed to send operational emergency alert email:', err);
    return { dispatched: false, recipient };
  }
}

