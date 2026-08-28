import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

const HERO = read('src', 'lib', 'templates', 'HeroQuickForm.tsx');
const CLASSIFIER = read('src', 'app', 'api', 'public', 'leads', 'classify-estimate', 'route.ts');
const HONEYPOT = read('src', 'components', 'honeypot-field.tsx');
const QUOTE_FORM = read('src', 'components', 'quote-request-form.tsx');
const THEMES_CSS = read('src', 'lib', 'templates', 'themes.module.css');

describe('AI Intake 8 Improvements & Production Safety', () => {
  it('1. Enforces mobile responsive stacking and widths in themes.module.css', () => {
    expect(THEMES_CSS).toContain('@media (max-width: 640px)');
    expect(THEMES_CSS).toContain('.heroQuickFormRow { grid-template-columns: 1fr');
    expect(THEMES_CSS).toContain('.heroFormEmergencyAlert');
    expect(THEMES_CSS).toContain('.heroFormEmergencyCallBtn');
  });

  it('2. Enforces pricing guardrails and on-site inspection support in classifier and hero', () => {
    expect(CLASSIFIER).toContain('requires_site_visit');
    expect(CLASSIFIER).toContain('siteVisitTriggers');
    expect(CLASSIFIER).toContain('requiresSiteVisit: true');
    expect(HERO).toContain('requiresSiteVisit?: boolean');
    expect(HERO).toContain('visitReason?: string');
    expect(HERO).toContain('On-Site Assessment Required');
  });

  it('3. Provides immediate emergency triage, water shutoff guidance, and direct 24/7 call button', () => {
    expect(HERO).toContain('isEmergency');
    expect(HERO).toContain('Emergency Safety Guidance');
    expect(HERO).toContain('turn off your main shutoff valve immediately');
    expect(HERO).toContain('Call Emergency Dispatch');
    expect(HERO).toContain('Skip questions — go straight to contact details');
  });

  it('4. Checks service area early and preserves out-of-area advisory on result screen', () => {
    expect(HERO).toContain('matchesServedCity(location, configuredCities) === false');
    expect(HERO).toContain('appears outside our primary service area');
    expect(HERO).toContain('fit.inArea === false');
    expect(HERO).toContain('outside our standard primary service area');
  });

  it('5. Provides dynamic contextual progress microcopy to reduce perceived AI waiting time', () => {
    expect(HERO).toContain('thinkingLabel');
    expect(HERO).toContain('Scoping drain cleaning');
    expect(HERO).toContain('Analyzing pipe repair');
    expect(HERO).toContain('Preparing your estimate');
  });

  it('6. Hardens accessibility and isolates honeypot input from screen readers and mobile tap targets', () => {
    expect(HONEYPOT).toContain('aria-hidden="true"');
    expect(HONEYPOT).toContain('tabIndex={-1}');
    expect(HONEYPOT).toContain('width: 0');
    expect(HONEYPOT).toContain('height: 0');
    expect(HERO).toContain('id="hqf-status"');
    expect(HERO).toContain('aria-invalid');
    expect(HERO).toContain('aria-describedby');
  });

  it('7. Synchronizes state across multiple quote/estimate forms on the same page', () => {
    expect(HERO).toContain("window.addEventListener('lgq:lead-submitted'");
    expect(HERO).toContain("window.dispatchEvent(new CustomEvent('lgq:lead-submitted'");
    expect(QUOTE_FORM).toContain("window.addEventListener('lgq:lead-submitted'");
    expect(QUOTE_FORM).toContain("window.dispatchEvent(new CustomEvent('lgq:lead-submitted'");
  });

  it('8. Eliminates hardcoded placeholders and uses dynamic service-area locations for credibility', () => {
    expect(HERO).not.toContain('placeholder="Royal Oak, MI"');
    expect(HERO).toContain('locationPlaceholder');
    expect(QUOTE_FORM).not.toContain('placeholder="1418 Maplewood Ave, Royal Oak, MI"');
    expect(QUOTE_FORM).toContain('addressPlaceholder');
  });
});
