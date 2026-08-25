import { Resend } from 'resend';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateInvoiceHtml } from '@/emails/InvoiceEmail';
import { generateInvoicePdf } from '@/emails/InvoicePdf';
import { computeInvoiceTotals, type Invoice, type InvoiceItem } from './invoices';
import type { Lead } from './leads';
/**
 * BOTH, on purpose, and the difference is whether one person is asked to act on
 * the figure.
 *
 * formatMoneyExact for anything naming a single transaction -- the quote a
 * homeowner approves, the payment request they are sent, the invoice total. Two
 * of those are the amount actually charged, and the rest are the same number the
 * customer is looking at on their own screen: an owner alert reading $4,238 for a
 * quote the customer received as $4,237.50 is two people holding two numbers for
 * one debt.
 *
 * formatMoney (rounding) survives for the DAILY DIGEST alone, where the figures
 * are day totals beside their counts -- "3 · $1,240" -- and nobody reconciles
 * them against anything. That is the case formatUsdRounded documents as its own.
 */
import { formatMoney, formatMoneyExact } from './jobs';
import { APP_ORIGIN } from '@/lib/app-origin';
import { buildUnsubscribePageUrl, buildUnsubscribeOneClickUrl } from './email-suppression';
import { contractorFrom, normalizeEmailTheme, renderBrandedEmail, themePaint, type EmailBrand } from '@/emails/brand';
import { detailCard, statusBanner } from '@/emails/primitives';
import {
  renderClientQuoteEmailHtml,
  renderAppointmentReminderEmailHtml,
  renderContractorAlertEmailHtml,
  type SendClientQuoteEmailInput,
} from '@/emails/renderers';
import { loadEmailBrand, nameOnlyBrand } from './email-brand';
import type { DailyDigest } from './daily-digest';
import { quoteFollowupEmailPreview } from './quote-followups';
import { rebookInviteEmailContent } from './rebook-message';

/**
 * THE CLIENT IS BUILT ON FIRST USE, NOT ON IMPORT.
 *
 * `new Resend(undefined)` throws "Missing API key" from its constructor. This
 * module is in the import graph of /client/jobs/[token], so Next evaluated it
 * during "Collecting page data" on every build — and a build is not a send.
 * Production carries RESEND_API_KEY and passed; Preview does not, so EVERY
 * preview deployment failed, with an error about email, on branches that had
 * not touched email. It read as "the preview environment is broken" for a day.
 *
 * Every send function below already returns early when the key is missing —
 * that guard was written and was correct and could never run, because the
 * constructor threw one import earlier. Deferring it behind a getter is what
 * makes those guards reachable. crew-auth.ts and magic-link.ts have always
 * constructed theirs inside the function; this file was the odd one out.
 *
 * A getter rather than a `resendClient()` call so the nineteen
 * `resend.emails.send(...)` call sites below are untouched: the failure was one
 * line, and a fix that rewrites nineteen others is a fix you have to review
 * nineteen times.
 *
 * DELIBERATELY NOT FIXED BY PUTTING THE KEY IN PREVIEW. A preview build that
 * can send email is a preview build that can email real customers from a
 * branch. Preview should not hold a live sending credential.
 */
let resendClient: Resend | null = null;
const resend = {
  get emails(): Resend['emails'] {
    if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
    return resendClient.emails;
  },
};

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

/**
 * The contractor's brand for a customer-facing email.
 *
 * With an accountId we can reach their color, logo and — the one that matters
 * most — the address a reply should go to. Without one we still put their NAME
 * in the From line, which is most of what a customer needs to recognize it.
 *
 * Never throws: an email that failed to send because branding could not be
 * loaded would be a far worse bug than one that looks plain.
 */
async function brandFor(input: { accountId?: string | null; businessName: string }): Promise<EmailBrand> {
  if (!input.accountId) return nameOnlyBrand(input.businessName);
  try {
    return await loadEmailBrand(input.accountId, input.businessName);
  } catch {
    return nameOnlyBrand(input.businessName);
  }
}

/** Replies reach the contractor when we know how; otherwise they reach us. */
function replyAddress(brand: EmailBrand): string {
  return brand.replyTo || 'hello@letsgetquoted.com';
}

/** Standard tags attached to all outbound emails for outcome tracking and theme performance. */
function defaultTags(kind: string, brand: EmailBrand, accountId?: string | null): Array<{ name: string; value: string }> {
  return [
    { name: 'kind', value: kind },
    { name: 'theme', value: brand.theme || 'studio' },
    { name: 'template_version', value: '2.0' },
    ...(accountId ? [{ name: 'account_id', value: accountId }] : []),
  ];
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
  accountId?: string;
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

    const brand = await brandFor(input);
    const emailHtml = generateInvoiceHtml({
      brand,
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
      from: contractorFrom(brand.businessName),
      to: input.recipientEmail,
      subject: `Invoice ${input.invoice.ref} from ${input.businessName}`,
      html: emailHtml,
      reply_to: replyAddress(brand),
      attachments: pdfBuffer
        ? [
            {
              filename: `Invoice-${input.invoice.ref}.pdf`,
              content: pdfBuffer,
              content_type: 'application/pdf',
            },
          ]
        : undefined,
      tags: defaultTags('invoice', brand, input.accountId),
    });

    if (result.error) {
      console.error('Failed to send invoice email:', result.error);
      throw new Error(result.error.message);
    }

    console.log(`Invoice email sent: ${input.invoice.ref}`);
  } catch (err) {
    console.error('Invoice email error:', err);
    throw err;
  }
}

