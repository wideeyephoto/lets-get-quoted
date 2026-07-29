import { Resend } from 'resend';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateInvoiceHtml } from '@/emails/InvoiceEmail';
import { generateInvoicePdf } from '@/emails/InvoicePdf';
import { computeInvoiceTotals, type Invoice, type InvoiceItem } from './invoices';
import type { Lead } from './leads';
import { formatMoney } from './jobs';
import { buildUnsubscribePageUrl, buildUnsubscribeOneClickUrl } from './email-suppression';
import type { DailyDigest } from './daily-digest';

const resend = new Resend(process.env.RESEND_API_KEY);

// CAN-SPAM footer for MARKETING email (campaign blasts, "book again", review
// asks): the sender's physical postal address plus a working unsubscribe link.
// Transactional email keeps its plain footer and never calls this.
function marketingFooter(businessName: string, mailingAddress: string | null, unsubscribeUrl: string): string {
  const addressLine = mailingAddress
    ? `<br/><span style="color:#9099a6">${escapeHtml(mailingAddress)}</span>`
    : '';
  return `<p style="margin-top:28px;color:#6b7280;font-size:12px;line-height:1.6">${escapeHtml(businessName)} · sent with Let's Get Quoted${addressLine}<br/><a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280;text-decoration:underline">Unsubscribe from these emails</a></p>`;
}

// RFC 8058 one-click unsubscribe headers, so Gmail/Yahoo bulk-sender rules are met
// and the mail client can render its own native unsubscribe button.
function listUnsubscribeHeaders(oneClickUrl: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${oneClickUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

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
  accountId: string;
  mailingAddress: string | null;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Email provider is not configured.');
  }

  const unsubscribeUrl = buildUnsubscribePageUrl(input.accountId, input.recipientEmail);
  const oneClickUrl = buildUnsubscribeOneClickUrl(input.accountId, input.recipientEmail);
  const result = await resend.emails.send({
    from: "Let's Get Quoted <hello@letsgetquoted.com>",
    to: input.recipientEmail,
    subject: `How did we do? A quick review for ${input.businessName}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033"><p style="color:#b45309;font-weight:700;letter-spacing:0.04em">THANK YOU</p><h1 style="font-size:24px;margin:0 0 12px">${escapeHtml(input.clientName)}, thanks for choosing ${escapeHtml(input.businessName)}</h1><p style="margin:0 0 20px;line-height:1.5">If we earned it, would you take a moment to leave a quick review? For a small business, a few words from a happy customer makes all the difference.</p><p><a href="${escapeHtml(input.reviewUrl)}" style="display:inline-block;padding:12px 18px;background:#172033;color:#fff;text-decoration:none;font-weight:700;border-radius:6px">Leave a review</a></p>${marketingFooter(input.businessName, input.mailingAddress, unsubscribeUrl)}</div>`,
    reply_to: 'hello@letsgetquoted.com',
    headers: listUnsubscribeHeaders(oneClickUrl),
  });

  if (result.error) {
    console.error('Failed to send review request email:', result.error);
    throw new Error(result.error.message);
  }
  console.log(`Review request email sent to ${input.recipientEmail}`);
}

// "Book again" nudge to a past customer, over email — the fallback channel when
// there's no opted-in mobile. Throws on provider rejection so the caller counts
// it as failed.
export async function sendRebookInviteEmail(input: {
  recipientEmail: string;
  businessName: string;
  clientName: string;
  url: string;
  accountId: string;
  mailingAddress: string | null;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Email provider is not configured.');
  }

  const unsubscribeUrl = buildUnsubscribePageUrl(input.accountId, input.recipientEmail);
  const oneClickUrl = buildUnsubscribeOneClickUrl(input.accountId, input.recipientEmail);
  const result = await resend.emails.send({
    from: "Let's Get Quoted <hello@letsgetquoted.com>",
    to: input.recipientEmail,
    subject: `Ready to book ${input.businessName} again?`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033"><p style="color:#b45309;font-weight:700;letter-spacing:0.04em">WE'D LOVE TO HELP AGAIN</p><h1 style="font-size:24px;margin:0 0 12px">${escapeHtml(input.clientName)}, it's been a while!</h1><p style="margin:0 0 20px;line-height:1.5">Thanks again for trusting ${escapeHtml(input.businessName)}. Whenever you're ready for your next project, you can grab a time online in a couple of taps — no phone tag.</p><p><a href="${escapeHtml(input.url)}" style="display:inline-block;padding:12px 18px;background:#172033;color:#fff;text-decoration:none;font-weight:700;border-radius:6px">Book us again</a></p>${marketingFooter(input.businessName, input.mailingAddress, unsubscribeUrl)}</div>`,
    reply_to: 'hello@letsgetquoted.com',
    headers: listUnsubscribeHeaders(oneClickUrl),
  });

  if (result.error) {
    console.error('Failed to send rebook invite email:', result.error);
    throw new Error(result.error.message);
  }
}

