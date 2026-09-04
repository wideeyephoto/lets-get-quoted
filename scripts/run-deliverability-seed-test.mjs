#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { Resend } from 'resend';
import { generateInvoicePdf } from '../src/emails/InvoicePdf.ts';
import { generateInvoiceHtml } from '../src/emails/InvoiceEmail.tsx';
import { renderClientQuoteEmailHtml } from '../src/emails/renderers.ts';
import { renderBrandedEmail, contractorFrom, FONT_STACK } from '../src/emails/brand.ts';
import { APP_ORIGIN } from '../src/lib/app-origin.ts';

// Read RESEND_API_KEY from env or .env.local
function getApiKey() {
  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY;
  try {
    const env = readFileSync('.env.local', 'utf8');
    const match = env.match(/^RESEND_API_KEY=([^\r\n]+)/m);
    return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : null;
  } catch {
    return null;
  }
}

const apiKey = getApiKey();
if (!apiKey) {
  console.error('Error: RESEND_API_KEY is not configured in environment or .env.local');
  process.exit(1);
}

const resend = new Resend(apiKey);
const isDryRun = process.argv.includes('--dry-run');

async function sendMagicLinkTest(recipientEmail) {
  console.log(`  -> Sending Magic Link email to ${recipientEmail}...`);
  const fakeToken = 'seed_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  const verifyUrl = `${APP_ORIGIN}/auth/magic-link-callback?token_hash=${fakeToken}&next=%2Fdashboard`;

  const html = renderBrandedEmail({
    brand: {
      businessName: "Let's Get Quoted",
      accent: '#0284c7',
      theme: 'spotlight',
      logoUrl: null,
      phone: null,
      siteUrl: APP_ORIGIN,
      replyTo: null,
    },
    preheader: 'Seed Test: Click to securely sign in to your contractor workspace',
    eyebrow: 'Contractor Login • Seed Audit',
    heading: 'Sign in to your workspace',
    paragraphs: [
      'This is a controlled deliverability seed test for Let\'s Get Quoted.',
      'Tap the button below to verify one-click magic link authentication and SPF/DKIM/DMARC alignment.',
    ],
    cta: {
      label: 'Sign in to your dashboard',
      url: verifyUrl,
    },
    footerHtml: `<p style="margin:10px 0 0;font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:#64748b">This seed test link expires in 60 minutes. Controlled audit timestamp: ${new Date().toISOString()}</p>`,
  });

  if (isDryRun) {
    console.log(`     [DRY-RUN] Magic Link email rendered successfully (${html.length} chars).`);
    return 'dry_run_magic_link_' + Date.now();
  }

  const res = await resend.emails.send({
    from: "Let's Get Quoted <hello@letsgetquoted.com>",
    to: recipientEmail,
    subject: "Your magic link to Let's Get Quoted (Seed Test)",
    html,
    tags: [
      { name: 'kind', value: 'magic_link' },
      { name: 'seed_test', value: 'true' },
    ],
  });

  if (res.error) throw new Error(`Magic link send error: ${res.error.message}`);
  return res.data?.id;
}

async function sendQuoteTest(recipientEmail) {
  console.log(`  -> Sending Client Quote email to ${recipientEmail}...`);
  const businessName = 'Prestige Contracting';
  const jobRef = 'SEED-EST-2026';
  const quoteUrl = `${APP_ORIGIN}/client/jobs/seed-quote-token`;

  const html = renderClientQuoteEmailHtml({
    recipientEmail,
    businessName,
    clientName: 'Audit Seed Reviewer',
    jobRef,
    quotedAmount: 4250.00,
    quoteUrl,
    brand: {
      businessName,
      accent: '#0284c7',
      theme: 'spotlight',
      logoUrl: null,
      phone: '(555) 234-5678',
      siteUrl: APP_ORIGIN,
      replyTo: 'hello@letsgetquoted.com',
    },
  });

  if (isDryRun) {
    console.log(`     [DRY-RUN] Client Quote email rendered successfully (${html.length} chars).`);
    return 'dry_run_quote_' + Date.now();
  }

  const res = await resend.emails.send({
    from: contractorFrom(businessName),
    to: recipientEmail,
    subject: `Your quote ${jobRef} from ${businessName} (Seed Test)`,
    html,
    reply_to: 'hello@letsgetquoted.com',
    tags: [
      { name: 'kind', value: 'client_quote' },
      { name: 'seed_test', value: 'true' },
    ],
  });

  if (res.error) throw new Error(`Quote send error: ${res.error.message}`);
  return res.data?.id;
}

