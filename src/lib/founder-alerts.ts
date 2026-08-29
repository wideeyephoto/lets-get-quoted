import { Resend } from 'resend';
import { APP_ORIGIN } from '@/lib/app-origin';

let resendClient: Resend | null = null;
function getResend() {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
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
  const recipient = process.env.FOUNDER_ALERT_EMAIL || 'brett@letsgetquoted.com';

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

    await resend.emails.send({
      from: process.env.SYSTEM_EMAIL_FROM || 'Let\'s Get Quoted <system@letsgetquoted.com>',
      to: recipient,
      subject: `🚀 New Contractor Signup: ${input.businessName} (${input.trade || 'General'} · ${input.postalCode})`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0c1822; color: #f5f0e7; padding: 24px; }
            .card { background: #132433; border: 1px solid #1e3950; border-radius: 12px; padding: 24px; max-width: 560px; margin: 0 auto; }
            .badge { display: inline-block; background: rgba(255, 106, 36, 0.15); color: #ff6a24; border: 1px solid rgba(255, 106, 36, 0.35); padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 12px; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px; }
            h1 { font-size: 20px; font-weight: 800; margin: 0 0 16px; color: #fff; }
            .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 14px; }
            .label { color: #8fa0b0; font-weight: 500; }
            .value { color: #f5f0e7; font-weight: 700; text-align: right; }
            .btn { display: inline-block; background: #ff6a24; color: #fff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 20px; border-radius: 8px; margin-top: 20px; text-align: center; }
            .footer { font-size: 12px; color: #5a7285; margin-top: 20px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="card">
            <span class="badge">New Contractor Activation</span>
            <h1>${input.businessName}</h1>
            <div class="row"><span class="label">Trade</span><span class="value">${input.trade || 'Not specified'}</span></div>
            <div class="row"><span class="label">Zip Code</span><span class="value">${input.postalCode}</span></div>
            <div class="row"><span class="label">Plan Selection</span><span class="value">${planDisplay}</span></div>
            ${input.ownerEmail ? `<div class="row"><span class="label">Owner Email</span><span class="value">${input.ownerEmail}</span></div>` : ''}
            <div class="row"><span class="label">Account ID</span><span class="value" style="font-family: monospace; font-size: 12px;">${input.accountId}</span></div>
            <div class="row"><span class="label">Signup Time (ET)</span><span class="value">${timestamp}</span></div>
            <div style="text-align: center;">
              <a href="${adminLink}" class="btn">Open Admin Console →</a>
            </div>
            <p class="footer">Let's Get Quoted Automated Founder Notification</p>
          </div>
        </body>
        </html>
      `,
    });
    console.info(`[founder-alerts] Successfully dispatched new contractor signup alert for ${input.businessName}`);
  } catch (err) {
    console.error('[founder-alerts] Failed to send founder alert email:', err);
  }
}