// Day-before reminder for a scheduled job, over email — the fallback channel
// when the client has no textable mobile. Sent by the reminders cron. Throws on
// provider rejection so the caller can count it as failed.
export async function sendAppointmentReminderEmail(input: {
  recipientEmail: string;
  businessName: string;
  clientName: string;
  whenLabel: string;
  address: string | null;
  jobRef: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Email provider is not configured.');
  }

  const addressLine = input.address
    ? `<p style="margin:0 0 12px;line-height:1.5"><strong>Where:</strong> ${escapeHtml(input.address)}</p>`
    : '';

  const result = await resend.emails.send({
    from: "Let's Get Quoted <hello@letsgetquoted.com>",
    to: input.recipientEmail,
    subject: `Reminder: your appointment with ${input.businessName}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033"><p style="color:#b45309;font-weight:700;letter-spacing:0.04em">APPOINTMENT REMINDER</p><h1 style="font-size:24px;margin:0 0 12px">${escapeHtml(input.clientName)}, your appointment is coming up</h1><p style="margin:0 0 12px;line-height:1.5"><strong>When:</strong> ${escapeHtml(input.whenLabel)}</p>${addressLine}<p style="margin:0 0 20px;line-height:1.5">${escapeHtml(input.businessName)} is looking forward to seeing you. Need to reschedule? Just reply to this email or give us a call.</p><p style="margin-top:24px;color:#6b7280;font-size:13px">${escapeHtml(input.businessName)} · Let's Get Quoted</p></div>`,
    reply_to: 'hello@letsgetquoted.com',
  });

  if (result.error) {
    console.error('Failed to send appointment reminder email:', result.error);
    throw new Error(result.error.message);
  }
}

// Customer-facing confirmation that a self-serve online booking was received —
// transactional (the customer just took an action), so no marketing footer. Sent
// best-effort from createBooking; throws on provider rejection so the caller logs it.
export async function sendBookingConfirmationEmail(input: {
  recipientEmail: string;
  businessName: string;
  clientName: string;
  whenLabel: string;
  serviceName: string | null;
  address: string | null;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Email provider is not configured.');
  }

  const serviceLine = input.serviceName
    ? `<p style="margin:0 0 12px;line-height:1.5"><strong>Service:</strong> ${escapeHtml(input.serviceName)}</p>`
    : '';
  const addressLine = input.address
    ? `<p style="margin:0 0 12px;line-height:1.5"><strong>Where:</strong> ${escapeHtml(input.address)}</p>`
    : '';

  const result = await resend.emails.send({
    from: "Let's Get Quoted <hello@letsgetquoted.com>",
    to: input.recipientEmail,
    subject: `We got your booking request — ${input.businessName}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033"><p style="color:#0f766e;font-weight:700;letter-spacing:0.04em">BOOKING REQUESTED</p><h1 style="font-size:24px;margin:0 0 12px">${escapeHtml(input.clientName)}, we got your request 🎉</h1><p style="margin:0 0 12px;line-height:1.5"><strong>Requested time:</strong> ${escapeHtml(input.whenLabel)}</p>${serviceLine}${addressLine}<p style="margin:0 0 20px;line-height:1.5">${escapeHtml(input.businessName)} will reach out shortly to confirm. This time isn't locked in until they do — if anything changes, just reply to this email.</p><p style="margin-top:24px;color:#6b7280;font-size:13px">${escapeHtml(input.businessName)} · Let's Get Quoted</p></div>`,
    reply_to: 'hello@letsgetquoted.com',
  });

  if (result.error) {
    console.error('Failed to send booking confirmation email:', result.error);
    throw new Error(result.error.message);
  }
}

