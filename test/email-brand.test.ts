import { describe, it, expect } from 'vitest';
import {
  EMAIL_THEMES,
  accessibleAccent,
  contractorFrom,
  contrastRatio,
  escapeHtml,
  normalizeEmailTheme,
  onAccent,
  relativeLuminance,
  renderBrandedEmail,
  safeAccent,
  themePaint,
  type EmailBrand,
} from '../src/emails/brand';
import {
  appointmentBlock,
  contactBlock,
  detailCard,
  moneySummary,
  statusBanner,
} from '../src/emails/primitives';
import { generateInvoiceHtml } from '../src/emails/InvoiceEmail';
import {
  renderAppointmentReminderEmailHtml,
  renderCampaignEmailHtml,
  renderClientQuoteEmailHtml,
  renderContractorAlertEmailHtml,
  renderDailyDigestEmailHtml,
} from '../src/lib/email';
import { loadEmailBrand, recommendEmailTheme } from '../src/lib/email-brand';
import {
  EMAIL_PREVIEW_TABS,
  renderSampleEmailPreviewSync,
} from '../src/lib/email-previews';
import type { DailyDigest } from '../src/lib/daily-digest';

const brand = (over: Partial<EmailBrand> = {}): EmailBrand => ({
  businessName: 'BrokePipes',
  accent: '#ff7a21',
  logoUrl: null,
  phone: '(248) 555-0100',
  siteUrl: 'https://thisisit.letsgetquoted.com',
  replyTo: 'brett@example.com',
  mailingAddress: '123 Main St, Austin, TX 78701',
  licenseNumber: 'TACLA998877',
  serviceArea: 'Greater Austin Area',
  senderName: 'Brett Owner',
  ...over,
});

describe('contractorFrom', () => {
  it('shows the contractor, sends from our verified domain', () => {
    expect(contractorFrom('BrokePipes')).toBe('BrokePipes <hello@letsgetquoted.com>');
  });

  it('strips characters that could split the header', () => {
    expect(contractorFrom('Bad" <evil@example.com>')).toBe('Bad evil@example.com <hello@letsgetquoted.com>');
    expect(contractorFrom('Line\r\nBreak')).toBe('LineBreak <hello@letsgetquoted.com>');
  });

  it('falls back to our own name rather than sending from an empty display name', () => {
    expect(contractorFrom('')).toBe("Let's Get Quoted <hello@letsgetquoted.com>");
    expect(contractorFrom('   ')).toBe("Let's Get Quoted <hello@letsgetquoted.com>");
  });
});

describe('accent handling & WCAG accessibility', () => {
  it('only paints with a real 6-digit hex', () => {
    expect(safeAccent('#ff7a21')).toBe('#ff7a21');
    expect(safeAccent('red')).toBe('#172033');
    expect(safeAccent('#fff')).toBe('#172033');
    expect(safeAccent(null)).toBe('#172033');
    expect(safeAccent('#fff;background:url(x)')).toBe('#172033');
  });

  it('calculates WCAG contrast ratios accurately', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
    expect(contrastRatio('#ffffff', '#ffffff')).toBe(1);
  });

  it('picks readable dark ink for orange #ff7a21 exceeding WCAG AA', () => {
    // #ff7a21 with white text is only 2.61:1 (fails AA).
    // With dark ink #1c2230 it achieves > 6:1 (passes AA & AAA).
    const textOnOrange = onAccent('#ff7a21');
    expect(textOnOrange).toBe('#1c2230');
    expect(contrastRatio('#ff7a21', textOnOrange)).toBeGreaterThan(4.5);
  });

  it('picks readable button text for pale and dark accents', () => {
    expect(onAccent('#ffe066')).toBe('#1c2230');
    expect(onAccent('#172033')).toBe('#ffffff');
  });

  it('derives accessibleAccent for small text against white backgrounds reaching at least 4.5:1', () => {
    const darkOrange = accessibleAccent('#ff7a21', '#ffffff', 4.5);
    expect(contrastRatio(darkOrange, '#ffffff')).toBeGreaterThanOrEqual(4.5);

    // Deep blue already passes and remains unchanged
    const navy = '#0f172a';
    expect(accessibleAccent(navy, '#ffffff', 4.5)).toBe(navy);
  });
});

