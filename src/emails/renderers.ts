import {
  contractorFrom,
  escapeHtml,
  normalizeEmailTheme,
  renderBrandedEmail,
  themePaint,
  type EmailBrand,
  type EmailThemeId,
} from './brand';
import { generateInvoiceHtml } from './InvoiceEmail';
import { appointmentBlock, contactBlock, moneySummary, statusBanner } from './primitives';
import { formatUsdExact } from '@/lib/money-format';

export interface SendClientQuoteEmailInput {
  recipientEmail: string;
  businessName: string;
  accountId?: string;
  clientName: string;
  jobRef: string;
  quotedAmount: number;
  quoteUrl: string;
  includesScheduleOptions?: boolean;
}

/**
 * Generates the production HTML for a client quote email.
 * Reusable for live sending and preview rendering.
 */
export function renderClientQuoteEmailHtml(input: SendClientQuoteEmailInput & { brand: EmailBrand }): string {
  const brand = input.brand;
  const theme = normalizeEmailTheme(brand.theme);
  const paint = themePaint(theme, brand.accent);

  const paragraphs = [
    'Your customized quote is ready for review. Approve online to lock in your project schedule.',
  ];
  if (input.includesScheduleOptions) {
    paragraphs.push('You can also pick your preferred start date right on your quote page.');
  }

  const quoteSummary = moneySummary(
    paint,
    [{ label: 'Estimated Project Total', value: formatUsdExact(input.quotedAmount), strong: true }],
    { label: 'Total Estimate', value: formatUsdExact(input.quotedAmount) },
    { dueNotice: `Quote ${escapeHtml(input.jobRef)} · Valid for 30 days` },
  );

  const contactHtml = contactBlock(paint, brand, {
    prompt: `Questions about quote ${escapeHtml(input.jobRef)}?`,
  });

  return renderBrandedEmail({
    brand,
    preheader: `${formatUsdExact(input.quotedAmount)} · Quote ${input.jobRef} from ${input.businessName}`,
    eyebrow: `Quote ${input.jobRef}`,
    heading: `${input.clientName}, here is your quote`,
    paragraphs,
    bodyHtml: quoteSummary,
    cta: { label: 'View & approve your quote', url: input.quoteUrl },
    contactCallout: contactHtml,
  });
}

/**
 * Generates the production HTML for an appointment reminder email.
 * Reusable for live sending and preview rendering.
 */
export function renderAppointmentReminderEmailHtml(input: {
  brand: EmailBrand;
  clientName: string;
  businessName: string;
  whenLabel: string;
  address: string | null;
  serviceName?: string | null;
  jobRef?: string;
  notes?: string | null;
}): string {
  const { brand } = input;
  const theme = normalizeEmailTheme(brand.theme);
  const paint = themePaint(theme, brand.accent);

  const apptCard = appointmentBlock(paint, {
    whenLabel: input.whenLabel,
    address: input.address,
    serviceName: input.serviceName,
    notes: input.notes ?? `${input.businessName} will arrive within your scheduled arrival window.`,
    rescheduleText: 'Need to reschedule or update access instructions? Just reply to this email or call us directly.',
  });

  const contactHtml = contactBlock(paint, brand, {
    prompt: `Need to reach ${input.businessName} before this visit?`,
  });

  return renderBrandedEmail({
    brand,
    preheader: `Reminder: your appointment on ${input.whenLabel} with ${input.businessName}`,
    eyebrow: 'Appointment reminder',
    heading: `${input.clientName}, your appointment is coming up`,
    paragraphs: [
      `${input.businessName} is scheduled and looking forward to seeing you. Here are the visit details:`,
    ],
    bodyHtml: apptCard,
    contactCallout: contactHtml,
  });
}

/**
 * Generates the production HTML for an urgent contractor alert email.
 * Reusable for live sending and preview rendering.
 */