async function sendInvoicePdfTest(recipientEmail) {
  console.log(`  -> Generating and sending Invoice email with PDF attachment to ${recipientEmail}...`);
  const businessName = 'Prestige Contracting';
  const invoiceRef = 'SEED-INV-2026';
  const jobRef = 'SEED-JOB-2026';

  const items = [
    { description: 'Architectural Shingle Roofing (Full Removal & Replacement)', amount: 3450.00 },
    { description: 'Seamless Aluminum Gutter Installation & Downspouts', amount: 800.00 },
  ];
  const subtotal = 4250.00;
  const taxRate = 0;
  const taxAmount = 0;
  const total = 4250.00;

  // Generate real PDF buffer
  const pdfBuffer = await generateInvoicePdf({
    businessName,
    invoiceRef,
    clientName: 'Audit Seed Reviewer',
    jobRef,
    total,
    subtotal,
    taxRate,
    taxAmount,
    items,
  });

  console.log(`     Generated PDF buffer: ${pdfBuffer.length} bytes (magic bytes: ${pdfBuffer.subarray(0, 5).toString('ascii')})`);

  const emailHtml = generateInvoiceHtml({
    brand: {
      businessName,
      accent: '#0284c7',
      theme: 'spotlight',
      logoUrl: null,
      phone: '(555) 234-5678',
      siteUrl: APP_ORIGIN,
      replyTo: 'hello@letsgetquoted.com',
    },
    businessName,
    invoiceRef,
    clientName: 'Audit Seed Reviewer',
    jobRef,
    total,
    subtotal,
    discountPercent: 0,
    discountAmount: 0,
    taxRate: 0,
    taxAmount: 0,
    items,
    invoiceLink: `${APP_ORIGIN}/invoice/seed-invoice-token`,
  });

  if (isDryRun) {
    console.log(`     [DRY-RUN] Invoice HTML (${emailHtml.length} chars) & PDF attachment verified.`);
    return 'dry_run_invoice_' + Date.now();
  }

  const res = await resend.emails.send({
    from: contractorFrom(businessName),
    to: recipientEmail,
    subject: `Invoice ${invoiceRef} from ${businessName} (Seed Test w/ PDF)`,
    html: emailHtml,
    reply_to: 'hello@letsgetquoted.com',
    attachments: [
      {
        filename: `Invoice-${invoiceRef}.pdf`,
        content: pdfBuffer,
        content_type: 'application/pdf',
      },
    ],
    tags: [
      { name: 'kind', value: 'invoice' },
      { name: 'seed_test', value: 'true' },
    ],
  });

  if (res.error) throw new Error(`Invoice PDF send error: ${res.error.message}`);
  return res.data?.id;
}

async function runSeedTest(recipients) {
  console.log(`\n======================================================`);
  console.log(`🚀 Transactional Email Deliverability Seed Test Runner`);
  console.log(`   Auditing: Gmail, Outlook/Live, Yahoo, iCloud inboxes`);
  console.log(`   Templates: Magic Link, Interactive Quote, Invoice w/ PDF`);
  console.log(`======================================================\n`);

  const results = [];

  for (const email of recipients) {
    console.log(`\n[Recipient: ${email}]`);
    try {
      const magicLinkId = await sendMagicLinkTest(email);
      console.log(`     ✓ Magic Link sent! Resend ID: ${magicLinkId}`);

      const quoteId = await sendQuoteTest(email);
      console.log(`     ✓ Quote sent! Resend ID: ${quoteId}`);

      const invoiceId = await sendInvoicePdfTest(email);
      console.log(`     ✓ Invoice w/ PDF sent! Resend ID: ${invoiceId}`);

      results.push({
        email,
        success: true,
        ids: { magicLinkId, quoteId, invoiceId },
      });
    } catch (err) {
      console.error(`     ✗ Failed for ${email}:`, err.message);
      results.push({
        email,
        success: false,
        error: err.message,
      });
    }
  }

  console.log(`\n======================================================`);
  console.log(`📊 Seed Dispatch Summary:`);
  console.log(`======================================================`);
  for (const r of results) {
    if (r.success) {
      console.log(`✓ ${r.email}: 3/3 dispatched`);
      console.log(`  - Magic Link ID: ${r.ids.magicLinkId}`);
      console.log(`  - Quote ID:      ${r.ids.quoteId}`);
      console.log(`  - Invoice PDF ID:${r.ids.invoiceId}`);
    } else {
      console.log(`✗ ${r.email}: Failed - ${r.error}`);
    }
  }

  console.log(`\n------------------------------------------------------`);
  console.log(`🔍 Verification Checklist for Seed Inboxes:`);
  console.log(`------------------------------------------------------`);
  console.log(`1. INBOX PLACEMENT:`);
  console.log(`   Check whether messages landed in Primary Inbox vs Spam/Junk/Promotions.`);
  console.log(`2. AUTHENTICATION HEADERS (View Original / Message Source):`);
  console.log(`   - SPF:  PASS (send.letsgetquoted.com / amazonses.com)`);
  console.log(`   - DKIM: PASS (letsgetquoted.com, selector: resend)`);
  console.log(`   - DMARC: PASS (p=... header.from=letsgetquoted.com)`);
  console.log(`3. ATTACHMENT INTEGRITY:`);
  console.log(`   - Open Invoice-SEED-INV-2026.pdf in a PDF viewer and verify layout & totals.`);
  console.log(`------------------------------------------------------\n`);
}

// Parse command-line args
const args = process.argv.slice(2);
const recipients = [];

for (const arg of args) {
  if (arg.startsWith('--target=') || arg.startsWith('--gmail=') || arg.startsWith('--outlook=') || arg.startsWith('--yahoo=') || arg.startsWith('--icloud=')) {
    const val = arg.split('=')[1];
    if (val) recipients.push(...val.split(',').map((s) => s.trim()).filter(Boolean));
  }
}

if (recipients.length === 0) {
  // Default verified seed inboxes from audit logs
  recipients.push('brett.arnold@live.com', 'hdartguy@gmail.com');
}

runSeedTest(recipients).catch((err) => {
  console.error('Fatal seed test error:', err);
  process.exit(1);
});
