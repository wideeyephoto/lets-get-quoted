import { Resend } from 'resend';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateInvoiceHtml } from '@/emails/InvoiceEmail';
import { generateInvoicePdf } from '@/emails/InvoicePdf';
import { computeInvoiceTotals, type Invoice, type InvoiceItem } from './invoices';
import type { Lead } from './leads';
import { formatMoney } from './jobs';

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

    const totals = computeInvoiceTotals(input.items, Number(input.invoice.discount_percent) || 0, Number(input.invoice.tax_rate) || 0);

    const emailHtml = generateInvoiceHtml({
      businessName: input.businessName,
      invoiceRef: input.invoice.ref,
      clientName: input.clientName,
      jobRef: input.jobRef,
      total: totals.total,
      subtotal: totals.subtotal,
      discountPercent: totals.discountPercent,
      discountAmount: totals.discountAmount,
      taxRate: totals.taxRate,
      taxAmount: totals.taxAmount,
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
        total: totals.total,
        subtotal: totals.subtotal,
        discountPercent: totals.discountPercent,
        discountAmount: totals.discountAmount,
        taxRate: totals.taxRate,
        taxAmount: totals.taxAmount,
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

export interface SendClientQuoteEmailInput {
  recipientEmail: string;
  businessName: string;
  clientName: string;
  jobRef: string;
  quotedAmount: number;
  quoteUrl: string;
  includesScheduleOptions?: boolean;
}

// Client-facing quote email — the fallback channel when a lead has an email but
// no textable mobile, so the quote still reaches them instead of silently
// stalling. Throws on provider rejection so the caller can flag delivery failed.
export async function sendClientQuoteEmail(input: SendClientQuoteEmailInput): Promise<void> {
  // Unlike the best-effort alert helpers, this is a PRIMARY delivery channel
  // whose outcome is reported to the owner (and to the client feed). If the
  // provider isn't configured, throw so the caller flags delivery='failed'
  // and shows the honest "copy the link" banner — never a false "emailed".
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Email provider is not configured.');
  }

  const scheduleLine = input.includesScheduleOptions
    ? `<p style="margin:0 0 12px;line-height:1.5">You can also pick a start date right on your quote page.</p>`
    : '';

  const result = await resend.emails.send({
    from: "Let's Get Quoted <hello@letsgetquoted.com>",
    to: input.recipientEmail,
    subject: `Your quote ${input.jobRef} from ${input.businessName}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033"><p style="color:#b45309;font-weight:700;letter-spacing:0.04em">YOUR QUOTE</p><h1 style="font-size:24px;margin:0 0 12px">${escapeHtml(input.clientName)}, here's your quote from ${escapeHtml(input.businessName)}</h1><p style="margin:0 0 12px;font-size:18px"><strong>${escapeHtml(formatMoney(input.quotedAmount))}</strong></p>${scheduleLine}<p style="margin:0 0 20px;line-height:1.5">Review the full details and approve your quote online — no login needed.</p><p><a href="${escapeHtml(input.quoteUrl)}" style="display:inline-block;padding:12px 18px;background:#172033;color:#fff;text-decoration:none;font-weight:700;border-radius:6px">View &amp; approve your quote</a></p><p style="margin-top:28px;color:#6b7280;font-size:13px">${escapeHtml(input.businessName)} · Let's Get Quoted</p></div>`,
    reply_to: 'hello@letsgetquoted.com',
  });

  if (result.error) {
    console.error('Failed to send client quote email:', result.error);
    throw new Error(result.error.message);
  }
  console.log(`Client quote email sent to ${input.recipientEmail}: ${input.jobRef}`);
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

// Gentle nudge on a quote the client hasn't approved yet, over email — the
// fallback channel when there's no consented mobile. Sent by the follow-up cron.
export async function sendQuoteFollowupEmail(input: {
  recipientEmail: string;
  businessName: string;
  clientName: string;
  url: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Email provider is not configured.');
  }

  const result = await resend.emails.send({
    from: "Let's Get Quoted <hello@letsgetquoted.com>",
    to: input.recipientEmail,
    subject: `Still thinking it over? Your quote from ${input.businessName}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033"><p style="color:#b45309;font-weight:700;letter-spacing:0.04em">YOUR QUOTE</p><h1 style="font-size:24px;margin:0 0 12px">${escapeHtml(input.clientName)}, ready to move forward?</h1><p style="margin:0 0 20px;line-height:1.5">Just checking in on your quote from ${escapeHtml(input.businessName)}. When you're ready, you can review and approve it online — no login needed.</p><p><a href="${escapeHtml(input.url)}" style="display:inline-block;padding:12px 18px;background:#172033;color:#fff;text-decoration:none;font-weight:700;border-radius:6px">View &amp; approve your quote</a></p><p style="margin-top:28px;color:#6b7280;font-size:13px">${escapeHtml(input.businessName)} · Let's Get Quoted</p></div>`,
    reply_to: 'hello@letsgetquoted.com',
  });

  if (result.error) {
    console.error('Failed to send quote follow-up email:', result.error);
    throw new Error(result.error.message);
  }
  console.log(`Quote follow-up email sent to ${input.recipientEmail}`);
}

// Post-job ask for a Google review, over email — the fallback channel when the
// client has no textable mobile (or opted out of texts) but does have an email.
// Throws on provider rejection so the caller can report the send failed.
export async function sendReviewRequestEmail(input: {
  recipientEmail: string;
  businessName: string;
  clientName: string;
  reviewUrl: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Email provider is not configured.');
  }

  const result = await resend.emails.send({
    from: "Let's Get Quoted <hello@letsgetquoted.com>",
    to: input.recipientEmail,
    subject: `How did we do? A quick review for ${input.businessName}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033"><p style="color:#b45309;font-weight:700;letter-spacing:0.04em">THANK YOU</p><h1 style="font-size:24px;margin:0 0 12px">${escapeHtml(input.clientName)}, thanks for choosing ${escapeHtml(input.businessName)}</h1><p style="margin:0 0 20px;line-height:1.5">If we earned it, would you take a moment to leave a quick review? For a small business, a few words from a happy customer makes all the difference.</p><p><a href="${escapeHtml(input.reviewUrl)}" style="display:inline-block;padding:12px 18px;background:#172033;color:#fff;text-decoration:none;font-weight:700;border-radius:6px">Leave a review</a></p><p style="margin-top:28px;color:#6b7280;font-size:13px">${escapeHtml(input.businessName)} · Let's Get Quoted</p></div>`,
    reply_to: 'hello@letsgetquoted.com',
  });

  if (result.error) {
    console.error('Failed to send review request email:', result.error);
    throw new Error(result.error.message);
  }
  console.log(`Review request email sent to ${input.recipientEmail}`);
}

// Invites a client to save a card for automatic billing on a recurring plan.
// No charge at this step — the hosted page collects the card + mandate. Throws
// on provider rejection so the caller can report the invite didn't send.
export async function sendCardSetupEmail(input: {
  recipientEmail: string;
  businessName: string;
  planTitle: string;
  url: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Email provider is not configured.');
  }

  const result = await resend.emails.send({
    from: "Let's Get Quoted <hello@letsgetquoted.com>",
    to: input.recipientEmail,
    subject: `Save your card for ${input.businessName}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033"><p style="color:#b45309;font-weight:700;letter-spacing:0.04em">AUTOMATIC BILLING</p><h1 style="font-size:24px;margin:0 0 12px">Save your card for ${escapeHtml(input.businessName)}</h1><p style="margin:0 0 12px;line-height:1.5">${escapeHtml(input.businessName)} set up automatic billing for your recurring service${input.planTitle ? ` (${escapeHtml(input.planTitle)})` : ''}. Save your card once and each visit is billed automatically — <strong>no charge happens now</strong>.</p><p><a href="${escapeHtml(input.url)}" style="display:inline-block;padding:12px 18px;background:#172033;color:#fff;text-decoration:none;font-weight:700;border-radius:6px">Save my card securely</a></p><p style="margin-top:18px;color:#6b7280;font-size:13px;line-height:1.5">Your card is stored securely by Stripe. You can ask ${escapeHtml(input.businessName)} to stop automatic billing at any time.</p><p style="margin-top:24px;color:#6b7280;font-size:13px">${escapeHtml(input.businessName)} · Let's Get Quoted</p></div>`,
    reply_to: 'hello@letsgetquoted.com',
  });

  if (result.error) {
    console.error('Failed to send card setup email:', result.error);
    throw new Error(result.error.message);
  }
}

// One-off broadcast email to a past client. The owner writes plain text; we
// render it into the same branded shell as the other transactional emails
// (blank lines become paragraphs, single newlines become line breaks). Throws
// on provider rejection so the caller can count it as a failed send.
export async function sendCampaignEmail(input: {
  recipientEmail: string;
  businessName: string;
  subject: string;
  body: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Email provider is not configured.');
  }

  const paragraphs = input.body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p style="margin:0 0 14px;line-height:1.6">${escapeHtml(block).replace(/\n/g, '<br/>')}</p>`)
    .join('');

  // Show the business as the sender name; the verified domain stays LGQ. Strip
  // characters that would break the From header rather than risk a rejection.
  const fromName = input.businessName.replace(/["<>,]/g, '').trim() || "Let's Get Quoted";

  const result = await resend.emails.send({
    from: `${fromName} <hello@letsgetquoted.com>`,
    to: input.recipientEmail,
    subject: input.subject,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033">${paragraphs}<p style="margin-top:28px;color:#6b7280;font-size:13px">${escapeHtml(input.businessName)} · sent with Let's Get Quoted</p></div>`,
    reply_to: 'hello@letsgetquoted.com',
  });

  if (result.error) {
    console.error('Failed to send campaign email:', result.error);
    throw new Error(result.error.message);
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
