import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseSignupIntent,
  serializeSignupIntent,
  buildStartUrl,
  resolveDestination,
} from '@/lib/signup-intent';
import { BILLING_PLAN_IDS } from '@/lib/billing/catalog';
import { parsePlanIntent } from '@/lib/plan-intent';

const LOGIN_PAGE = readFileSync('src/app/login/page.tsx', 'utf8');
const WELCOME_PAGE = readFileSync('src/app/welcome/page.tsx', 'utf8');
const WELCOME_FORM = readFileSync('src/app/welcome/WelcomeForm.tsx', 'utf8');
const WELCOME_ACTIONS = readFileSync('src/app/welcome/actions.ts', 'utf8');
const START_PAGE = readFileSync('src/app/start/page.tsx', 'utf8');
const SITE_CHROME = readFileSync('src/components/flagship/site-chrome.tsx', 'utf8');
const FLAGSHIP_HOME = readFileSync('src/components/flagship/flagship-home.tsx', 'utf8');
const FEATURES_PAGE = readFileSync('src/app/features/page.tsx', 'utf8');
const TRADE_GENERATOR = readFileSync('src/components/marketing/TradeWebsiteGenerator.tsx', 'utf8');
const PRICING_EXPERIENCE = readFileSync('src/app/pricing/PricingExperience.tsx', 'utf8');