// Dunning: the client's saved card was declined on a recurring charge — ask them
// to update it (same hosted setup flow, decline framing). Throws on provider
// rejection so the caller can report it didn't send.
export async function sendCardUpdateEmail(input: {
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
    subject: `Action needed: update your card for ${input.businessName}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033"><p style="color:#dc2626;font-weight:700;letter-spacing:0.04em">ACTION NEEDED</p><h1 style="font-size:24px;margin:0 0 12px">Your card was declined</h1><p style="margin:0 0 12px;line-height:1.5">We couldn't process your recurring payment${input.planTitle ? ` for ${escapeHtml(input.planTitle)}` : ''} to ${escapeHtml(input.businessName)} — your saved card was declined (it may have expired or been replaced). Update your card to keep your service going. <strong>No charge happens until you do.</strong></p><p><a href="${escapeHtml(input.url)}" style="display:inline-block;padding:12px 18px;background:#172033;color:#fff;text-decoration:none;font-weight:700;border-radius:6px">Update my card securely</a></p><p style="margin-top:18px;color:#6b7280;font-size:13px;line-height:1.5">Your card is stored securely by Stripe. You can ask ${escapeHtml(input.businessName)} to stop automatic billing at any time.</p><p style="margin-top:24px;color:#6b7280;font-size:13px">${escapeHtml(input.businessName)} · Let's Get Quoted</p></div>`,
    reply_to: 'hello@letsgetquoted.com',
  });

  if (result.error) {
    console.error('Failed to send card update email:', result.error);
    throw new Error(result.error.message);
  }
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
  accountId: string;
  mailingAddress: string | null;
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

  // Show the business as the sender name; the verified domain stays letsgetquoted.com.
  // Strip characters that would break the From header rather than risk a rejection.
  const fromName = input.businessName.replace(/["<>,]/g, '').trim() || "Let's Get Quoted";

  const unsubscribeUrl = buildUnsubscribePageUrl(input.accountId, input.recipientEmail);
  const oneClickUrl = buildUnsubscribeOneClickUrl(input.accountId, input.recipientEmail);
  const result = await resend.emails.send({
    from: `${fromName} <hello@letsgetquoted.com>`,
    to: input.recipientEmail,
    subject: input.subject,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033">${paragraphs}${marketingFooter(input.businessName, input.mailingAddress, unsubscribeUrl)}</div>`,
    reply_to: 'hello@letsgetquoted.com',
    headers: listUnsubscribeHeaders(oneClickUrl),
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

// Owner "here's your business today" digest. Transactional/relationship email to
// the account owner about their own account — not marketing, so no unsubscribe
// footer (they toggle it in Settings). Throws on provider rejection so the caller
// (cron or the Settings test button) can count it as failed.
export async function sendDailyDigestEmail(input: {
  recipientEmail: string;
  businessName: string;
  digest: DailyDigest;
  dashboardUrl: string;
  manageUrl: string;
  isTest?: boolean;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Email provider is not configured.');
  }
  const d = input.digest;

  // A labelled stat line; `accent` highlights the ones that want attention.
  const row = (label: string, value: string, accent?: 'good' | 'warn') => {
    const color = accent === 'warn' ? '#dc2626' : accent === 'good' ? '#059669' : '#172033';
    return `<tr><td style="padding:8px 0;color:#4b5563;font-size:15px">${escapeHtml(label)}</td><td style="padding:8px 0;text-align:right;font-weight:700;font-size:15px;color:${color}">${value}</td></tr>`;
  };
  const section = (title: string, rowsHtml: string) =>
    rowsHtml
      ? `<p style="margin:22px 0 4px;color:#b45309;font-weight:700;letter-spacing:0.04em;font-size:12px">${escapeHtml(title.toUpperCase())}</p><table style="width:100%;border-collapse:collapse">${rowsHtml}</table>`
      : '';

  const money = [
    d.moneyInCount > 0 ? row('Payments received', `${d.moneyInCount} · ${escapeHtml(formatMoney(d.moneyInTotal))}`, 'good') : '',
    d.failedCount > 0 ? row('Failed charges', `${d.failedCount} · ${escapeHtml(formatMoney(d.failedTotal))}`, 'warn') : '',
    d.openRequestsCount > 0 ? row('Awaiting payment', `${d.openRequestsCount} · ${escapeHtml(formatMoney(d.openRequestsTotal))}`) : '',
  ].join('');
  const pipeline = [
    d.newLeads > 0 ? row('New leads', String(d.newLeads), 'good') : '',
    d.quotesApproved > 0 ? row('Quotes approved', String(d.quotesApproved), 'good') : '',
  ].join('');
  const reputation = [
    d.newReviews > 0 ? row('New reviews', d.newReviewsAvg != null ? `${d.newReviews} · ${d.newReviewsAvg}★ avg` : String(d.newReviews), 'good') : '',
    d.privateFeedback > 0 ? row('Private feedback to review', String(d.privateFeedback), 'warn') : '',
  ].join('');
  const schedule = [
    d.confirmations > 0 ? row('Appointments confirmed', String(d.confirmations), 'good') : '',
    d.rebookDue > 0 ? row('Past clients due to rebook', String(d.rebookDue)) : '',
  ].join('');

  const todayList = d.todaysJobs.length
    ? `<p style="margin:22px 0 4px;color:#b45309;font-weight:700;letter-spacing:0.04em;font-size:12px">TODAY&rsquo;S SCHEDULE · ${d.todaysJobsCount} JOB${d.todaysJobsCount === 1 ? '' : 'S'}</p>` +
      d.todaysJobs
        .map((j) => `<p style="margin:0 0 6px;font-size:15px;color:#172033">${j.time ? `<strong>${escapeHtml(j.time)}</strong> · ` : ''}${escapeHtml(j.clientName)}${j.ref ? ` <span style="color:#9ca3af">${escapeHtml(j.ref)}</span>` : ''}</p>`)
        .join('')
    : '';

  const testBanner = input.isTest
    ? `<p style="margin:0 0 14px;padding:8px 12px;background:#f4f5f7;border-radius:6px;color:#6b7280;font-size:13px">This is a test digest — the real one sends once a day when there&rsquo;s something to report.</p>`
    : '';

  const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033">
    <p style="color:#b45309;font-weight:700;letter-spacing:0.04em">DAILY DIGEST</p>
    <h1 style="font-size:24px;margin:0 0 4px">${escapeHtml(input.businessName)}</h1>
    <p style="margin:0 0 18px;color:#6b7280;font-size:14px">${escapeHtml(d.dateLabel)}</p>
    ${testBanner}
    ${section('Money', money)}
    ${section('Pipeline', pipeline)}
    ${todayList}
    ${section('Schedule', schedule)}
    ${section('Reputation', reputation)}
    <p style="margin:26px 0 0"><a href="${escapeHtml(input.dashboardUrl)}" style="display:inline-block;padding:12px 18px;background:#172033;color:#fff;text-decoration:none;font-weight:700;border-radius:6px">Open your dashboard</a></p>
    <p style="margin-top:26px;color:#9ca3af;font-size:12px;line-height:1.6">You&rsquo;re getting this because the daily digest is on for ${escapeHtml(input.businessName)}. <a href="${escapeHtml(input.manageUrl)}" style="color:#9ca3af">Manage it in Settings</a>.</p>
  </div>`;

  const result = await resend.emails.send({
    from: "Let's Get Quoted <hello@letsgetquoted.com>",
    to: input.recipientEmail,
    subject: `${input.isTest ? '[Test] ' : ''}Your ${input.businessName} daily digest`,
    html,
    reply_to: 'hello@letsgetquoted.com',
  });
  if (result.error) {
    console.error('Failed to send daily digest email:', result.error);
    throw new Error(result.error.message);
  }
}

export async function sendLeadNotificationEmail(input: {
  recipientEmail: string;
  businessName: string;
  lead: Lead;
  dashboardUrl: string;
  // High-value leads (AI estimate clears the owner's threshold) get an escalated
  // subject + a banner so the biggest jobs jump the inbox.
  highValue?: boolean;
  estimate?: { min: number; max: number } | null;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not configured; quote request notification skipped');
    return;
  }

  const contact = [input.lead.phone, input.lead.email].filter(Boolean).map(escapeHtml).join(' &middot; ');
  const range = input.estimate ? `$${input.estimate.min.toLocaleString()}–$${input.estimate.max.toLocaleString()}` : '';
  const subject = input.highValue
    ? `🔥 High-value lead: ${input.lead.name || 'Project request'}${range ? ` (${range})` : ''} — respond fast`
    : `New website quote request: ${input.lead.name || 'Project request'}`;
  const banner = input.highValue
    ? `<div style="padding:14px 18px;margin-bottom:16px;background:#fff1e6;border:1px solid #fb7a3c;border-radius:10px;color:#9a3412;font-weight:700">🔥 HIGH-VALUE LEAD${range ? ` — estimated ${escapeHtml(range)}` : ''}. Get to this one first — fast response wins the big jobs.</div>`
    : '';
  const eyebrow = input.highValue ? 'HIGH-VALUE WEBSITE LEAD' : 'NEW WEBSITE QUOTE REQUEST';
  const result = await resend.emails.send({
    from: 'Let\'s Get Quoted <hello@letsgetquoted.com>',
    to: input.recipientEmail,
    subject,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033">${banner}<p style="color:#b45309;font-weight:700">${eyebrow}</p><h1 style="font-size:26px">${escapeHtml(input.lead.name)} requested a quote</h1><p>${contact}</p><p><strong>Project:</strong> ${escapeHtml(input.lead.project_type) || 'Not specified'}</p><p><strong>Address:</strong> ${escapeHtml(input.lead.address) || 'Not specified'}</p><div style="padding:18px;background:#f4f5f7;border-left:4px solid #f59e0b">${escapeHtml(input.lead.message)}</div><p style="margin-top:24px"><a href="${escapeHtml(input.dashboardUrl)}" style="display:inline-block;padding:12px 18px;background:#172033;color:white;text-decoration:none;font-weight:700">Open quote request in ${escapeHtml(input.businessName)}</a></p></div>`,
    reply_to: input.lead.email || 'hello@letsgetquoted.com',
  });
  if (result.error) throw new Error(result.error.message);
}