export function renderContractorAlertEmailHtml(input: {
  brand: EmailBrand;
  subject: string;
  heading: string;
  bodyLines: string[];
  ctaLabel: string;
  ctaUrl: string;
  tone?: 'warning' | 'info';
}): string {
  const eyebrow = input.tone === 'info' ? 'ACCOUNT UPDATE' : 'ACTION NEEDED';
  const brand = input.brand;
  const theme = normalizeEmailTheme(brand.theme);
  const paint = themePaint(theme, brand.accent);

  const banner = input.tone === 'warning'
    ? statusBanner(paint, {
        tone: 'warn',
        title: 'Action Needed',
        message: input.bodyLines[0] || 'Please review this update to prevent disruptions.',
      })
    : '';

  return renderBrandedEmail({
    brand,
    audience: 'account',
    preheader: input.subject,
    eyebrow,
    heading: input.heading,
    paragraphs: input.tone === 'warning' ? input.bodyLines.slice(1) : input.bodyLines,
    bodyHtml: banner,
    cta: { label: input.ctaLabel, url: input.ctaUrl },
  });
}

export type EmailPreviewKind = 'quote' | 'invoice' | 'appointment' | 'campaign' | 'alert';

export interface EmailPreviewResult {
  kind: EmailPreviewKind;
  label: string;
  subject: string;
  preheader: string;
  from: string;
  replyTo: string;
  html: string;
}

export const EMAIL_PREVIEW_TABS: Array<{ id: EmailPreviewKind; label: string; recipientType: 'Customer' | 'Contractor' }> = [
  { id: 'quote', label: 'Quote', recipientType: 'Customer' },
  { id: 'invoice', label: 'Invoice', recipientType: 'Customer' },
  { id: 'appointment', label: 'Appointment reminder', recipientType: 'Customer' },
  { id: 'campaign', label: 'Campaign', recipientType: 'Customer' },
  { id: 'alert', label: 'Contractor alert', recipientType: 'Contractor' },
];

