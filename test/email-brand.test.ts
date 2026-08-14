import { describe, it, expect } from 'vitest';
import {
  EMAIL_THEMES,
  contractorFrom,
  escapeHtml,
  normalizeEmailTheme,
  onAccent,
  renderBrandedEmail,
  safeAccent,
  type EmailBrand,
} from '../src/emails/brand';
import { renderDailyDigestEmailHtml } from '../src/lib/email';
import type { DailyDigest } from '../src/lib/daily-digest';

const brand = (over: Partial<EmailBrand> = {}): EmailBrand => ({
  businessName: 'BrokePipes',
  accent: '#ff7a21',
  logoUrl: null,
  phone: '(248) 555-0100',
  siteUrl: 'https://thisisit.letsgetquoted.com',
  replyTo: 'brett@example.com',
  ...over,
});

describe('contractorFrom', () => {
  it('shows the contractor, sends from our verified domain', () => {
    // The display name is theirs; the address stays ours because that is what
    // SPF and DKIM sign. Sending as their own domain would fail auth.
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

describe('accent handling', () => {
  it('only paints with a real 6-digit hex', () => {
    expect(safeAccent('#ff7a21')).toBe('#ff7a21');
    expect(safeAccent('red')).toBe('#172033');
    expect(safeAccent('#fff')).toBe('#172033');
    expect(safeAccent(null)).toBe('#172033');
    // Would otherwise emit garbage straight into a style attribute.
    expect(safeAccent('#fff;background:url(x)')).toBe('#172033');
  });

  it('picks readable button text for pale and dark accents', () => {
    // A contractor who picks pale yellow must not get white-on-yellow.
    expect(onAccent('#ffe066')).toBe('#1c2230');
    expect(onAccent('#172033')).toBe('#ffffff');
  });
});

describe('renderBrandedEmail', () => {
  it('carries the contractor, not us, through the body', () => {
    const html = renderBrandedEmail({ brand: brand(), heading: 'Your invoice is ready' });
    expect(html).toContain('BrokePipes');
    expect(html).toContain('#ff7a21');
    expect(html).toContain('Reply to this email to reach BrokePipes directly.');
    // One small attribution line is fine; the email must not read as ours.
    expect((html.match(/Let&#39;s Get Quoted/g) ?? []).length).toBe(1);
  });

  it('identifies account email as sent by Let\'s Get Quoted for the business', () => {
    const html = renderBrandedEmail({
      brand: brand(),
      audience: 'account',
      heading: 'Your business today',
    });
    expect(html).toContain('For BrokePipes');
    expect(html).toContain('sent by Let&#39;s Get Quoted');
    expect(html).toContain('Reply to this email to reach Let&#39;s Get Quoted.');
    expect(html).not.toContain('Sent by BrokePipes');
    expect(html).not.toContain('reach BrokePipes directly');
  });

  it('can accurately describe an account email with a direct customer reply', () => {
    const html = renderBrandedEmail({
      brand: brand(),
      audience: 'account',
      heading: 'Dana requested a quote',
      accountReplyText: 'Reply to this email to contact Dana directly.',
    });
    expect(html).toContain('Reply to this email to contact Dana directly.');
    expect(html).not.toContain('reach Let&#39;s Get Quoted');
  });

  it('uses a hosted logo when there is one, a wordmark when there is not', () => {
    expect(renderBrandedEmail({ brand: brand(), heading: 'x' })).toContain('>BrokePipes<');
    const withLogo = renderBrandedEmail({ brand: brand({ logoUrl: 'https://cdn.example.com/logo.png' }), heading: 'x' });
    expect(withLogo).toContain('<img src="https://cdn.example.com/logo.png"');
  });

  it('never lays out with flexbox', () => {
    // Outlook renders through Word and ignores flex outright — the old invoice
    // email used display:flex for its totals, so they collapsed there.
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

  it('includes a preheader so the preview is not just the business name again', () => {
    const html = renderBrandedEmail({ brand: brand(), heading: 'x', preheader: 'Invoice INV-1042 for $450' });
    expect(html).toContain('Invoice INV-1042 for $450');
    expect(html).toMatch(/display:none;font-size:1px/);
  });

  it('omits contact details it does not have', () => {
    const html = renderBrandedEmail({ brand: brand({ phone: null, siteUrl: null }), heading: 'x' });
    expect(html).not.toContain('tel:');
    expect(html).toContain('Sent by BrokePipes');
  });

  it('is a complete document', () => {
    const html = renderBrandedEmail({ brand: brand(), heading: 'x' });
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
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

  it('falls unknown and legacy theme values back to Studio', () => {
    expect(normalizeEmailTheme('blueprint')).toBe('blueprint');
    expect(normalizeEmailTheme('made-up')).toBe('studio');
    expect(normalizeEmailTheme(null)).toBe('studio');
    const legacy = renderBrandedEmail({ brand: brand(), heading: 'x' });
    const explicit = renderBrandedEmail({ brand: brand({ theme: 'studio' }), heading: 'x' });
    expect(legacy).toBe(explicit);
  });
});

describe('renderDailyDigestEmailHtml', () => {
  const digest: DailyDigest = {
    dateLabel: 'Friday, August 14',
    hasSignal: true,
    moneyInCount: 2,
    moneyInTotal: 125000,
    openRequestsCount: 3,
    openRequestsTotal: 4630000,
    failedCount: 1,
    failedTotal: 27500,
    newLeads: 4,
    quotesApproved: 2,
    confirmations: 3,
    newReviews: 1,
    newReviewsAvg: 5,
    privateFeedback: 1,
    todaysJobs: [{ clientName: 'Preston Voss', time: '11:45 AM', ref: 'JOB-29' }],
    todaysJobsCount: 1,
    rebookDue: 10,
    payday: null,
    cash: null,
    selections: { jobs: 2, overdue: 1 },
  };

  it('renders the owner digest through every selected theme', () => {
    const documents = EMAIL_THEMES.map((theme) => renderDailyDigestEmailHtml({
      brand: brand({ theme: theme.id }),
      businessName: 'BrokePipes',
      digest,
      dashboardUrl: 'https://app.example.test/dashboard',
      manageUrl: 'https://app.example.test/dashboard/automations#daily-digest',
    }));

    expect(documents).toHaveLength(5);
    expect(new Set(documents).size).toBe(5);
    for (const html of documents) {
      expect(html).toContain('Your business today');
      expect(html).toContain('Preston Voss');
      expect(html).toContain('Awaiting payment');
      expect(html).toContain('For BrokePipes');
      expect(html).toContain('sent by Let&#39;s Get Quoted');
      expect(html).not.toMatch(/display\s*:\s*flex/i);
      expect(html.trimEnd().endsWith('</html>')).toBe(true);
    }
  });
});

describe('escapeHtml', () => {
  it('handles the characters that break an attribute', () => {
    expect(escapeHtml(`<a href="x" onmouseover='y'>&`)).toBe('&lt;a href=&quot;x&quot; onmouseover=&#39;y&#39;&gt;&amp;');
    expect(escapeHtml(null)).toBe('');
  });
});
