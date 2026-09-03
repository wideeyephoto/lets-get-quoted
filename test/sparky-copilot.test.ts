import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

// Mock dependencies for server action testing
vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(),
  })),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitStrict: vi.fn(async () => true),
  clientIpFrom: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/support-cases', () => ({
  createSupportCase: vi.fn(async (_admin, _submitter, input) => ({
    id: 'test-case-uuid-12345',
    ...input,
  })),
  addSupportCaseNote: vi.fn(async () => ({
    id: 'test-note-uuid-12345',
  })),
}));

vi.mock('@/lib/email', () => ({
  sendContactMessageEmail: vi.fn(async () => {}),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'x-forwarded-for': '127.0.0.1' })),
}));

describe('Sparky Copilot Public-Facing Integration', () => {
  it('verifies SparkyCopilot component exists and includes the required greeting', () => {
    expect(existsSync('src/components/marketing/SparkyCopilot.tsx')).toBe(true);
    const src = readFileSync('src/components/marketing/SparkyCopilot.tsx', 'utf8');
    expect(src).toContain("Hi! I&apos;m Sparky, your 24/7 AI contractor copilot. What can I help you with today?");
    expect(src).toContain('Ask Sparky');
    expect(src).toContain('Quick Questions');
  });

  it('verifies SparkyCopilot includes curated 3 quick questions for key pages', () => {
    const src = readFileSync('src/components/marketing/SparkyCopilot.tsx', 'utf8');
    // Pricing questions
    expect(src).toContain('How does the $0/month Flex plan work?');
    expect(src).toContain('Are there any hidden fees or contracts?');
    expect(src).toContain('How fast do customer payments reach my bank?');

    // Compare questions
    expect(src).toContain('How hard is it to switch from Jobber or Housecall Pro?');
    expect(src).toContain('Can you import my existing clients and price book?');
    expect(src).toContain('Why don’t you charge per-user monthly subscriptions?');

    // AI & Text-to-job questions
    expect(src).toContain('How does the Walk-Up Estimate Brain Dump work?');
    expect(src).toContain('How does photo OCR equipment estimating work?');
    expect(src).toContain('What happens when a customer calls my business number?');

    // Homepage overview
    expect(src).toContain('How do instant quotes and online deposits work?');
    expect(src).toContain('How much does Let’s Get Quoted cost?');
    expect(src).toContain('How does the free contractor website work?');
  });

  it('verifies AppShell mounts SparkyCopilot on all public-facing pages', () => {
    const appShellSrc = readFileSync('src/components/app-shell.tsx', 'utf8');
    expect(appShellSrc).toContain("import SparkyCopilot from '@/components/marketing/SparkyCopilot';");
    expect(appShellSrc).toContain('<SparkyCopilot />');
    // Verifies it is in own-chrome marketing routes and demo routes
    expect(appShellSrc).toMatch(/isOwnChromeMarketing[\s\S]*?<SparkyCopilot \/>/);
    expect(appShellSrc).toMatch(/pathname\.startsWith\('\/demo'\)[\s\S]*?<SparkyCopilot \/>/);
  });

  it('verifies SparkyCopilot is strictly absent from homeowner/client-facing pages', () => {
    const appShellSrc = readFileSync('src/components/app-shell.tsx', 'utf8');
    // Standalone contractor site early return has no Sparky
    const standaloneMatch = appShellSrc.match(/if \(isStandaloneSite\) \{[\s\S]*?return <>{children}<\/>;[\s\S]*?\}/);
    expect(standaloneMatch).not.toBeNull();
    expect(standaloneMatch![0]).not.toContain('SparkyCopilot');

    // Homeowner booking early return has no Sparky
    const bookingMatch = appShellSrc.match(/if \(pathname\.startsWith\('\/book\/'\)\) \{[\s\S]*?return <>{children}<\/>;[\s\S]*?\}/);
    expect(bookingMatch).not.toBeNull();
    expect(bookingMatch![0]).not.toContain('SparkyCopilot');

    // Homeowner branded pages (portal, invoice, pay) have bare shell with no Sparky
    const homeownerMatch = appShellSrc.match(/if \(isHomeownerBranded\) \{[\s\S]*?return <div className="chrome-shell chrome-shell-bare">\{children\}<\/div>;[\s\S]*?\}/);
    expect(homeownerMatch).not.toBeNull();
    expect(homeownerMatch![0]).not.toContain('SparkyCopilot');

    // Dashboard routes exclude SparkyCopilot in public shell fallback
    expect(appShellSrc).toContain("!pathname.startsWith('/dashboard') && <SparkyCopilot />");
    const sparkySrc = readFileSync('src/components/marketing/SparkyCopilot.tsx', 'utf8');
    expect(sparkySrc).toContain("if (pathname?.startsWith('/dashboard')) return null;");
  });

  it('verifies duplicate widgets are removed from SiteFooter and site-chrome', () => {
    const siteFooterSrc = readFileSync('src/components/site-footer.tsx', 'utf8');
    expect(siteFooterSrc).not.toContain('<MarketingAiAssistant');

    const flagshipChromeSrc = readFileSync('src/components/flagship/site-chrome.tsx', 'utf8');
    expect(flagshipChromeSrc).not.toContain('<MarketingAiAssistant');
  });


  it('verifies mobile styling positions Sparky cleanly above sticky bottom action bar', () => {
    const cssSrc = readFileSync('src/components/marketing/sparky-copilot.module.css', 'utf8');
    expect(cssSrc).toContain('bottom: 76px;');
    expect(cssSrc).toContain('right: 16px;');
    expect(cssSrc).toContain('z-index: 995;');
  });
});

describe('submitSparkySupportTicket Server Action', () => {
  let submitSparkySupportTicket: typeof import('@/app/actions/sparky-ticket').submitSparkySupportTicket;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('@/app/actions/sparky-ticket');
    submitSparkySupportTicket = mod.submitSparkySupportTicket;
  });

  it('validates required fields', async () => {
    const res1 = await submitSparkySupportTicket({ name: '', email: 'test@example.com', message: 'Help me' });
    expect(res1.ok).toBe(false);
    expect(res1.error).toContain('Please provide your name');

    const res2 = await submitSparkySupportTicket({ name: 'John', email: '', message: 'Help me' });
    expect(res2.ok).toBe(false);
    expect(res2.error).toContain('Please provide your name');

    const res3 = await submitSparkySupportTicket({ name: 'John', email: 'test@example.com', message: '' });
    expect(res3.ok).toBe(false);
    expect(res3.error).toContain('Please provide your name');
  });

  it('validates email format', async () => {
    const res = await submitSparkySupportTicket({ name: 'John', email: 'not-an-email', message: 'Help me' });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('valid email address');
  });

  it('silently drops honeypot bots without errors', async () => {
    const res = await submitSparkySupportTicket({
      name: 'Bot',
      email: 'bot@spam.com',
      message: 'Buy cheap watches',
      company: 'SpamCorp LLC',
    });
    expect(res.ok).toBe(true);
    expect(res.caseId).toBe('ignored');
  });

  it('successfully creates a support case for valid user requests', async () => {
    const res = await submitSparkySupportTicket({
      name: 'Dave Miller',
      email: 'dave@millerroofing.com',
      phone: '(555) 234-5678',
      message: 'Can I connect multiple bank accounts for different crew divisions?',
      pageUrl: 'https://letsgetquoted.com/pricing',
      questionContext: 'How does the $0/month Flex plan work?',
    });

    expect(res.ok).toBe(true);
    expect(res.caseId).toBe('test-case-uuid-12345');
  });
});