function campaignParagraphs(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p style="margin:0 0 14px;line-height:1.6">${escapeHtml(block).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

/**
 * Pure synchronous renderer for sample email previews.
 * Executes in client and server components with 0ms latency and 0 network roundtrips.
 */
export function renderSampleEmailPreviewSync(
  theme: EmailThemeId,
  kind: EmailPreviewKind,
  brandInput: Partial<EmailBrand> & { businessName?: string },
): EmailPreviewResult {
  const businessName = (brandInput.businessName || 'Apex Home & Trade').trim();
  const themeNormalized = normalizeEmailTheme(theme);
  const brand: EmailBrand = {
    businessName,
    accent: brandInput.accent || '#0284c7',
    logoUrl: brandInput.logoUrl || null,
    phone: brandInput.phone || '(555) 234-5678',
    siteUrl: brandInput.siteUrl || 'https://apexbuild.example.com',
    replyTo: brandInput.replyTo || 'owner@apexbuild.example.com',
    theme: themeNormalized,
    mailingAddress: brandInput.mailingAddress || '100 Industrial Parkway, Suite 4, Austin, TX 78701',
    licenseNumber: brandInput.licenseNumber || 'TACLA123456E',
    serviceArea: brandInput.serviceArea || 'Austin Metro & Surrounding Areas',
    senderName: brandInput.senderName || 'Alex Miller',
  };

  const from = contractorFrom(brand.businessName);
  const replyTo = brand.replyTo || 'hello@letsgetquoted.com';

  switch (kind) {
    case 'quote': {
      const subject = `Your quote #Q-2048 from ${brand.businessName}`;
      const preheader = `$3,850.00 · Quote #Q-2048 from ${brand.businessName}`;
      const html = renderClientQuoteEmailHtml({
        brand,
        recipientEmail: 'sarah.jenkins@example.com',
        businessName: brand.businessName,
        clientName: 'Sarah Jenkins',
        jobRef: '#Q-2048',
        quotedAmount: 3850,
        quoteUrl: 'https://letsgetquoted.com/client/quotes/sample-preview-token',
        includesScheduleOptions: true,
      });
      return {
        kind: 'quote',
        label: 'Quote',
        subject,
        preheader,
        from,
        replyTo,
        html,
      };
    }

    case 'invoice': {
      const subject = `Invoice INV-1092 from ${brand.businessName}`;
      const preheader = `$2,450.00 due by Oct 15, 2026 · Invoice INV-1092`;
      const html = generateInvoiceHtml({
        brand,
        businessName: brand.businessName,
        invoiceRef: 'INV-1092',
        clientName: 'Marcus Vance',
        jobRef: 'JOB-382',
        total: 2450,
        subtotal: 2450,
        taxAmount: 0,
        invoiceLink: 'https://letsgetquoted.com/client/invoices/sample-preview-token',
        items: [
          { description: 'Supply line relocation and rough-in valve installation', amount: 1200 },
          { description: 'Dual vanity fixture trim, drain assembly, and silicone sealing', amount: 950 },
          { description: 'Permit filing and pressure testing certification', amount: 300 },
        ],
      });
      return {
        kind: 'invoice',
        label: 'Invoice',
        subject,
        preheader,
        from,
        replyTo,
        html,
      };
    }

    case 'appointment': {
      const subject = `Reminder: your appointment with ${brand.businessName}`;
      const preheader = `Tomorrow, Oct 14 · 8:00 AM – 10:00 AM arrival window`;
      const html = renderAppointmentReminderEmailHtml({
        brand,
        clientName: 'David & Lisa Reynolds',
        businessName: brand.businessName,
        whenLabel: 'Tomorrow, Oct 14 between 8:00 AM – 10:00 AM',
        address: '4512 Oak Ridge Trail, Austin, TX 78749',
        serviceName: 'HVAC Seasonal Inspection & Filter Replacement',
        jobRef: '#JOB-884',
        notes: 'Our technician Dave will arrive in a company vehicle. Please ensure exterior side gate is unlocked.',
      });
      return {
        kind: 'appointment',
        label: 'Appointment reminder',
        subject,
        preheader,
        from,
        replyTo,
        html,
      };
    }

    case 'campaign': {
      const subject = 'Fall HVAC preparation & priority booking for existing clients';
      const body = `Hi neighbors,\n\nBefore cold weather arrives, we are opening our early-bird tune-up schedule for our repeat customers.\n\nA 45-minute heating check now prevents mid-winter emergency outages and keeps your manufacturer warranty active.\n\nReply directly to this email or visit our website to claim your preferred slot before our calendar fills.`;
      const preheader = 'Fall HVAC preparation & priority booking for existing clients';
      const footerHtml = `<p style="margin:12px 0 0;color:#6b7280;font-size:12px;line-height:1.6">${escapeHtml(brand.businessName)} · ${escapeHtml(brand.mailingAddress || '100 Industrial Parkway, Austin, TX')} · <a href="#" style="color:#6b7280">Unsubscribe</a></p>`;
      const html = renderBrandedEmail({
        brand,
        heading: subject,
        bodyHtml: campaignParagraphs(body),
        footerHtml,
      });
      return {
        kind: 'campaign',
        label: 'Campaign',
        subject,
        preheader,
        from,
        replyTo,
        html,
      };
    }

    case 'alert':
    default: {
      const subject = 'Action needed: Payout account verification required';
      const heading = 'Stripe requires updated business documentation';
      const preheader = subject;
      const html = renderContractorAlertEmailHtml({
        brand,
        subject,
        heading,
        bodyLines: [
          'Stripe has requested an updated certificate or ID to keep instant payouts active for your account.',
          'Please submit the required document within 48 hours to ensure upcoming client invoice payouts process without interruption.',
        ],
        ctaLabel: 'Review payout settings in dashboard',
        ctaUrl: 'https://letsgetquoted.com/dashboard/settings',
        tone: 'warning',
      });
      return {
        kind: 'alert',
        label: 'Contractor alert',
        subject,
        preheader,
        from: "Let's Get Quoted <hello@letsgetquoted.com>",
        replyTo: 'hello@letsgetquoted.com',
        html,
      };
    }
  }
}
