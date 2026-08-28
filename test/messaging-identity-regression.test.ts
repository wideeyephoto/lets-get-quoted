import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BRAND_POSITIONING } from '@/lib/brand-messaging';
import { SIGNUP_LABEL, SIGNUP_URL } from '@/components/flagship/site-chrome';

const HOME = readFileSync('src/components/flagship/flagship-home.tsx', 'utf8');
const FEATURES = readFileSync('src/app/features/page.tsx', 'utf8');
const HOW_IT_WORKS = readFileSync('src/app/how-it-works/page.tsx', 'utf8');
const FOR_TRADES = readFileSync('src/app/for/ForExperience.tsx', 'utf8');
const PRICING = readFileSync('src/app/pricing/PricingExperience.tsx', 'utf8');
const SITE_CHROME = readFileSync('src/components/flagship/site-chrome.tsx', 'utf8');
const ROOT_LAYOUT = readFileSync('src/app/layout.tsx', 'utf8');

describe('Problem 1: Product Identity and Message Hierarchy', () => {
  describe('Canonical source of truth', () => {
    it('defines the 4-part message hierarchy and canonical positioning', () => {
      expect(BRAND_POSITIONING.valueProposition).toBe(
        'Let’s Get Quoted is one connected system for winning the job, running it, and getting paid—starting with a free contractor website.',
      );
      expect(BRAND_POSITIONING.workflowSteps).toHaveLength(5);
      expect(BRAND_POSITIONING.workflowSteps.map((s) => s.name)).toEqual([
        'Website visit',
        'Qualified lead',
        'Quote',
        'Scheduled work',
        'Payment',
      ]);
      expect(BRAND_POSITIONING.hero).toMatchObject({
        eyebrow: 'FULL CONTRACTOR AI SUITE—THE ONLY SOFTWARE YOU NEED TO RUN YOUR BUSINESS',
        headline: 'A better front door. A smoother back office.',
        headlinePart1: 'A better front door.',
        headlinePart2: 'A smoother back office.',
        secondaryCta: 'Watch one job move',
      });
    });
  });

  describe('Homepage hero alignment', () => {
    it('carries the unified hero copy and CTAs', () => {
      expect(HOME).toContain("import { BRAND_POSITIONING } from '@/lib/brand-messaging'");
      expect(HOME).toContain('const HOME_HERO = BRAND_POSITIONING.hero');
      expect(HOME).toContain('{HOME_HERO.eyebrow}');
      expect(HOME).toContain('{HOME_HERO.headlinePart1}');
      expect(HOME).toContain('{HOME_HERO.headlinePart2}');
      expect(HOME).toContain('{HOME_HERO.supportingCopy}');
      expect(HOME).toContain('{HOME_HERO.secondaryCta}');
      expect(HOME).toContain('href="/features"');
      expect(HOME).toContain('{SIGNUP_LABEL}');
      expect(HOME).toContain('AI photo &amp; smart intake');
      expect(HOME).toContain('Instant quote drafts with profit guardrails');
      expect(HOME).toContain('Connected schedule, crew &amp; payments');
    });

    it('removes outdated unaligned headline copy', () => {
      expect(HOME).not.toContain('Let AI qualify the lead.<br /><em>You win the right work.</em>');
      expect(HOME).not.toContain('From first click to final payment.<br /><em>Run it all in one place.</em>');
      expect(HOME).not.toContain('Run your contracting business.<br /><em>All in one place.</em>');
    });
  });

  describe('Features / Product page alignment', () => {
    it('frames the suite as the connected system from website lead to paid job', () => {
      expect(FEATURES).toContain('From website lead to paid job—<em>without stitching together six tools.</em>');
      expect(FEATURES).toContain('ONE JOB RECORD. EVERY STEP CONNECTED.');
      expect(FEATURES).toContain('Build my free site');
      expect(BRAND_POSITIONING.workflowSteps[1]).toMatchObject({
        kicker: 'AI PHOTO INTAKE + LEAD QUALIFICATION',
        title: 'Let AI qualify the lead. You win the right work.',
        produces: [
          'Photo-grounded project summaries',
          'Leads prioritized by fit and urgency',
          'Quote drafts with profit guardrails',
        ],
      });
      expect(FEATURES).toContain('title: AI_INTAKE_WORKFLOW.title');
    });
  });

  describe('How It Works page alignment', () => {
    it('leads with the complete 5-step lifecycle', () => {
      expect(HOW_IT_WORKS).toContain('THE 5-STEP CONTRACTOR WORKFLOW');
      expect(HOW_IT_WORKS).toContain('From first click to <em>final payment.</em>');
      expect(HOW_IT_WORKS).toContain('Website visit → Qualified lead → Quote → Scheduled work → Payment');
    });

    it('has 5 journey stages in correct chronological order', () => {
      const journeyMatch = HOW_IT_WORKS.slice(
        HOW_IT_WORKS.indexOf('const JOURNEY:'),
        HOW_IT_WORKS.indexOf('];', HOW_IT_WORKS.indexOf('const JOURNEY:')) + 2,
      );
      expect(journeyMatch).toContain("title: 'Website visit'");
      expect(journeyMatch).toContain("title: 'Qualified lead'");
      expect(journeyMatch).toContain("title: 'Quote'");
      expect(journeyMatch).toContain("title: 'Scheduled work'");
      expect(journeyMatch).toContain("title: 'Payment'");
    });
  });

  describe('Trade pages alignment', () => {
    it('presents the connected contractor system preconfigured for the trade', () => {
      expect(FOR_TRADES).toContain('Your trade. Your workflow.');
      expect(FOR_TRADES).toContain('Build my free site');
    });
  });

  describe('Pricing page alignment', () => {
    it('frames plans as scalable capacity for the same connected system', () => {
      expect(PRICING).toContain('YOUR WHOLE BUSINESS · ONE CONNECTED SYSTEM');
      expect(PRICING).toContain('Your whole contracting business. <em>From $0/month.</em>');
      expect(PRICING).toContain(
        'From an AI-powered website and instant quoting to client texting, booking, invoices, payments, and QuickBooks sync—<em>everything connected from day one.</em>',
      );
      expect(PRICING).toContain('Full Contractor Business Platform');
      expect(PRICING).toContain('Every plan includes the full contractor business platform.');
    });
  });

  describe('Navigation & Site Chrome', () => {
    it('includes Product and Website as prominent nav items', () => {
      expect(SITE_CHROME).toContain("['/features', 'Product']");
      expect(SITE_CHROME).toContain("['/features/website-builder', 'Website']");
    });

    it('maintains consistent signup label and signed-in dashboard swap', () => {
      expect(SIGNUP_LABEL).toBe('Create Free Account');
      expect(SIGNUP_URL).toContain('https://app.letsgetquoted.com/start?');
      expect(SIGNUP_URL).toContain('goal=build_site');
      expect(SITE_CHROME).toContain("label: 'Dashboard'");
    });
  });

  describe('Root Layout metadata', () => {
    it('states the contractor software category starting with a free website', () => {
      expect(ROOT_LAYOUT).toContain('Contractor software starting with a free website');
      expect(ROOT_LAYOUT).toContain(
        'One connected system for contractors: build your website, qualify leads, send quotes, schedule work, manage crew, and collect payment without switching tools.',
      );
    });
  });
});

