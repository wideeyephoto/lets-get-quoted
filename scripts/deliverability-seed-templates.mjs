import { generateInvoicePdf } from '../src/emails/InvoicePdf.ts';
import { generateInvoiceHtml } from '../src/emails/InvoiceEmail.tsx';
import { renderClientQuoteEmailHtml } from '../src/emails/renderers.ts';
import { renderBrandedEmail, contractorFrom, FONT_STACK } from '../src/emails/brand.ts';
import { APP_ORIGIN } from '../src/lib/app-origin.ts';

function labelSample(html) {
  return html.replace('</body>', '<p>Seed sample only: no payment is due; links are synthetic and nonfunctional.</p></body>');
}

export async function renderMagicLinkTest(recipientEmail) {
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
    preheader: 'Seed Test: Synthetic login template for receiver inspection',
    eyebrow: 'Contractor Login • Seed Audit',
    heading: 'Sign in to your workspace',
    paragraphs: [
      'This is a controlled deliverability seed test for Let\'s Get Quoted.',
      'This is a rendering sample. Its synthetic link cannot sign you in. Inspect actual receiver headers separately.',
    ],
    cta: {
      label: 'Sign in to your dashboard',
      url: verifyUrl,
    },
    footerHtml: `<p style="margin:10px 0 0;font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:#64748b">This synthetic link is nonfunctional. Controlled audit timestamp: ${new Date().toISOString()}</p>`,
  });


  return {
    from: "Let's Get Quoted <hello@letsgetquoted.com>",
    to: recipientEmail,
    subject: "Your magic link to Let's Get Quoted (Seed Test)",
    html: labelSample(html),
    tags: [
      { name: 'kind', value: 'magic_link' },
      { name: 'seed_test', value: 'true' },
    ],
  };
}

export async function renderQuoteTest(recipientEmail) {
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


  return {
    from: contractorFrom(businessName),
    to: recipientEmail,
    subject: `Your quote ${jobRef} from ${businessName} (Seed Test)`,
    html: labelSample(html),
    reply_to: 'hello@letsgetquoted.com',
    tags: [
      { name: 'kind', value: 'client_quote' },
      { name: 'seed_test', value: 'true' },
    ],
  };
}

export async function renderInvoicePdfTest(recipientEmail) {
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


  return {
    from: contractorFrom(businessName),
    to: recipientEmail,
    subject: `Invoice ${invoiceRef} from ${businessName} (Seed Test w/ PDF)`,
    html: labelSample(emailHtml),
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
  };
}


