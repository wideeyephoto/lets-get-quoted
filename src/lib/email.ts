import { Resend } from 'resend';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateInvoiceHtml } from '@/emails/InvoiceEmail';
import { generateInvoicePdf } from '@/emails/InvoicePdf';
import type { Invoice, InvoiceItem } from './invoices';
import type { Lead } from './leads';

const resend = new Resend(process.env.RESEND_API_KEY);

// Resolve the account owner's login email — the contractor — for out-of-band
// alerts (payout paused, chargeback opened) that shouldn't rely on them having
// the dashboard open. Requires the admin client since the webhook has no
// session. Returns null if the owner or their email can't be resolved.
export async function getAccountOwnerEmail(admin: SupabaseClient, accountId: string): Promise<string | null> {
  const { data: owner } = await admin
    .from('memberships')
    .select('user_id')
    .eq('account_id', accountId)
    .eq('role', 'owner')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!owner?.user_id) return null;

  const { data: ownerUser } = await admin.auth.admin.getUserById(owner.user_id);
  return ownerUser?.user?.email ?? null;
}

export interface SendInvoiceEmailInput {
  invoice: Invoice;
  items: InvoiceItem[];
  businessName: string;
  clientName: string;
  jobRef: string;
  recipientEmail: string;
  origin: string;
}

export async function sendInvoiceEmail(input: SendInvoiceEmailInput): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not configured; invoice email skipped');
    return;
  }

  try {
    // Public, no-login link — the recipient signing/reviewing this invoice
    // is the client, not a dashboard user (mirrors the /pay/[id] pattern).
    const invoiceLink = `${input.origin}/invoice/${input.invoice.id}`;

    const emailHtml = generateInvoiceHtml({
      businessName: input.businessName,
      invoiceRef: input.invoice.ref,
      clientName: input.clientName,
      jobRef: input.jobRef,
      total: input.invoice.total,
      items: input.items,
      invoiceLink,
    });

    // Best-effort: attach a PDF copy of the invoice. If PDF generation fails
    // for any reason, still send the HTML email rather than blocking on it.
    let pdfBuffer: Buffer | null = null;
    try {
      pdfBuffer = await generateInvoicePdf({
        businessName: input.businessName,
        invoiceRef: input.invoice.ref,
        clientName: input.clientName,
        jobRef: input.jobRef,
        total: input.invoice.total,
        items: input.items,
      });
    } catch (pdfErr) {
      console.error('Invoice PDF generation failed; sending email without attachment:', pdfErr);
    }

    const result = await resend.emails.send({
      from: `hello@letsgetquoted.com`,
      to: input.recipientEmail,
      subject: `Invoice ${input.invoice.ref} from ${input.businessName}`,
      html: emailHtml,
      reply_to: `hello@letsgetquoted.com`,
      attachments: pdfBuffer
        ? [
            {
              filename: `Invoice-${input.invoice.ref}.pdf`,
              content: pdfBuffer,
              content_type: 'application/pdf',
            },
          ]
        : undefined,
    });

    if (result.error) {
      console.error('Failed to send invoice email:', result.error);
      throw new Error(result.error.message);
    }

    console.log(`Invoice email sent: ${input.invoice.ref} to ${input.recipientEmail}`);
  } catch (err) {
    console.error('Invoice email error:', err);
    throw err;
  }
}

// Generic contractor-facing alert email (payout paused, chargeback opened,
// chargeback lost). Best-effort by contract: callers in the webhook must not
// let a send failure throw, or Stripe would retry the whole event and re-run
// the DB mutations.
export async function sendContractorAlertEmail(input: {
  recipientEmail: string;
  businessName: string;
  subject: string;
  heading: string;
  bodyLines: string[];
  ctaLabel: string;
  ctaUrl: string;
  tone?: 'warning' | 'info';
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not configured; contractor alert email skipped');
    return;
  }

  const accent = input.tone === 'info' ? '#2563eb' : '#dc2626';
  const eyebrow = input.tone === 'info' ? 'ACCOUNT UPDATE' : 'ACTION NEEDED';
  const paragraphs = input.bodyLines
    .map((line) => `<p style="margin:0 0 12px;line-height:1.5">${escapeHtml(line)}</p>`)
    .join('');

  const result = await resend.emails.send({
    from: "Let's Get Quoted <hello@letsgetquoted.com>",
    to: input.recipientEmail,
    subject: input.subject,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033"><p style="color:${accent};font-weight:700;letter-spacing:0.04em">${eyebrow}</p><h1 style="font-size:24px;margin:0 0 16px">${escapeHtml(input.heading)}</h1>${paragraphs}<p style="margin-top:24px"><a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;padding:12px 18px;background:#172033;color:#fff;text-decoration:none;font-weight:700;border-radius:6px">${escapeHtml(input.ctaLabel)}</a></p><p style="margin-top:28px;color:#6b7280;font-size:13px">${escapeHtml(input.businessName)} · Let's Get Quoted</p></div>`,
    reply_to: 'hello@letsgetquoted.com',
  });

  if (result.error) {
    console.error('Failed to send contractor alert email:', result.error);
    throw new Error(result.error.message);
  }
  console.log(`Contractor alert email sent to ${input.recipientEmail}: ${input.subject}`);
}

function escapeHtml(value: string | null) {
  return (value || '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] || character);
}

export async function sendLeadNotificationEmail(input: {
  recipientEmail: string;
  businessName: string;
  lead: Lead;
  dashboardUrl: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not configured; quote request notification skipped');
    return;
  }

  const contact = [input.lead.phone, input.lead.email].filter(Boolean).map(escapeHtml).join(' &middot; ');
  const result = await resend.emails.send({
    from: 'Let\'s Get Quoted <hello@letsgetquoted.com>',
    to: input.recipientEmail,
    subject: `New website quote request: ${input.lead.name || 'Project request'}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033"><p style="color:#b45309;font-weight:700">NEW WEBSITE QUOTE REQUEST</p><h1 style="font-size:26px">${escapeHtml(input.lead.name)} requested a quote</h1><p>${contact}</p><p><strong>Project:</strong> ${escapeHtml(input.lead.project_type) || 'Not specified'}</p><p><strong>Address:</strong> ${escapeHtml(input.lead.address) || 'Not specified'}</p><div style="padding:18px;background:#f4f5f7;border-left:4px solid #f59e0b">${escapeHtml(input.lead.message)}</div><p style="margin-top:24px"><a href="${escapeHtml(input.dashboardUrl)}" style="display:inline-block;padding:12px 18px;background:#172033;color:white;text-decoration:none;font-weight:700">Open quote request in ${escapeHtml(input.businessName)}</a></p></div>`,
    reply_to: input.lead.email || 'hello@letsgetquoted.com',
  });
  if (result.error) throw new Error(result.error.message);
}
