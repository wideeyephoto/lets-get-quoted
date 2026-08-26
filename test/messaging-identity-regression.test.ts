import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BRAND_POSITIONING } from '@/lib/brand-messaging';
import { SIGNUP_LABEL, SIGNUP_URL } from '@/components/flagship/site-chrome';

const HOME = readFileSync('src/components/flagship/flagship-home.tsx', 'utf8');
const FEATURES = readFileSync('src/app/features/page.tsx', 'utf8');
const HOW_IT_WORKS = readFileSync('src/app/how-it-works/page.tsx', 'utf8');
const FOR_TRADES = readFileSync('src/app/for/page.tsx', 'utf8');
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
    });
  });

  describe('Homepage hero alignment', () => {
    it('carries the unified hero copy and CTAs', () => {
      expect(HOME).toContain('CONTRACTOR SOFTWARE—STARTING WITH A FREE WEBSITE');
      expect(HOME).toContain('From first click to final payment.<br /><em>Run it all in one place.</em>');
      expect(HOME).toContain(
        'Tell us your company, trade, and ZIP. We’ll generate an editable contractor website with instant estimates',
      );
      expect(HOME).toContain('Explore a live demo');
      expect(HOME).toContain('{SIGNUP_LABEL}');
    });

    it('removes outdated unaligned headline copy', () => {
      expect(HOME).not.toContain('Run your contracting business.<br /><em>All in one place.</em>');
    });
  });

  describe('Features / Product page alignment', () => {
    it('frames the suite as the connected system from website lead to paid job', () => {
      expect(FEATURES).toContain('Everything connected from <em>website lead to paid job.</em>');
      expect(FEATURES).toContain('THE CONNECTED CONTRACTOR SYSTEM');
      expect(FEATURES).toContain('{SIGNUP_LABEL}');
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
      expect(FOR_TRADES).toContain('The connected contractor system—preconfigured for your trade.');
      expect(FOR_TRADES).toContain('Build my free site');
    });
  });

  describe('Pricing page alignment', () => {
    it('frames plans as scalable capacity for the same connected system', () => {
      expect(PRICING).toContain('One connected system · Scalable pricing');
      expect(PRICING).toContain('One connected system for your whole contracting business');
    });
  });

  describe('Navigation & Site Chrome', () => {
    it('includes Product and Website as prominent nav items', () => {
      expect(SITE_CHROME).toContain("['/features', 'Product']");
      expect(SITE_CHROME).toContain("['/features/website-builder', 'Website']");
    });

    it('maintains consistent signup label and signed-in dashboard swap', () => {
      expect(SIGNUP_LABEL).toBe('Build my free site');
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
  const HERO_SHOWCASE = readFileSync('src/components/flagship/hero-showcase.tsx', 'utf8');
  const MARKETING_AI = readFileSync('src/components/marketing/MarketingAiAssistant.tsx', 'utf8');

  it('compresses launch banner to a single line with expandable details', () => {
    expect(LAUNCH_BANNER).toContain('LAUNCH_HEADLINE');
    expect(LAUNCH_BANNER).toContain('summaryBtn');
    expect(LAUNCH_BANNER).toContain('Details');
  });

  it('keeps hero product showcase paused by default on initial viewport', () => {
    expect(HERO_SHOWCASE).toContain('const [paused, setPaused] = useState(true);');
  });

  it('renders a 3-point static proof strip under hero', () => {
    expect(HOME).toContain('trust-strip trust-strip-3');
    expect(HOME).toContain('FREE WEBSITE INCLUDED');
    expect(HOME).toContain('NO CARD REQUIRED');
    expect(HOME).toContain('QUOTE-TO-PAYMENT WORKFLOW');
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

