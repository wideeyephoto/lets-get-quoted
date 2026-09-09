import { describe, expect, it } from 'vitest';
import {
  buildStandardContractorCampaignPayload,
  effectiveBrandName,
  generateContractorCampaignDescription,
  generateContractorHelpMessage,
  generateContractorOptInDescription,
  generateContractorOptOutMessage,
  generateStandardContractorSampleMessages,
} from '@/lib/messaging-contractor-campaign-template';

describe('standard contractor customer operations campaign template', () => {
  const sampleInput = {
    legalBusinessName: 'Apex Roofing LLC',
    dbaName: 'Apex Roofs & Gutters',
    websiteUrl: 'https://apexroofing.example.com',
    supportEmail: 'support@apexroofing.example.com',
    supportPhone: '+12485550199',
  };

  it('determines the effective brand name prioritizing DBA name over legal name', () => {
    expect(effectiveBrandName(sampleInput)).toBe('Apex Roofs & Gutters');
    expect(effectiveBrandName({ legalBusinessName: 'Apex Roofing LLC', dbaName: null })).toBe('Apex Roofing LLC');
    expect(effectiveBrandName({ legalBusinessName: 'Apex Roofing LLC', dbaName: '   ' })).toBe('Apex Roofing LLC');
  });

  it('generates a proposed campaign description with non-marketing customer care scope', () => {
    const description = generateContractorCampaignDescription(sampleInput);

    expect(description).toContain('Apex Roofs & Gutters');
    expect(description).toContain('https://apexroofing.example.com');
    expect(description).toContain('transactional and conversational');
    expect(description).toContain('quote confirmations and links');
    expect(description).toContain('technician dispatch and arrival updates');
    expect(description).toContain('strictly to consented customers');
    expect(description).toContain('no marketing, advertising, or unsolicited promotional messages');
  });

  it('generates an explicit opt-in description detailing the website consent flow', () => {
    const optIn = generateContractorOptInDescription(sampleInput);

    expect(optIn).toContain('Apex Roofs & Gutters');
    expect(optIn).toContain('https://apexroofing.example.com');
    expect(optIn).toContain('"Call or text me" or "Text me only" before submitting');
    expect(optIn).toContain('not consent to unrelated');
    expect(optIn).toContain('stored consent evidence');
    expect(optIn).not.toContain('by signing a service agreement');
    expect(optIn).not.toContain('or by initiating direct contact');
    expect(optIn).not.toContain('never sold or shared with third parties');
    expect(optIn).toContain('for their marketing or promotional purposes');
  });

  it('generates five representative operational sample messages with STOP opt-out disclosures', () => {
    const samples = generateStandardContractorSampleMessages(sampleInput);

    expect(samples).toHaveLength(5);
    for (const sample of samples) {
      expect(sample).toContain('Apex Roofs & Gutters:');
      expect(sample).toMatch(/\bSTOP\b/i);
    }
    // Check specific message categories
    expect(samples[0]).toContain('estimate you requested');
    expect(samples[1]).toContain('appointment is confirmed');
    expect(samples[1]).toContain('STOP to opt out of texts');
    expect(samples[1]).toContain('To change your appointment, contact our office');
    expect(samples[1]).not.toContain('STOP to cancel');
    expect(samples[2]).toContain('technician is on the way');
    expect(samples[3]).toContain('received your note');
    expect(samples[4]).toContain('service has been completed');
  });

  it('generates compliant HELP and STOP auto-response messages', () => {
    const help = generateContractorHelpMessage(sampleInput);
    const stop = generateContractorOptOutMessage(sampleInput);

    expect(help).toContain('Apex Roofs & Gutters Support:');
    expect(help).toContain('support@apexroofing.example.com');
    expect(help).toContain('+12485550199');
    expect(help).toContain('Reply STOP to opt out');

    expect(stop).toContain('Apex Roofs & Gutters:');
    expect(stop).toContain('successfully unsubscribed');
    expect(stop).toContain('Reply UNSTOP to resume');
  });

  it('assembles a complete TCR payload matching carrier registration requirements', () => {
    const payload = buildStandardContractorCampaignPayload(sampleInput);

    expect(payload.useCase).toBe('CUSTOMER_CARE');
    expect(payload.vertical).toBe('HOME_SERVICES');
    expect(payload.hasEmbeddedLinks).toBe(true);
    expect(payload.hasEmbeddedPhone).toBe(false);
    expect(payload.ageGated).toBe(false);
    expect(payload.directLending).toBe(false);
    expect(payload.subscriberOptIn).toBe(true);
    expect(payload.subscriberOptOut).toBe(true);
    expect(payload.subscriberHelp).toBe(true);
    expect(payload.sampleMessages).toHaveLength(5);
    expect(payload.optInMessage).toContain('STOP to opt out of texts');
  });
});
