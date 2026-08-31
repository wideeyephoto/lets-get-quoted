import { describe, it, expect } from 'vitest';
import { generatePrivacyPolicy } from '@/lib/legal/legal-copy';
import { getLeadTriage, type LeadTriage } from '@/lib/leads';

describe('Privacy & AI Compliance Remediations', () => {
  it('generates privacy policy disclosing AI analysis, email delivery, and non-brokerage guarantee', () => {
    const policy = generatePrivacyPolicy({
      companyName: 'Apex Roofing',
      location: 'Ann Arbor, MI',
      phone: '(734) 555-0199',
      updated: '2026-08-31',
    });

    expect(policy).toContain('# Privacy Policy');
    expect(policy).toContain('Apex Roofing');
    // AI Processing disclosure
    expect(policy).toContain('OpenAI');
    expect(policy).toContain('AI assistance');
    expect(policy).toContain('without using your content for AI model training');
    // Email & messaging disclosure
    expect(policy).toContain('Resend');
    // Non-brokerage explicit covenant
    expect(policy).toContain('never share or broadcast your inquiry to competing contractors or third-party lead brokers');
  });

  it('correctly parses and preserves immutable consent evidence in getLeadTriage', () => {
    const rawTriage: LeadTriage = {
      score: 'hot',
      flags: ['phone_verified'],
      contactPreference: 'text_only',
      consent: {
        channel: 'text_email',
        disclosureVersion: 'intake_v1_2026',
        consentedAt: '2026-08-31T12:00:00.000Z',
        sourcePage: 'https://apexroofing.letsgetquoted.com',
      },
    };

    const parsed = getLeadTriage({ triage: rawTriage });
    expect(parsed.consent).toBeDefined();
    expect(parsed.consent?.channel).toBe('text_email');
    expect(parsed.consent?.disclosureVersion).toBe('intake_v1_2026');
    expect(parsed.consent?.consentedAt).toBe('2026-08-31T12:00:00.000Z');
    expect(parsed.consent?.sourcePage).toBe('https://apexroofing.letsgetquoted.com');
  });

  it('handles missing consent gracefully in getLeadTriage', () => {
    const parsed = getLeadTriage({ triage: { score: 'warm', flags: [] } });
    expect(parsed.consent).toBeUndefined();
  });
});