describe('Problem 2: Reduce Homepage Attention Competition', () => {
  const LAUNCH_BANNER = readFileSync('src/components/marketing/launch-banner.tsx', 'utf8');
  const HERO_SHOWCASE = readFileSync('src/components/flagship/hero-ai-intake-showcase.tsx', 'utf8');
  const MARKETING_AI = readFileSync('src/components/marketing/MarketingAiAssistant.tsx', 'utf8');

  it('compresses launch banner to a single line with expandable details', () => {
    expect(LAUNCH_BANNER).toContain('LAUNCH_HEADLINE');
    expect(LAUNCH_BANNER).toContain('summaryBtn');
    expect(LAUNCH_BANNER).toContain('Details');
  });

  it('replaces the hero screenshot carousel with the interactive AI intake story', () => {
    expect(HERO_SHOWCASE).toContain("import HeroIntakeStory from '@/components/flagship/HeroIntakeStory';");
    expect(HERO_SHOWCASE).toContain('<HeroIntakeStory />');
  });

  it('renders a 3-point feature proof strip under hero and profit guardrail bullets', () => {
    expect(HOME).toContain('trust-strip trust-strip-3');
    expect(HOME).toContain('ONE-CLICK AI WEBSITE');
    expect(HOME).toContain('SMART PHOTO INTAKE');
    expect(HOME).toContain('QUOTE-TO-PAYMENT WORKFLOW');
    expect(HOME).toContain('Instant quote drafts with profit guardrails');
  });

  it('leads directly from hero proof strip into the flagship feature tour without competing sandboxes', () => {
    const stripPos = HOME.indexOf('trust-strip trust-strip-3');
    const flagshipsPos = HOME.indexOf('className="flagships"');

    expect(stripPos).toBeGreaterThan(0);
    expect(flagshipsPos).toBeGreaterThan(stripPos);
    expect(HOME).not.toContain('<TradeWebsiteGenerator />');
    expect(HOME).not.toContain('className="home-workflow"');
  });

  it('consolidates pricing CTAs to emphasize plan comparison without duplicate signup button', () => {
    const pricingBand = HOME.slice(HOME.indexOf('className="pricing-band"'), HOME.indexOf('className="home-faq'));
    expect(pricingBand).toContain('Compare plans');
    expect(pricingBand).not.toContain('pricing-actions">\n            <a className="button primary" href={SIGNUP_URL}');
  });

  it('condenses FAQ to 3 questions followed by a link to /faq', () => {
    const faqSection = HOME.slice(HOME.indexOf('className="home-faq'), HOME.indexOf('className="final-cta"'));
    expect(faqSection).toContain('HOME_FAQS.slice(0, 3)');
    expect(faqSection).toContain('Read all FAQs');
    expect(faqSection).toContain('href="/faq"');
  });

  it('delays floating AI helper until the visitor scrolls', () => {
    expect(MARKETING_AI).toContain('window.scrollY > 350');
    expect(MARKETING_AI).toContain('if (!scrolled && !isOpen)');
  });
});