export {
  renderClientQuoteEmailHtml,
  renderAppointmentReminderEmailHtml,
  renderContractorAlertEmailHtml,
  type SendClientQuoteEmailInput,
} from '@/emails/renderers';

// Client-facing quote email — the fallback channel when a lead has an email but
// no textable mobile, so the quote still reaches them instead of silently
// stalling. Throws on provider rejection so the caller can flag delivery failed.
export async function sendClientQuoteEmail(input: SendClientQuoteEmailInput): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Email provider is not configured.');
  }

  const brand = await brandFor(input);
  const html = renderClientQuoteEmailHtml({ ...input, brand });

  const result = await resend.emails.send({
    from: contractorFrom(brand.businessName),
    to: input.recipientEmail,
    subject: `Your quote ${input.jobRef} from ${input.businessName}`,
    html,
    reply_to: replyAddress(brand),
    tags: defaultTags('client_quote', brand, input.accountId),
  });

  if (result.error) {
    console.error('Failed to send client quote email:', result.error);
    throw new Error(result.error.message);
  }
  console.log(`Client quote email sent: ${input.jobRef}`);
}

/**
 * The office invitation, sent to the person being invited.
 *
 * Until this existed the action minted a link and handed it to the OWNER to
 * pass on themselves, which meant the one thing standing between an employee
 * and their account was a copy-paste into some other app.
 *
 * THROWS WHEN IT CANNOT SEND, deliberately, exactly like sendClientQuoteEmail
 * above: this is a primary delivery channel and its outcome is reported on
 * screen. The caller catches, and the screen says whether the email went. What
 * it must never do is report a send that did not happen -- the invitation is
 * real either way, and the owner needs to know whether to pass the link on by
 * hand.
 *
 * The link is the whole secret. It is shown once, the database keeps only its
 * hash, and it is not logged here -- the log line below names the recipient and
 * nothing else, which is the same rule the action's audit entry follows.
 */
export async function sendOfficeInvitationEmail(input: {
  accountId: string | null;
  businessName: string;
  recipientEmail: string;
  inviteUrl: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Email provider is not configured.');
  }

  const brand = await brandFor(input);

  const result = await resend.emails.send({
    from: contractorFrom(brand.businessName),
    to: input.recipientEmail,
    subject: `${brand.businessName} added you to their team`,
    html: renderBrandedEmail({
      brand,
      preheader: `Set up your access to ${brand.businessName}`,
      eyebrow: 'Team invitation',
      heading: `You have been added to ${brand.businessName}`,
      paragraphs: [
        'Use the button below to set up your sign-in. You will get your own login —'
        + ' you never need the owner’s password, and they never see yours.',
        // Said plainly because the alternative is somebody sitting on a dead
        // link wondering whether they did something wrong.
        'This invitation expires, so open it soon. If it has lapsed, ask them to send another.',
      ],
      cta: { label: 'Set up your access', url: input.inviteUrl },
    }),
    reply_to: replyAddress(brand),
    tags: defaultTags('office_invitation', brand, input.accountId),
  });

  if (result.error) {
    console.error('Failed to send office invitation email:', result.error);
    throw new Error(result.error.message);
  }
  // The recipient, never the link: it is the credential.
  console.log(`Office invitation email sent to ${input.recipientEmail}`);
}

