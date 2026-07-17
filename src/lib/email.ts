import { Resend } from 'resend';
import { generateInvoiceHtml } from '@/emails/InvoiceEmail';
import { generateInvoicePdf } from '@/emails/InvoicePdf';
import type { Invoice, InvoiceItem } from './invoices';
import type { Lead } from './leads';

const resend = new Resend(process.env.RESEND_API_KEY);

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
    console.warn('RESEND_API_KEY not configured; lead notification skipped');
    return;
  }

  const contact = [input.lead.phone, input.lead.email].filter(Boolean).map(escapeHtml).join(' &middot; ');
  const result = await resend.emails.send({
    from: 'Let\'s Get Quoted <hello@letsgetquoted.com>',
    to: input.recipientEmail,
    subject: `New website lead: ${input.lead.name || 'Project request'}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033"><p style="color:#b45309;font-weight:700">NEW WEBSITE LEAD</p><h1 style="font-size:26px">${escapeHtml(input.lead.name)} requested a quote</h1><p>${contact}</p><p><strong>Project:</strong> ${escapeHtml(input.lead.project_type) || 'Not specified'}</p><p><strong>Address:</strong> ${escapeHtml(input.lead.address) || 'Not specified'}</p><div style="padding:18px;background:#f4f5f7;border-left:4px solid #f59e0b">${escapeHtml(input.lead.message)}</div><p style="margin-top:24px"><a href="${escapeHtml(input.dashboardUrl)}" style="display:inline-block;padding:12px 18px;background:#172033;color:white;text-decoration:none;font-weight:700">Open lead in ${escapeHtml(input.businessName)}</a></p></div>`,
    reply_to: input.lead.email || 'hello@letsgetquoted.com',
  });
  if (result.error) throw new Error(result.error.message);
}