describe('recommendEmailTheme ("Match my website")', () => {
  it('maps website templates to harmonious email themes', () => {
    expect(recommendEmailTheme('carbon')).toBe('blueprint');
    expect(recommendEmailTheme('reno')).toBe('blueprint');
    expect(recommendEmailTheme('professional')).toBe('letterhead');
    expect(recommendEmailTheme('coat')).toBe('letterhead');
    expect(recommendEmailTheme('handy')).toBe('neighborly');
    expect(recommendEmailTheme('fixit')).toBe('neighborly');
    expect(recommendEmailTheme('shine')).toBe('spotlight');
    expect(recommendEmailTheme('modern')).toBe('studio');
    expect(recommendEmailTheme(null)).toBe('studio');
    expect(recommendEmailTheme('unknown')).toBe('studio');
  });
});

describe('email primitives', () => {
  const paint = themePaint('studio', '#ff7a21');

  it('detailCard renders table-safe structure', () => {
    const html = detailCard(paint, '<p>Card content</p>', { title: 'Card Title' });
    expect(html).toContain('Card Title');
    expect(html).toContain('Card content');
    expect(html).not.toMatch(/display\s*:\s*flex/i);
  });

  it('moneySummary renders item rows and total callout', () => {
    const html = moneySummary(
      paint,
      [{ label: 'Rough-in plumbing', value: '$1,200.00' }],
      { label: 'Total Due', value: '$1,200.00' },
      { dueNotice: 'Due in 15 days' },
    );
    expect(html).toContain('Rough-in plumbing');
    expect(html).toContain('$1,200.00');
    expect(html).toContain('Total Due');
    expect(html).toContain('Due in 15 days');
    expect(html).not.toMatch(/display\s*:\s*flex/i);
  });

  it('appointmentBlock renders date, location, and service notes', () => {
    const html = appointmentBlock(paint, {
      whenLabel: 'Tomorrow at 9:00 AM',
      address: '100 Main St',
      serviceName: 'HVAC Inspection',
      rescheduleText: 'Reply to reschedule',
    });
    expect(html).toContain('Tomorrow at 9:00 AM');
    expect(html).toContain('100 Main St');
    expect(html).toContain('HVAC Inspection');
    expect(html).toContain('Reply to reschedule');
  });

  it('statusBanner renders info and warn styles', () => {
    const warnHtml = statusBanner(paint, { tone: 'warn', title: 'Action Needed', message: 'Update card' });
    expect(warnHtml).toContain('Action Needed');
    expect(warnHtml).toContain('Update card');

    const infoHtml = statusBanner(paint, { tone: 'info', title: 'Note', message: 'Test digest' });
    expect(infoHtml).toContain('Note');
  });

  it('contactBlock renders phone and reply prompt', () => {
    const html = contactBlock(paint, brand(), { prompt: 'Have a question?' });
    expect(html).toContain('Have a question?');
    expect(html).toContain('(248) 555-0100');
    expect(html).toContain('or reply to this email');
  });
});

