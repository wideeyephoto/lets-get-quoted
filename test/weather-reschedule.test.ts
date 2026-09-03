import { describe, it, expect } from 'vitest';
import {
  buildWeatherRescheduleSms,
  detectWeatherRiskForTrade,
} from '../src/lib/weather-reschedule';

describe('Weather Reschedule Engine', () => {
  it('builds warm, clear SMS weather reschedule texts', () => {
    const text = buildWeatherRescheduleSms({
      clientName: 'Sarah Connor',
      businessName: 'Apex Roofing',
      originalDate: 'Thursday, Aug 27',
      proposedDate: 'Friday, Aug 28',
      condition: 'rain',
      scope: 'Shingle Roof Replacement',
      bookingUrl: 'https://apexroofing.com/schedule/tok_123',
    });

    expect(text).toContain('Hi Sarah');
    expect(text).toContain('heavy rain forecast on Thursday, Aug 27');
    expect(text).toContain('Apex Roofing would like to reschedule our visit for your shingle roof replacement to Friday, Aug 28');
    expect(text).toContain('https://apexroofing.com/schedule/tok_123');
  });

  it('detects high rain risks for rain-sensitive exterior trades', () => {
    const risk = detectWeatherRiskForTrade('roofers', {
      precipProbability: 80,
      windMph: 10,
    });

    expect(risk.hasRisk).toBe(true);
    expect(risk.severity).toBe('high');
    expect(risk.reason).toContain('chance of rain');
  });

  it('detects high wind risk for tree and roof services', () => {
    const risk = detectWeatherRiskForTrade('tree-services', {
      precipProbability: 10,
      windMph: 32,
    });

    expect(risk.hasRisk).toBe(true);
    expect(risk.severity).toBe('high');
    expect(risk.reason).toContain('Sustained winds');
  });

  it('detects freezing risk for concrete curing', () => {
    const risk = detectWeatherRiskForTrade('concrete', {
      precipProbability: 0,
      tempMin: 28,
    });

    expect(risk.hasRisk).toBe(true);
    expect(risk.severity).toBe('high');
    expect(risk.reason).toContain('Freezing low of 28°F');
  });

  it('passes clear when conditions are favorable', () => {
    const risk = detectWeatherRiskForTrade('painters', {
      precipProbability: 10,
      windMph: 5,
      tempMin: 62,
      tempMax: 78,
    });

    expect(risk.hasRisk).toBe(false);
    expect(risk.severity).toBe('low');
  });
});

describe('Weather Reschedule Inbound Reply Recognition', () => {
  it('correctly matches affirmative customer SMS replies', async () => {
    const { isAffirmativeReply } = await import('../src/lib/weather-inbound');
    expect(isAffirmativeReply('YES')).toBe(true);
    expect(isAffirmativeReply('yes please!')).toBe(true);
    expect(isAffirmativeReply('Confirm')).toBe(true);
    expect(isAffirmativeReply('that works')).toBe(true);
    expect(isAffirmativeReply('Sounds good to me')).toBe(true);
    expect(isAffirmativeReply('ok')).toBe(true);
    expect(isAffirmativeReply('Okay, thanks.')).toBe(true);
    expect(isAffirmativeReply('Sure thing')).toBe(true);
    expect(isAffirmativeReply('Y')).toBe(true);
  });

  it('rejects negative or ambiguous replies', async () => {
    const { isAffirmativeReply } = await import('../src/lib/weather-inbound');
    expect(isAffirmativeReply('No, that date does not work')).toBe(false);
    expect(isAffirmativeReply('Can we do next week instead?')).toBe(false);
    expect(isAffirmativeReply('Who is this?')).toBe(false);
    expect(isAffirmativeReply('')).toBe(false);
  });
});

