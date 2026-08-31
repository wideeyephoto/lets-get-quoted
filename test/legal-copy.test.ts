import { describe, it, expect } from 'vitest';
import { generatePrivacyPolicy, generateTermsOfService, resolveLegalDoc } from '@/lib/legal/legal-copy';
import { getSiteContent } from '@/lib/site-content';

const input = { companyName: 'Stumps n Humps', location: 'Metro Detroit', phone: '(313) 555-0142', updated: '2026-07-26' };

describe('generatePrivacyPolicy', () => {
  const doc = generatePrivacyPolicy(input);
  it('leads with the title and the business + location', () => {
    expect(doc.startsWith('# Privacy Policy')).toBe(true);
    expect(doc).toContain('Stumps n Humps');
    expect(doc).toContain('Metro Detroit');
  });
  it('discloses the platform and required disclosures (SMS, payments, rights, AI, email)', () => {
    expect(doc).toContain("Let's Get Quoted");
    expect(doc).toMatch(/text message|STOP/i);
    expect(doc).toMatch(/Stripe|payment/i);
    expect(doc).toMatch(/access, correct, or delete/i);
    expect(doc).toMatch(/OpenAI|AI assistance/i);
    expect(doc).toMatch(/Resend|email/i);
    expect(doc).toMatch(/competing contractors|lead brokers/i);
  });
  it('includes the phone in the contact section when provided, omits the effective date when blank', () => {
    expect(doc).toContain('(313) 555-0142');
    expect(doc).toContain('Effective date: 2026-07-26');
    expect(generatePrivacyPolicy({ ...input, updated: '' })).not.toContain('Effective date');
  });
  it('never emits "undefined" and stays non-empty for a blank business', () => {
    const blank = generatePrivacyPolicy({});
    expect(blank).not.toContain('undefined');
    expect(blank.length).toBeGreaterThan(500);
  });
});

describe('generateTermsOfService', () => {
  const doc = generateTermsOfService(input);
  it('leads with the title and frames quotes as non-binding estimates', () => {
    expect(doc.startsWith('# Terms of Service')).toBe(true);
    expect(doc).toMatch(/estimate|ballpark|not a final/i);
    expect(doc).toContain('Stumps n Humps');
  });
});

describe('resolveLegalDoc', () => {
  it('prefers a non-blank saved body, falls back to generated', () => {
    expect(resolveLegalDoc('My own policy', 'GENERATED')).toBe('My own policy');
    expect(resolveLegalDoc('   ', 'GENERATED')).toBe('GENERATED');
    expect(resolveLegalDoc('', 'GENERATED')).toBe('GENERATED');
  });
});

describe('content.legal normalization', () => {
  it('defaults both pages ON with blank (auto) bodies', () => {
    const legal = getSiteContent({}).legal;
    expect(legal.privacyEnabled).toBe(true);
    expect(legal.termsEnabled).toBe(true);
    expect(legal.privacyBody).toBe('');
    expect(legal.termsBody).toBe('');
  });
  it('respects an explicit off and a bad date', () => {
    expect(getSiteContent({ legal: { privacyEnabled: false } }).legal.privacyEnabled).toBe(false);
    expect(getSiteContent({ legal: { updated: 'nope' } }).legal.updated).toBe('');
    expect(getSiteContent({ legal: { updated: '2026-07-26' } }).legal.updated).toBe('2026-07-26');
  });
});
