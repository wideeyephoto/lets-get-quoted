import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COMPARISONS } from '@/app/compare/compare-data';
import { parsePlanIntent, welcomePathWithPlanIntent } from '@/lib/plan-intent';
import { BILLING_PLANS, platformFeePercent } from '@/lib/billing/catalog';

function read(...segments: string[]) {
  return readFileSync(resolve(process.cwd(), ...segments), 'utf8');
}

describe('P1: Marketing AI Assistant Pricing & Volume Matcher', () => {
  const assistantCode = read('src', 'components', 'marketing', 'MarketingAiAssistant.tsx');

  it('contains no references to obsolete Pro ($89/mo) plan', () => {
    expect(assistantCode).not.toContain('$89/mo');
    expect(assistantCode).not.toContain('0.45%');
    expect(assistantCode).not.toContain("name: 'Pro'");
  });

  it('recommends Solo ($39/mo + 0.50%) at the default $20k volume', () => {
    expect(assistantCode).toContain("name: 'Solo'");
    expect(assistantCode).toContain('$39/mo + 0.50%');
    expect(assistantCode).toContain("name: 'Growth'");
    expect(assistantCode).toContain('$129/mo + 0.25%');
    expect(assistantCode).toContain("name: 'Scale'");
    expect(assistantCode).toContain('$329/mo + 0.10%');
  });

  it('includes Solo, Growth, and Scale in the Flex FAQ explanation', () => {
    expect(assistantCode).toContain('Upgrading to Solo ($39/mo), Growth ($129/mo), or Scale ($329/mo)');
  });
});

describe('P1 & P2: Signup Personalization & Plan Intent Handoff', () => {
  const loginCode = read('src', 'app', 'login', 'page.tsx');
  const welcomeCode = read('src', 'app', 'welcome', 'page.tsx');
  const welcomeFormCode = read('src', 'app', 'welcome', 'WelcomeForm.tsx');

  it('login page parses trade and city parameters and carries them into nextPath', () => {
    expect(loginCode).toContain("searchParams.get('trade')");
    expect(loginCode).toContain("searchParams.get('city')");
    expect(loginCode).toContain('welcomePathWithPlanIntent');
  });

  it('login page displays selected plan confirmation on signup', () => {
    expect(loginCode).toContain('selectedPlan');
    expect(loginCode).toContain('Sign up with ${selectedPlan.name}');
    expect(loginCode).toContain('Continue with ${selectedPlan.name}');
  });

  it('welcome page accepts trade, city, and plan params', () => {
    expect(welcomeCode).toContain('searchParams.trade');
    expect(welcomeCode).toContain('searchParams.city');
    expect(welcomeCode).toContain('initialTrade');
    expect(welcomeFormCode).toContain('initialTrade');
  });
});

describe('P1: Signed-in User App Shell & Middleware Isolation', () => {
  const shellCode = read('src', 'components', 'app-shell.tsx');
  const middlewareCode = read('src', 'middleware.ts');

  it('excludes /login from showAppRail in app-shell', () => {
    expect(shellCode).toContain("!pathname.startsWith('/login')");
  });

  it('middleware redirects authenticated visitors away from /login', () => {
    expect(middlewareCode).toContain("request.nextUrl.pathname === '/login'");
  });
});

describe('P2: Demo Automations Link & Route', () => {
  const homeCode = read('src', 'app', 'dashboard', 'DashboardHomeScreen.tsx');
  const demoAutoCode = read('src', 'app', 'demo', 'automations', 'page.tsx');

  it('DashboardHomeScreen routes demo automations to /demo/settings', () => {
    expect(homeCode).toContain("basePath === '/demo' ? '/demo/settings' : `${basePath}/automations`");
  });

  it('demo automations route redirects to /demo/settings', () => {
    expect(demoAutoCode).toContain("redirect('/demo/settings')");
  });
});

describe('P2: Free Tool Deep Links', () => {
  const pricingCode = read('src', 'app', 'pricing', 'PricingExperience.tsx');
  const sandboxCode = read('src', 'components', 'marketing', 'AiIntakeSandbox.tsx');

  it('pricing experience defines savings-calculator anchor', () => {
    expect(pricingCode).toContain('id="savings-calculator"');
  });

  it('AI intake sandbox defines sandbox anchor', () => {
    expect(sandboxCode).toContain('id="sandbox"');
  });
});

describe('P3: Page Title Branding Deduping', () => {
  const compareCode = read('src', 'app', 'compare', 'page.tsx');
  const toolsCode = read('src', 'app', 'tools', 'page.tsx');

  it('compare page title has no brand suffix', () => {
    expect(compareCode).toContain("title: 'Compare Contractor Software & Alternatives'");
    expect(compareCode).not.toContain("title: 'Compare Contractor Software & Alternatives · Let’s Get Quoted'");
  });

  it('tools page title has no brand suffix', () => {
    expect(toolsCode).toContain("title: 'Free Contractor Tools & Calculators'");
    expect(toolsCode).not.toContain("title: 'Free Contractor Tools & Calculators · Let’s Get Quoted'");
  });

  it('every competitor comparison metaTitle has no trailing brand suffix', () => {
    for (const [slug, item] of Object.entries(COMPARISONS)) {
      expect(item.metaTitle, `metaTitle for ${slug} should not end with brand suffix`).not.toMatch(/·\s*Let’s Get Quoted$/);
    }
  });
});