describe('renderBrandedEmail', () => {
  it('carries the contractor, not us, through the body', () => {
    const html = renderBrandedEmail({ brand: brand(), heading: 'Your invoice is ready' });
    expect(html).toContain('BrokePipes');
    expect(html).toContain('#ff7a21');
    expect(html).toContain('Reply to this email to reach BrokePipes directly.');
    expect((html.match(/Let&#39;s Get Quoted/g) ?? []).length).toBe(1);
  });

  it('renders a white logo plate for raster logos', () => {
    const withLogo = renderBrandedEmail({
      brand: brand({ logoUrl: 'https://cdn.example.com/logo.png' }),
      heading: 'x',
    });
    expect(withLogo).toContain('<img src="https://cdn.example.com/logo.png"');
    // Check white plate container background
    expect(withLogo).toContain('background:#ffffff');
  });

  it('renders business metadata in the footer when provided', () => {
    const html = renderBrandedEmail({
      brand: brand(),
      heading: 'Welcome',
    });
    expect(html).toContain('123 Main St, Austin, TX 78701');
    expect(html).toContain('TACLA998877');
    expect(html).toContain('Greater Austin Area');
  });

  it('never lays out with flexbox', () => {
    const html = renderBrandedEmail({ brand: brand(), heading: 'x', cta: { label: 'View', url: 'https://x.test' } });
    expect(html).not.toContain('display:flex');
    expect(html).not.toContain('display: flex');
  });

  it('escapes contractor and customer text', () => {
    const html = renderBrandedEmail({
      brand: brand({ businessName: 'Bob <script>alert(1)</script>' }),
      heading: 'Hi "Dana" & co',
      paragraphs: ['5 > 3 & rising'],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('5 &gt; 3 &amp; rising');
  });

  it('renders all five choices through the same email-safe shell', () => {
    const documents = EMAIL_THEMES.map((theme) => renderBrandedEmail({
      brand: brand({ theme: theme.id }),
      heading: 'Your quote is ready',
      cta: { label: 'View quote', url: 'https://example.test/quote' },
    }));

    expect(documents).toHaveLength(5);
    expect(new Set(documents).size).toBe(5);
    for (const html of documents) {
      expect(html).toContain('BrokePipes');
      expect(html).toContain('View quote');
      expect(html).not.toMatch(/display\s*:\s*flex/i);
      expect(html.trimEnd().endsWith('</html>')).toBe(true);
    }
  });
});

describe('Production email renderers across scenarios', () => {
  it('renderClientQuoteEmailHtml renders quote details and contact callout', () => {
    const html = renderClientQuoteEmailHtml({
      brand: brand(),
      recipientEmail: 'client@example.com',
      businessName: 'BrokePipes',
      clientName: 'Sarah Jenkins',
      jobRef: '#Q-100',
      quotedAmount: 1850,
      quoteUrl: 'https://letsgetquoted.com/quotes/token',
      includesScheduleOptions: true,
    });
    expect(html).toContain('Sarah Jenkins, here is your quote');
    expect(html).toContain('$1,850.00');
    expect(html).toContain('View &amp; approve your quote');
    expect(html).toContain('Questions about quote #Q-100?');
  });

  it('generateInvoiceHtml renders invoice breakdown and payment CTA', () => {
    const html = generateInvoiceHtml({
      brand: brand(),
      businessName: 'BrokePipes',
      invoiceRef: 'INV-500',
      clientName: 'Tom Vance',
      jobRef: 'JOB-201',
      total: 950,
      subtotal: 950,
      taxAmount: 0,
      invoiceLink: 'https://letsgetquoted.com/invoices/token',
      items: [{ description: 'Tankless unit install', amount: 950 }],
    });
    expect(html).toContain('Invoice INV-500');
    expect(html).toContain('$950.00');
    expect(html).toContain('Tankless unit install');
    expect(html).toContain('View &amp; pay invoice');
  });

  it('renderAppointmentReminderEmailHtml renders visit details', () => {
    const html = renderAppointmentReminderEmailHtml({
      brand: brand(),
      clientName: 'Tom Vance',
      businessName: 'BrokePipes',
      whenLabel: 'Tomorrow at 10:00 AM',
      address: '742 Evergreen Terr',
      serviceName: 'Pipe Repair',
    });
    expect(html).toContain('Tom Vance, your appointment is coming up');
    expect(html).toContain('Tomorrow at 10:00 AM');
    expect(html).toContain('742 Evergreen Terr');
  });

  it('renderContractorAlertEmailHtml renders warning banner and action CTA', () => {
    const html = renderContractorAlertEmailHtml({
      brand: brand(),
      subject: 'Urgent: Payout issue',
      heading: 'Action required on your account',
      bodyLines: ['Please verify your bank details.', 'Next deposit is pending.'],
      ctaLabel: 'Open Settings',
      ctaUrl: 'https://letsgetquoted.com/dashboard/settings',
      tone: 'warning',
    });
    expect(html).toContain('Action Needed');
    expect(html).toContain('Action required on your account');
    expect(html).toContain('Open Settings');
  });
});

describe('renderSampleEmailPreviewSync (all 5 themes x 5 preview tabs = 25 scenarios)', () => {
  it('renders all 25 preview permutations without crashing', () => {
    for (const theme of EMAIL_THEMES) {
      for (const tab of EMAIL_PREVIEW_TABS) {
        const preview = renderSampleEmailPreviewSync(theme.id, tab.id, brand());
        expect(preview.subject).toBeTruthy();
        expect(preview.preheader).toBeTruthy();
        if (tab.id !== 'alert') {
          expect(preview.from).toContain('BrokePipes');
        } else {
          expect(preview.from).toContain("Let's Get Quoted");
        }
        expect(preview.html).toContain('BrokePipes');
        expect(preview.html.startsWith('<!DOCTYPE html>')).toBe(true);
        expect(preview.html.trimEnd().endsWith('</html>')).toBe(true);
      }
    }
  });
});

describe('loadEmailBrand replyTo resolution hierarchy', () => {
  function makeMockSupabase(tables: {
    site?: any;
    account?: any;
    ownerId?: string | null;
    ownerUser?: any;
  }) {
    return {
      from: (table: string) => {
        let result: any = null;
        if (table === 'sites') result = tables.site ?? { company_name: 'Test Contractor' };
        if (table === 'accounts') result = tables.account ?? { mailing_address: '123 St', reply_to_email: null };
        if (table === 'memberships') result = tables.ownerId ? { user_id: tables.ownerId } : null;

        const chain: any = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({ data: result }),
        };
        return chain;
      },
      auth: {
        admin: {
          getUserById: async (id: string) => ({
            data: tables.ownerUser ?? (tables.ownerId ? { user: { email: 'login.owner@example.com' } } : null),
          }),
        },
      },
    } as any;
  }

  it('prioritizes accounts.reply_to_email when set', async () => {
    const mockSupabase = makeMockSupabase({
      account: { mailing_address: '123 St', reply_to_email: 'custom.office@plumber.com' },
      ownerId: 'user-123',
      ownerUser: { user: { email: 'login.owner@example.com' } },
    });

    const res = await loadEmailBrand('acc-1', 'Fallback', mockSupabase);
    expect(res.replyTo).toBe('custom.office@plumber.com');
  });

  it('falls back to owner auth email when accounts.reply_to_email is empty', async () => {
    const mockSupabase = makeMockSupabase({
      account: { mailing_address: '123 St', reply_to_email: null },
      ownerId: 'user-123',
      ownerUser: {
        user: { email: 'login.owner@example.com', user_metadata: { full_name: 'Bob Boss' } },
      },
    });

    const res = await loadEmailBrand('acc-1', 'Fallback', mockSupabase);
    expect(res.replyTo).toBe('login.owner@example.com');
    expect(res.senderName).toBe('Bob Boss');
  });

  it('degrades to null when neither reply_to_email nor owner auth email is found', async () => {
    const mockSupabase = makeMockSupabase({
      account: null,
      ownerId: null,
      ownerUser: null,
    });

    const res = await loadEmailBrand('acc-1', 'Fallback', mockSupabase);
    expect(res.replyTo).toBeNull();
  });
});