describe('Problem 4: Preserving Signup Intent & Continuity', () => {
  describe('Canonical Signup Intent Model & URL Builder', () => {
    it('serializes and parses website builder intent with trade and city', () => {
      const url = buildStartUrl({
        goal: 'build_site',
        trade: 'plumbing',
        city: 'Austin, TX',
        businessName: 'Austin Plumbing Co.',
        source: 'site_generator',
      });

      expect(url).toContain('https://app.letsgetquoted.com/start?');
      expect(url).toContain('goal=build_site');
      expect(url).toContain('trade=plumbing');
      expect(url).toContain('city=Austin%2C+TX');
      expect(url).toContain('business_name=Austin+Plumbing+Co.');
      expect(url).toContain('source=site_generator');

      const params = new URL(url).searchParams;
      const parsed = parseSignupIntent(params);
      expect(parsed.goal).toBe('build_site');
      expect(parsed.trade).toBe('plumbing');
      expect(parsed.city).toBe('Austin, TX');
      expect(parsed.businessName).toBe('Austin Plumbing Co.');
      expect(parsed.source).toBe('site_generator');
    });

    it('serializes and parses plan selection intent', () => {
      const url = buildStartUrl({
        goal: 'choose_plan',
        plan: 'growth',
        billing: 'annual',
        source: 'pricing',
      });

      const params = new URL(url).searchParams;
      const parsed = parseSignupIntent(params);
      expect(parsed.goal).toBe('choose_plan');
      expect(parsed.plan).toBe('growth');
      expect(parsed.billing).toBe('annual');
      expect(parsed.source).toBe('pricing');
    });

    it('round-trips every canonical pricing plan through signup and paid-plan parsing', () => {
      for (const plan of BILLING_PLAN_IDS) {
        const url = buildStartUrl({
          goal: 'choose_plan',
          plan,
          billing: 'annual',
          source: 'pricing',
        });
        const parsed = parseSignupIntent(new URL(url).searchParams);

        expect(parsed.plan).toBe(plan);
        if (plan === 'flex') {
          expect(parsePlanIntent(parsed.plan, parsed.billing)).toBeNull();
        } else {
          expect(parsePlanIntent(parsed.plan, parsed.billing)).toEqual({
            planCode: plan,
            billingInterval: 'annual',
          });
        }
      }
    });

    it('normalizes the legacy Starter label to canonical Solo', () => {
      expect(parseSignupIntent({ plan: 'starter', billing: 'monthly' }).plan).toBe('solo');
    });

    it('serializes and parses feature intent', () => {
      const url = buildStartUrl({
        goal: 'feature',
        feature: 'quick_stops',
        source: 'feature_page',
      });

      const params = new URL(url).searchParams;
      const parsed = parseSignupIntent(params);
      expect(parsed.goal).toBe('feature');
      expect(parsed.feature).toBe('quick_stops');
      expect(parsed.source).toBe('feature_page');
    });

    it('falls back safely for invalid or malicious intent values', () => {
      const parsed = parseSignupIntent({
        goal: 'invalid_goal' as any,
        feature: 'evil_script<script>' as any,
        plan: 'super_diamond' as any,
        next: 'https://evil.com/phish',
      });

      expect(parsed.goal).toBe('build_site');
      expect(parsed.feature).toBeNull();
      expect(parsed.plan).toBeNull();
      // External absolute URLs are not used as internal destinations
      expect(resolveDestination(parsed, 'active')).toBe('/dashboard/sites');
    });
  });

  describe('Destination Resolution', () => {
    it('resolves active account destinations based on goal and feature', () => {
      expect(resolveDestination({ goal: 'build_site' }, 'active')).toBe('/dashboard/sites');
      expect(resolveDestination({ goal: 'choose_plan', plan: 'growth' }, 'active')).toBe('/dashboard/settings');
      expect(resolveDestination({ goal: 'feature', feature: 'quick_stops' }, 'active')).toBe('/dashboard/quick-stops');
      expect(resolveDestination({ goal: 'feature', feature: 'ai_intake' }, 'active')).toBe('/dashboard/leads');
      expect(resolveDestination({ goal: 'feature', feature: 'quotes' }, 'active')).toBe('/dashboard/jobs');
      expect(resolveDestination({ goal: 'feature', feature: 'scheduling' }, 'active')).toBe('/dashboard/schedule');
      expect(resolveDestination({ goal: 'explore' }, 'active')).toBe('/dashboard');
    });

    it('resolves onboarding accounts to /welcome with preserved intent params', () => {
      const dest = resolveDestination(
        { goal: 'build_site', trade: 'electrician', city: 'Maplewood' },
        'onboarding',
      );
      expect(dest).toContain('/welcome?');
      expect(dest).toContain('trade=electrician');
      expect(dest).toContain('city=Maplewood');
    });

    it('respects safe relative internal next parameters', () => {
      expect(resolveDestination({ goal: 'build_site', next: '/dashboard/jobs/123' }, 'active')).toBe('/dashboard/jobs/123');
    });
  });

  describe('Canonical /start Router Component', () => {
    it('implements server router inspecting session, first-run status, and plan checkout', () => {
      expect(START_PAGE).toContain('parseSignupIntent');
      expect(START_PAGE).toContain('needsFirstRun');
      expect(START_PAGE).toContain('resolveDestination');
      expect(START_PAGE).toContain('planCheckoutPath');
      expect(START_PAGE).toContain('redirect(`/login?${serialized.toString()}`)');
    });
  });

  describe('Login Screen Continuity & Auth Toggle', () => {
    it('preserves query parameters when toggling between sign-in and sign-up', () => {
      expect(LOGIN_PAGE).toContain('buildToggleUrl');
      expect(LOGIN_PAGE).toContain("buildToggleUrl('signin')");
      expect(LOGIN_PAGE).toContain("buildToggleUrl('signup')");
    });

    it('displays goal-specific confirmation headings and lead copy', () => {
      expect(LOGIN_PAGE).toContain('Building your ${tradeDisplayName} website for ${cityParam}');
      expect(LOGIN_PAGE).toContain('You selected ${selectedPlan.name}');
      expect(LOGIN_PAGE).toContain('Set up your free account to activate');
    });
  });

  describe('First-Run Setup (/welcome) & Paid Plan Fallback', () => {
    it('prefills trade, suggested business name, and explains why ZIP is needed', () => {
      expect(WELCOME_PAGE).toContain('suggestedBusinessName');
      expect(WELCOME_FORM).toContain('We have your city');
      expect(WELCOME_FORM).toContain('5-digit ZIP for accurate permit requirements');
    });

    it('displays goal-specific completion button copy', () => {
      expect(WELCOME_FORM).toContain('Build my website');
      expect(WELCOME_FORM).toContain('Continue to');
      expect(WELCOME_FORM).toContain('Go to');
    });

    it('includes paid plan fallback messaging when checkout is unavailable', () => {
      expect(WELCOME_PAGE).toContain('Your preference is saved, and your account begins on the free');
      expect(WELCOME_PAGE).toContain('Flex');
    });

    it('records first-run destination resolution in actions.ts', () => {
      expect(WELCOME_ACTIONS).toContain('resolveDestination');
      expect(WELCOME_ACTIONS).toContain('destinationPath');
    });
  });

  describe('Public Marketing CTA Integration', () => {
    it('wires flagship header, hero, and footer CTAs to /start', () => {
      expect(SITE_CHROME).toContain('https://app.letsgetquoted.com/start?goal=build_site&source=nav');
      expect(FLAGSHIP_HOME).toContain('https://app.letsgetquoted.com/start?goal=build_site&source=home_hero');
      expect(FLAGSHIP_HOME).toContain('https://app.letsgetquoted.com/start?goal=build_site&source=footer');
      expect(FEATURES_PAGE).toContain("buildSignupUrl({ source: 'feature_page' })");
      expect(FEATURES_PAGE).toContain('href={FEATURE_SIGNUP_URL}');
    });

    it('wires website generator and pricing CTAs to buildStartUrl', () => {
      expect(TRADE_GENERATOR).toContain('buildStartUrl');
      expect(TRADE_GENERATOR).toContain("source: 'site_generator'");
      expect(PRICING_EXPERIENCE).toContain('buildStartUrl');
      expect(PRICING_EXPERIENCE).toContain("source: 'pricing'");
    });
  });

  describe('Ad Click & UTM Attribution Preservation', () => {
    it('preserves gclid, gbraid, wbraid, _gl, and UTM parameters across intent parsing and serialization', () => {
      const incomingQuery = new URLSearchParams({
        goal: 'build_site',
        trade: 'electrician',
        city: 'Miami, FL',
        gclid: 'Cj0KCQjwmOm3BhDhARIsAPg_vS123fakegclid',
        gbraid: '01ABCDEF456gbraid',
        wbraid: '01XYZ789wbraid',
        _gl: '1*1abcde*_ga*MTIzNDU2*_ga_ABC*MTIzNDU2',
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'commercial_electrical_south_fl',
        utm_content: 'ad_variant_3',
        utm_term: 'emergency commercial electrician',
      });

      const intent = parseSignupIntent(incomingQuery);
      expect(intent.gclid).toBe('Cj0KCQjwmOm3BhDhARIsAPg_vS123fakegclid');
      expect(intent.gbraid).toBe('01ABCDEF456gbraid');
      expect(intent.wbraid).toBe('01XYZ789wbraid');
      expect(intent._gl).toBe('1*1abcde*_ga*MTIzNDU2*_ga_ABC*MTIzNDU2');
      expect(intent.utmSource).toBe('google');
      expect(intent.utmMedium).toBe('cpc');
      expect(intent.utmCampaign).toBe('commercial_electrical_south_fl');
      expect(intent.utmContent).toBe('ad_variant_3');
      expect(intent.utmTerm).toBe('emergency commercial electrician');

      const serialized = serializeSignupIntent(intent);
      expect(serialized.get('gclid')).toBe('Cj0KCQjwmOm3BhDhARIsAPg_vS123fakegclid');
      expect(serialized.get('gbraid')).toBe('01ABCDEF456gbraid');
      expect(serialized.get('wbraid')).toBe('01XYZ789wbraid');
      expect(serialized.get('_gl')).toBe('1*1abcde*_ga*MTIzNDU2*_ga_ABC*MTIzNDU2');
      expect(serialized.get('utm_source')).toBe('google');
      expect(serialized.get('utm_medium')).toBe('cpc');
      expect(serialized.get('utm_campaign')).toBe('commercial_electrical_south_fl');
      expect(serialized.get('utm_content')).toBe('ad_variant_3');
      expect(serialized.get('utm_term')).toBe('emergency commercial electrician');
      expect(serialized.get('trade')).toBe('electrician');
      expect(serialized.get('city')).toBe('Miami, FL');
    });
  });
});