// Generic contractor-facing alert email (payout paused, chargeback opened,
// chargeback lost). Best-effort by contract: callers in the webhook must not
// let a send failure throw, or Stripe would retry the whole event and re-run
// the DB mutations.
export async function sendContractorAlertEmail(input: {
  accountId: string;
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

  const brand = await brandFor(input);
  const html = renderContractorAlertEmailHtml({ ...input, brand });

  const result = await resend.emails.send({
    from: "Let's Get Quoted <hello@letsgetquoted.com>",
    to: input.recipientEmail,
    subject: input.subject,
    html,
    reply_to: 'hello@letsgetquoted.com',
    tags: defaultTags('contractor_alert', brand, input.accountId),
  });

  if (result.error) {
    console.error('Failed to send contractor alert email:', result.error);
    throw new Error(result.error.message);
  }
  console.log(`Contractor alert email sent: ${input.subject}`);
}

// ---------------------------------------------------------------------------
// "It went out" confirmations for the contractor
// ---------------------------------------------------------------------------
// When something goes to a customer, the contractor gets a copy of the fact —
// not the customer's document. They asked for it and then it left their hands;
// a one-line receipt saying who it reached, and how, is what's actually useful.
//
// Delivery is described honestly, including when it DIDN'T happen: an invoice
// with nowhere to send it says so, rather than the contractor assuming the
// customer has it and waiting on a payment that was never requested.

export type SentChannel = 'sms' | 'email' | 'none';

// Pure so the wording stays consistent between quotes and invoices and can be
// asserted in tests without sending anything.
export function describeDelivery(channel: SentChannel, sentTo: string | null): string {
  if (channel === 'sms' && sentTo) return `Texted to ${sentTo}.`;
  if (channel === 'email' && sentTo) return `Emailed to ${sentTo}.`;
  return 'Not delivered — there was no mobile or email on file for them, so nothing was sent.';
}

export async function sendQuoteSentConfirmationEmail(input: {
  accountId: string;
  recipientEmail: string;
  businessName: string;
  clientName: string;
  jobRef: string;
  quotedAmount: number;
  channel: SentChannel;
  sentTo: string | null;
  jobUrl: string;
}): Promise<void> {
  const delivered = input.channel !== 'none';
  await sendContractorAlertEmail({
    accountId: input.accountId,
    recipientEmail: input.recipientEmail,
    businessName: input.businessName,
    subject: delivered
      ? `Quote sent to ${input.clientName} — ${formatMoneyExact(input.quotedAmount)}`
      : `Quote for ${input.clientName} couldn't be sent`,
    heading: delivered ? `Your quote is with ${input.clientName}` : `No way to reach ${input.clientName}`,
    bodyLines: [
      `Job ${input.jobRef} · ${formatMoneyExact(input.quotedAmount)}`,
      describeDelivery(input.channel, input.sentTo),
      delivered
        ? 'You’ll be notified when they open it or approve it.'
        : 'Add a mobile or an email on the job, then send it again.',
    ],
    ctaLabel: 'Open the job',
    ctaUrl: input.jobUrl,
    tone: 'info',
  });
}

export async function sendPaymentRequestedConfirmationEmail(input: {
  accountId: string;
  recipientEmail: string;
  businessName: string;
  clientName: string;
  label: string;
  amount: number;
  channel: SentChannel;
  sentTo: string | null;
  jobUrl: string;
}): Promise<void> {
  const delivered = input.channel !== 'none';
  await sendContractorAlertEmail({
    accountId: input.accountId,
    recipientEmail: input.recipientEmail,
    businessName: input.businessName,
    subject: delivered
      ? `Payment request sent to ${input.clientName} — ${formatMoneyExact(input.amount)}`
      : `Payment request for ${input.clientName} is waiting to be sent`,
    heading: delivered ? `${input.clientName} has your payment request` : `${input.clientName} hasn’t been asked yet`,
    bodyLines: [
      `${input.label} · ${formatMoneyExact(input.amount)}`,
      delivered
        ? describeDelivery(input.channel, input.sentTo)
        : 'The request is on the job, but nothing was sent to them — you didn’t choose to text it.',
      delivered ? 'You’ll be notified when they pay.' : 'Open the job to send them the link.',
    ],
    ctaLabel: 'Open the job',
    ctaUrl: input.jobUrl,
    tone: 'info',
  });
}

export async function sendReviewRequestConfirmationEmail(input: {
  accountId: string;
  recipientEmail: string;
  businessName: string;
  clientName: string;
  jobRef: string;
  channel: SentChannel;
  sentTo: string | null;
  jobUrl: string;
}): Promise<void> {
  const smsQueued = input.channel === 'sms';
  await sendContractorAlertEmail({
    accountId: input.accountId,
    recipientEmail: input.recipientEmail,
    businessName: input.businessName,
    subject: `Review request ${smsQueued ? 'queued for' : 'sent to'} ${input.clientName}`,
    heading: `You asked ${input.clientName} for a review`,
    bodyLines: [
      `Job ${input.jobRef}`,
      smsQueued
        ? `Text queued for ${input.sentTo ?? input.clientName}; delivery status will appear in Messages.`
        : describeDelivery(input.channel, input.sentTo),
    ],
    ctaLabel: 'Open the job',
    ctaUrl: input.jobUrl,
    tone: 'info',
  });
}

// One email per nightly run, not one per customer: reminders go out for every
// job booked the next day, so a per-send confirmation would be a stack of mail
// rather than a signal. This says how many went and how many couldn't.
export async function sendReminderRunSummaryEmail(input: {
  accountId: string;
  recipientEmail: string;
  businessName: string;
  sentCount: number;
  failedCount: number;
  dashboardUrl: string;
}): Promise<void> {
  const plural = input.sentCount === 1 ? 'reminder' : 'reminders';
  await sendContractorAlertEmail({
    accountId: input.accountId,
    recipientEmail: input.recipientEmail,
    businessName: input.businessName,
    subject: `${input.sentCount} appointment ${plural} accepted for tomorrow`,
    heading: `Tomorrow’s reminders are queued or emailed`,
    bodyLines: [
      `${input.sentCount} ${plural} were accepted for delivery.`,
      input.failedCount > 0
        ? `${input.failedCount} couldn’t be queued or emailed.`
        : 'Every eligible reminder was queued or emailed.',
    ],
    ctaLabel: 'Open your schedule',
    ctaUrl: input.dashboardUrl,
    tone: 'info',
  });
}

export async function sendInvoiceSentConfirmationEmail(input: {
  accountId: string;
  recipientEmail: string;
  businessName: string;
  clientName: string;
  invoiceRef: string;
  total: number;
  channel: SentChannel;
  sentTo: string | null;
  jobUrl: string;
}): Promise<void> {
  const delivered = input.channel !== 'none';
  await sendContractorAlertEmail({
    accountId: input.accountId,
    recipientEmail: input.recipientEmail,
    businessName: input.businessName,
    subject: delivered
      ? `Invoice ${input.invoiceRef} sent to ${input.clientName}`
      : `Invoice ${input.invoiceRef} couldn't be sent`,
    heading: delivered ? `${input.clientName} has invoice ${input.invoiceRef}` : `No way to reach ${input.clientName}`,
    bodyLines: [
      `${input.invoiceRef} · ${formatMoneyExact(input.total)}`,
      describeDelivery(input.channel, input.sentTo),
      delivered
        ? 'They can review, sign and pay from the link in their email.'
        : 'Add an email address on the job, then mark the invoice sent again.',
    ],
    ctaLabel: 'Open the job',
    ctaUrl: input.jobUrl,
    tone: 'info',
  });
}

// Gentle nudge on a quote the client hasn't approved yet, over email — the
// fallback channel when there's no consented mobile. Sent by the follow-up cron.
export async function sendQuoteFollowupEmail(input: {
  recipientEmail: string;
  businessName: string;
  clientName: string;
  url: string;
  accountId?: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Email provider is not configured.');
  }

  const brand = await brandFor(input);
  // Subject and body come from lib/quote-followups, the same place the settings
  // card reads them, so the email preview on that card cannot drift from what
  // actually lands in the customer's inbox. The SMS half has worked this way
  // since quoteFollowupText was extracted; this is the email half catching up.
  const copy = quoteFollowupEmailPreview({ businessName: input.businessName, clientName: input.clientName });
  const result = await resend.emails.send({
    from: contractorFrom(brand.businessName),
    to: input.recipientEmail,
    subject: copy.subject,
    html: renderBrandedEmail({
      brand,
      preheader: `Your quote from ${input.businessName} is still open`,
      eyebrow: 'Your quote',
      heading: copy.heading,
      paragraphs: [copy.body],
      cta: { label: copy.cta, url: input.url },
    }),
    reply_to: replyAddress(brand),
    tags: defaultTags('quote_followup', brand, input.accountId),
  });

  if (result.error) {
    console.error('Failed to send quote follow-up email:', result.error);
    throw new Error(result.error.message);
  }
  console.log('Quote follow-up email sent');
}

/**
 * "There are choices waiting for you" — the email fallback.
 *
 * The colors, materials and fixtures a homeowner has to pick before ordering
 * can start. Named in the subject rather than hidden behind "an update on your
 * job", because the whole point is that it needs an action from them.
 */
export async function sendSelectionRequestEmail(input: {
  recipientEmail: string;
  businessName: string;
  clientName: string;
  count: number;
  overdue: boolean;
  url: string;
  accountId?: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Email provider is not configured.');
  }

  const brand = await brandFor(input);
  const first = input.clientName.trim().split(/\s+/)[0] || 'there';
  const what = input.count === 1 ? 'a choice' : `${input.count} choices`;
  const result = await resend.emails.send({
    from: contractorFrom(brand.businessName),
    to: input.recipientEmail,
    subject: input.overdue
      ? `We're waiting on ${what} from you — ${input.businessName}`
      : `${input.count === 1 ? 'A choice' : `${input.count} choices`} to make on your job with ${input.businessName}`,
    html: renderBrandedEmail({
      brand,
      preheader: `${what} to make before we can order`,
      eyebrow: 'Your choices',
      heading: input.overdue ? `${first}, we're held up waiting on you` : `${first}, ${what} to make`,
      paragraphs: [
        input.overdue
          ? `We need ${what} from you before we can order and get on with the job. It only takes a minute — everything is priced against what your quote already allows for, so you can see exactly what each one costs.`
          : `There ${input.count === 1 ? 'is' : 'are'} ${what} to make on your job with ${input.businessName}. Everything is priced against what your quote already allows for, so you can see exactly what each one costs before you decide.`,
      ],
      cta: { label: input.count === 1 ? 'Make your choice' : 'Make your choices', url: input.url },
    }),
    reply_to: replyAddress(brand),
    tags: defaultTags('selection_request', brand, input.accountId),
  });

  if (result.error) {
    console.error('Failed to send selection request email:', result.error);
    throw new Error(result.error.message);
  }
  console.log('Selection request email sent');
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

  const brand = await brandFor(input);
  const unsubscribeUrl = buildUnsubscribePageUrl(input.accountId, input.recipientEmail);
  const oneClickUrl = buildUnsubscribeOneClickUrl(input.accountId, input.recipientEmail);
  const result = await resend.emails.send({
    from: contractorFrom(brand.businessName),
    to: input.recipientEmail,
    subject: `How did we do? A quick review for ${input.businessName}`,
    html: renderBrandedEmail({
      brand,
      preheader: `A quick review for ${input.businessName}`,
      eyebrow: 'Thank you',
      heading: `${input.clientName}, thanks for choosing ${input.businessName}`,
      paragraphs: ['Would you take a moment to leave an honest review? For a small business, a few words from a real customer makes all the difference.'],
      cta: { label: 'Leave a review', url: input.reviewUrl },
      footerHtml: marketingFooter(input.businessName, input.mailingAddress, unsubscribeUrl),
    }),
    reply_to: replyAddress(brand),
    headers: listUnsubscribeHeaders(oneClickUrl),
    tags: defaultTags('review_request', brand, input.accountId),
  });

  if (result.error) {
    console.error('Failed to send review request email:', result.error);
    throw new Error(result.error.message);
  }
  console.log('Review request email sent');
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

  const brand = await brandFor(input);
  const unsubscribeUrl = buildUnsubscribePageUrl(input.accountId, input.recipientEmail);
  const oneClickUrl = buildUnsubscribeOneClickUrl(input.accountId, input.recipientEmail);
  const content = rebookInviteEmailContent(input);
  const result = await resend.emails.send({
    from: contractorFrom(brand.businessName),
    to: input.recipientEmail,
    subject: content.subject,
    html: renderBrandedEmail({
      brand,
      preheader: content.preheader,
      eyebrow: content.eyebrow,
      heading: content.heading,
      paragraphs: content.paragraphs,
      cta: { label: content.ctaLabel, url: input.url },
      footerHtml: marketingFooter(input.businessName, input.mailingAddress, unsubscribeUrl),
    }),
    reply_to: replyAddress(brand),
    headers: listUnsubscribeHeaders(oneClickUrl),
    tags: defaultTags('rebook_invite', brand, input.accountId),
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
  accountId?: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Email provider is not configured.');
  }

  const brand = await brandFor(input);
  const html = renderAppointmentReminderEmailHtml({ ...input, brand });

  const result = await resend.emails.send({
    from: contractorFrom(brand.businessName),
    to: input.recipientEmail,
    subject: `Reminder: your appointment with ${input.businessName}`,
    html,
    reply_to: replyAddress(brand),
    tags: defaultTags('appointment_reminder', brand, input.accountId),
  });

  if (result.error) {
    console.error('Failed to send appointment reminder email:', result.error);
    throw new Error(result.error.message);
  }
}

/**
 * "Here is what your customers will get" — the choice-reminder test send.
 *
 * Goes to the OWNER, never to a customer, and carries the message verbatim
 * rather than a description of it. The whole value of a test is seeing the
 * actual words, including whatever the owner just typed into the template, so
 * the body is passed in already rendered by choiceReminderText and this function
 * only addresses the envelope.
 *
 * Deliberately not sent as a text. A test that costs a segment and lands on the
 * owner's personal phone is one they run once; and the words are identical
 * either way, which is the thing being checked.
 */
export async function sendChoiceReminderTestEmail(input: {
  recipientEmail: string;
  businessName: string;
  /** The rendered SMS body, exactly as a customer would receive it. */
  message: string;
  accountId?: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Email provider is not configured.');
  }

  const brand = await brandFor(input);
  const result = await resend.emails.send({
    from: contractorFrom(brand.businessName),
    to: input.recipientEmail,
    subject: `Test: your choice reminder from ${input.businessName}`,
    html: renderBrandedEmail({
      brand,
      preheader: 'This is the reminder your customers will receive.',
      eyebrow: 'Test message',
      heading: 'This is what your customers will get',
      paragraphs: [
        'Nobody else received this. It is the choice reminder exactly as it goes out, with sample choices standing in for real ones.',
        input.message,
      ],
    }),
    reply_to: replyAddress(brand),
    tags: defaultTags('choice_reminder_test', brand, input.accountId),
  });

  if (result.error) {
    console.error('Failed to send choice reminder test email:', result.error);
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
  /** The second window they said they could also do, when they named one. */
  altWhenLabel?: string | null;
  serviceName: string | null;
  address: string | null;
  accountId?: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Email provider is not configured.');
  }

  const brand = await brandFor(input);
  // "First choice" only once there is a second one to be first of. On a request
  // with a single window, labelling it that way invites the reader to look for
  // the other one.
  const paragraphs = [
    input.altWhenLabel ? `First choice: ${input.whenLabel}` : `Requested time: ${input.whenLabel}`,
  ];
  if (input.altWhenLabel) paragraphs.push(`Second choice: ${input.altWhenLabel}`);
  if (input.serviceName) paragraphs.push(`Service: ${input.serviceName}`);
  if (input.address) paragraphs.push(`Where: ${input.address}`);
  paragraphs.push(
    input.altWhenLabel
      ? `${input.businessName} will reach out shortly to confirm ONE of these two times. Neither is locked in until they do — if anything changes, just reply to this email.`
      : `${input.businessName} will reach out shortly to confirm. This time is not locked in until they do — if anything changes, just reply to this email.`,
  );

  const result = await resend.emails.send({
    from: contractorFrom(brand.businessName),
    to: input.recipientEmail,
    subject: `We got your booking request — ${input.businessName}`,
    html: renderBrandedEmail({
      brand,
      preheader: `Requested ${input.whenLabel}`,
      eyebrow: 'Booking requested',
      heading: `${input.clientName}, we got your request`,
      paragraphs,
    }),
    reply_to: replyAddress(brand),
    tags: defaultTags('booking_confirmation', brand, input.accountId),
  });

  if (result.error) {
    console.error('Failed to send booking confirmation email:', result.error);
    throw new Error(result.error.message);
  }
}

// Dunning: the client's saved card was declined on a recurring charge — ask them
// to update it (same hosted setup flow, decline framing). Throws on provider
// rejection so the caller can report it didn't send.
/**
 * The homeowner's way back into their own job history.
 *
 * Transactional, not marketing: it is only ever sent in direct response to
 * somebody typing their address into the contractor's site and asking for it.
 * That's why it carries no unsubscribe footer and no mailing address — it isn't
 * a message they can be signed up for.
 */
export async function sendClientPortalLinkEmail(input: {
  recipientEmail: string;
  businessName: string;
  linkUrl: string;
  accountId?: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Email provider is not configured.');
  }

  const brand = await brandFor(input);
  const result = await resend.emails.send({
    from: contractorFrom(brand.businessName),
    to: input.recipientEmail,
    subject: `Your jobs with ${input.businessName}`,
    html: renderBrandedEmail({
      brand,
      preheader: `Your job history with ${input.businessName}`,
      heading: 'Here is your link',
      paragraphs: [
        `This opens everything ${input.businessName} has done for you — past jobs, what is covered by warranty, and how long you have left on it.`,
      ],
      cta: { label: 'Open my jobs', url: input.linkUrl },
      footerHtml: `<p style="margin:10px 0 0;font-size:12px;line-height:1.6;color:#6b7280">The link works for 90 days and only opens your own records. Do not forward it — anyone with it can see your job history. If you did not ask for this, you can ignore it; nothing has changed on your account.</p>`,
    }),
    reply_to: replyAddress(brand),
    tags: defaultTags('client_portal_link', brand, input.accountId),
  });

  if (result.error) {
    console.error('Failed to send client portal link email:', result.error);
    throw new Error(result.error.message);
  }
}

export async function sendCardUpdateEmail(input: {
  recipientEmail: string;
  businessName: string;
  planTitle: string;
  url: string;
  accountId?: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Email provider is not configured.');
  }

  const brand = await brandFor(input);
  const result = await resend.emails.send({
    from: contractorFrom(brand.businessName),
    to: input.recipientEmail,
    subject: `Action needed: update your card for ${input.businessName}`,
    html: renderBrandedEmail({
      brand,
      preheader: 'Your saved card was declined — no charge until you update it',
      eyebrow: 'Action needed',
      heading: 'Your card was declined',
      paragraphs: [
        `We could not process your recurring payment${input.planTitle ? ` for ${input.planTitle}` : ''} to ${input.businessName} — your saved card was declined (it may have expired or been replaced). Update your card to keep your service going. No charge happens until you do.`,
      ],
      cta: { label: 'Update my card securely', url: input.url },
      footerHtml: `<p style="margin:10px 0 0;font-size:12px;line-height:1.6;color:#6b7280">Your card is stored securely by Stripe. You can ask ${escapeHtml(input.businessName)} to stop automatic billing at any time.</p>`,
    }),
    reply_to: replyAddress(brand),
    tags: defaultTags('card_update', brand, input.accountId),
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
  accountId?: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Email provider is not configured.');
  }

  const brand = await brandFor(input);
  const result = await resend.emails.send({
    from: contractorFrom(brand.businessName),
    to: input.recipientEmail,
    subject: `Save your card for ${input.businessName}`,
    html: renderBrandedEmail({
      brand,
      preheader: `Save a card for ${input.businessName} — no charge now`,
      eyebrow: 'Automatic billing',
      heading: `Save your card for ${input.businessName}`,
      paragraphs: [
        `${input.businessName} set up automatic billing for your recurring service${input.planTitle ? ` (${input.planTitle})` : ''}. Save your card once and each visit is billed automatically — no charge happens now.`,
      ],
      cta: { label: 'Save my card securely', url: input.url },
      footerHtml: `<p style="margin:10px 0 0;font-size:12px;line-height:1.6;color:#6b7280">Your card is stored securely by Stripe. You can ask ${escapeHtml(input.businessName)} to stop automatic billing at any time.</p>`,
    }),
    reply_to: replyAddress(brand),
    tags: defaultTags('card_setup', brand, input.accountId),
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
// The owner's plain text as email HTML: blank lines become paragraphs, single
// newlines become line breaks.
function campaignParagraphs(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p style="margin:0 0 14px;line-height:1.6">${escapeHtml(block).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

/**
 * The exact HTML a campaign email is sent as.
 *
 * Extracted so the composer's preview can call it rather than approximate it.
 * A preview built from its own markup is a preview that can be right while the
 * email is wrong — and the parts most likely to be missing are the ones nobody
 * would think to reproduce: the unsubscribe link and the postal address that
 * make the send lawful.
 */
export async function renderCampaignEmailHtml(input: {
  recipientEmail: string;
  businessName: string;
  subject: string;
  body: string;
  accountId: string;
  mailingAddress: string | null;
}): Promise<string> {
  const brand = await brandFor(input);
  const unsubscribeUrl = buildUnsubscribePageUrl(input.accountId, input.recipientEmail);
  return renderBrandedEmail({
    brand,
    heading: input.subject,
    bodyHtml: campaignParagraphs(input.body),
    footerHtml: marketingFooter(input.businessName, input.mailingAddress, unsubscribeUrl),
  });
}

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

  const brand = await brandFor(input);
  const oneClickUrl = buildUnsubscribeOneClickUrl(input.accountId, input.recipientEmail);
  const result = await resend.emails.send({
    from: contractorFrom(brand.businessName),
    to: input.recipientEmail,
    subject: input.subject,
    html: await renderCampaignEmailHtml(input),
    reply_to: replyAddress(brand),
    headers: listUnsubscribeHeaders(oneClickUrl),
    tags: defaultTags('campaign', brand, input.accountId),
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

// The owner's "here's your business today" digest, separated from delivery so
// every selected theme can be rendered and inspected without sending an email.
export function renderDailyDigestEmailHtml(input: {
  brand: EmailBrand;
  businessName: string;
  digest: DailyDigest;
  dashboardUrl: string;
  manageUrl: string;
  isTest?: boolean;
}): string {
  const d = input.digest;
  const theme = normalizeEmailTheme(input.brand.theme);
  const paint = themePaint(theme, input.brand.accent);

  // A labelled stat line; `accent` highlights the ones that want attention.
  const row = (label: string, value: string, accent?: 'good' | 'warn') => {
    const color = accent === 'warn' ? '#dc2626' : accent === 'good' ? '#059669' : '#172033';
    return `<tr><td style="padding:7px 0;color:#4b5563;font-size:14px">${escapeHtml(label)}</td><td style="padding:7px 0;text-align:right;font-weight:700;font-size:14px;color:${color}">${value}</td></tr>`;
  };

  const section = (title: string, rowsHtml: string) => {
    if (!rowsHtml) return '';
    return detailCard(paint, `<table style="width:100%;border-collapse:collapse">${rowsHtml}</table>`, {
      title,
    });
  };

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
    d.cash
      ? row(
          d.cash.overdraft ? `Overdrawn ${d.cash.label}` : `Under your buffer ${d.cash.label}`,
          d.cash.daysAway === 0
            ? `Today · projected ${escapeHtml(formatMoney(d.cash.amount))}`
            : `${d.cash.daysAway} day${d.cash.daysAway === 1 ? '' : 's'} away · projected ${escapeHtml(formatMoney(d.cash.amount))}`,
          'warn',
        )
      : '',
    d.confirmations > 0 ? row('Appointments confirmed', String(d.confirmations), 'good') : '',
    d.rebookDue > 0 ? row('Past clients due to rebook', String(d.rebookDue)) : '',
    d.selections
      ? row(
          `Waiting on customer choices · ${d.selections.jobs} job${d.selections.jobs === 1 ? '' : 's'}`,
          d.selections.overdue > 0
            ? `${d.selections.overdue} past the date you needed`
            : 'None late yet',
          d.selections.overdue > 0 ? 'warn' : undefined,
        )
      : '',
    d.payday
      ? row(
          d.payday.label,
          d.payday.needsApproval > 0
            ? `${d.payday.needsApproval} to approve · ${d.payday.unpaid} unpaid`
            : `${d.payday.unpaid} still to pay`,
          'warn',
        )
      : '',
  ].join('');

  const todayList = d.todaysJobs.length
    ? detailCard(
        paint,
        d.todaysJobs
          .map((j) => `<p style="margin:0 0 6px;font-size:14px;color:#172033">${j.time ? `<strong>${escapeHtml(j.time)}</strong> · ` : ''}${escapeHtml(j.clientName)}${j.ref ? ` <span style="color:#9ca3af">${escapeHtml(j.ref)}</span>` : ''}</p>`)
          .join(''),
        { title: 'Today’s Schedule', subtitle: `${d.todaysJobsCount} job${d.todaysJobsCount === 1 ? '' : 's'}` },
      )
    : '';

  const testBanner = input.isTest
    ? statusBanner(paint, {
        tone: 'info',
        title: 'Test Digest',
        message: 'This is a test digest — the real one sends once a day when there is something to report.',
      })
    : '';

  return renderBrandedEmail({
    brand: input.brand,
    audience: 'account',
    preheader: `${input.businessName} · ${d.dateLabel}`,
    eyebrow: 'Daily digest',
    heading: 'Your business today',
    paragraphs: [d.dateLabel],
    bodyHtml: [
      testBanner,
      section('Money', money),
      section('Pipeline', pipeline),
      todayList,
      section('Schedule', schedule),
      section('Reputation', reputation),
    ].join(''),
    cta: { label: 'Open your dashboard', url: input.dashboardUrl },
    footerHtml: `<p style="margin:12px 0 0;color:#9ca3af;font-size:12px;line-height:1.6">You&rsquo;re getting this because the daily digest is on for ${escapeHtml(input.businessName)}. <a href="${escapeHtml(input.manageUrl)}" style="color:#9ca3af">Manage the daily digest</a>.</p>`,
  });
}

export async function sendDailyDigestEmail(input: {
  accountId: string;
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
  const brand = await brandFor(input);
  const html = renderDailyDigestEmailHtml({ ...input, brand });
  const result = await resend.emails.send({
    from: "Let's Get Quoted <hello@letsgetquoted.com>",
    to: input.recipientEmail,
    subject: `${input.isTest ? '[Test] ' : ''}Your ${input.businessName} daily digest`,
    html,
    reply_to: 'hello@letsgetquoted.com',
    tags: defaultTags('daily_digest', brand, input.accountId),
  });
  if (result.error) {
    console.error('Failed to send daily digest email:', result.error);
    throw new Error(result.error.message);
  }
}

export async function sendLeadNotificationEmail(input: {
  accountId: string;
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
  const brand = await brandFor(input);
  const result = await resend.emails.send({
    from: 'Let\'s Get Quoted <hello@letsgetquoted.com>',
    to: input.recipientEmail,
    subject,
    html: renderBrandedEmail({
      brand,
      audience: 'account',
      preheader: subject,
      eyebrow,
      heading: `${input.lead.name || 'A customer'} requested a quote`,
      accountReplyText: `Reply to this email to contact ${input.lead.name || 'the lead'} directly.`,
      bodyHtml: `${banner}<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#1c2230"><strong>Contact:</strong> ${contact || 'Not provided'}</p><p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#1c2230"><strong>Project:</strong> ${escapeHtml(input.lead.project_type) || 'Not specified'}</p><p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1c2230"><strong>Address:</strong> ${escapeHtml(input.lead.address) || 'Not specified'}</p><div style="padding:18px;background:#f4f5f7;border-left:4px solid #f59e0b;line-height:1.6;color:#1c2230">${escapeHtml(input.lead.message)}</div>`,
      cta: { label: `Open quote request in ${input.businessName}`, url: input.dashboardUrl },
    }),
    reply_to: input.lead.email || 'hello@letsgetquoted.com',
    tags: defaultTags('lead_notification', brand, input.accountId),
  });
  if (result.error) throw new Error(result.error.message);
}

// Inbound "contact us" message from the public /contact form, routed to our own
// support inbox (never displayed on the site). reply_to is the sender so we can
// just hit reply. Throws on provider rejection so the form shows an honest error.
export async function sendContactMessageEmail(input: {
  fromName: string;
  fromEmail: string;
  subject?: string;
  message: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Email provider is not configured.');
  }
  const subjectLine = input.subject?.trim() || 'New message';
  const result = await resend.emails.send({
    from: "Let's Get Quoted Contact <hello@letsgetquoted.com>",
    to: 'hello@letsgetquoted.com',
    subject: `[Contact] ${subjectLine} — ${input.fromName}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033"><p style="color:#b45309;font-weight:700;letter-spacing:0.04em">CONTACT FORM</p><h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(input.fromName)} sent a message</h1><p style="margin:0 0 6px"><strong>Email:</strong> ${escapeHtml(input.fromEmail)}</p>${input.subject ? `<p style="margin:0 0 6px"><strong>Subject:</strong> ${escapeHtml(input.subject)}</p>` : ''}<div style="padding:16px;margin-top:12px;background:#f4f5f7;border-left:4px solid #f59e0b;line-height:1.6">${escapeHtml(input.message).replace(/\n/g, '<br/>')}</div></div>`,
    reply_to: input.fromEmail,
    tags: [{ name: 'kind', value: 'contact_message' }],
  });
  if (result.error) {
    console.error('Failed to send contact message email:', result.error);
    throw new Error(result.error.message);
  }
}

// --- Support cases -----------------------------------------------------------
// A case thread lives in the database, not in an inbox — there is no inbound
// mail parsing here, so a reply typed into an email client would never reach
// support_case_notes. These emails therefore carry the message AND a link back
// to where the conversation actually is, and never invite a reply by mail.

/** Tells staff somebody is waiting. Reply-to is the contractor, so a hurried
    reply from the inbox still reaches a human even though it will not thread. */
export async function sendSupportCaseStaffEmail(input: {
  kind: 'opened' | 'reply';
  caseId: string;
  subject: string;
  body: string;
  requesterEmail: string;
  businessName: string | null;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) throw new Error('Email provider is not configured.');
  const who = input.businessName?.trim() || input.requesterEmail;
  const headline = input.kind === 'opened' ? `${who} opened a support request` : `${who} replied`;
  const result = await resend.emails.send({
    from: "Let's Get Quoted Support <hello@letsgetquoted.com>",
    to: 'hello@letsgetquoted.com',
    subject: `[Support] ${input.subject} — ${who}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033"><p style="color:#b45309;font-weight:700;letter-spacing:0.04em">SUPPORT REQUEST</p><h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(headline)}</h1><p style="margin:0 0 6px"><strong>From:</strong> ${escapeHtml(input.requesterEmail)}</p><p style="margin:0 0 6px"><strong>Subject:</strong> ${escapeHtml(input.subject)}</p><div style="padding:16px;margin-top:12px;background:#f4f5f7;border-left:4px solid #f59e0b;line-height:1.6">${escapeHtml(input.body).replace(/\n/g, '<br/>')}</div><p style="margin:18px 0 0"><a href="${APP_ORIGIN}/admin/cases/${input.caseId}" style="color:#b45309;font-weight:700">Open the case →</a></p><p style="margin:8px 0 0;color:#6b7280;font-size:13px">Replying here does not reach the customer — answer on the case so it lands in their thread.</p></div>`,
    reply_to: input.requesterEmail,
    tags: [{ name: 'kind', value: 'support_case_staff' }],
  });
  if (result.error) {
    console.error('Failed to send support case staff email:', result.error);
    throw new Error(result.error.message);
  }
}

/** Confirms receipt, or carries a staff reply. Never asks them to reply by
    email — the link is the only way back into the thread. */
export async function sendSupportCaseCustomerEmail(input: {
  kind: 'received' | 'reply';
  to: string;
  caseId: string;
  subject: string;
  body?: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) throw new Error('Email provider is not configured.');
  const received = input.kind === 'received';
  const headline = received ? 'We have got your request' : 'Support replied to your request';
  const lead = received
    ? 'A real person will read this and come back to you. You can follow it here at any time.'
    : 'Here is what we said. Carry on the conversation on the same page.';
  const quote = input.body
    ? `<div style="padding:16px;margin-top:12px;background:#f4f5f7;border-left:4px solid #f59e0b;line-height:1.6">${escapeHtml(input.body).replace(/\n/g, '<br/>')}</div>`
    : '';
  const result = await resend.emails.send({
    from: "Let's Get Quoted Support <hello@letsgetquoted.com>",
    to: input.to,
    subject: received ? `We have your request: ${input.subject}` : `Re: ${input.subject}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033"><h1 style="font-size:22px;margin:0 0 10px">${escapeHtml(headline)}</h1><p style="margin:0 0 6px;color:#4b5563">${escapeHtml(lead)}</p><p style="margin:12px 0 0"><strong>${escapeHtml(input.subject)}</strong></p>${quote}<p style="margin:18px 0 0"><a href="${APP_ORIGIN}/dashboard/help/${input.caseId}" style="color:#b45309;font-weight:700">Open your request →</a></p></div>`,
    tags: [{ name: 'kind', value: 'support_case_customer' }],
  });
  if (result.error) {
    console.error('Failed to send support case customer email:', result.error);
    throw new Error(result.error.message);
  }
}
