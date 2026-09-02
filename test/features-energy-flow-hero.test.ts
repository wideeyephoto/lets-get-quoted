import { describe, it, expect } from 'vitest';
import { FEATURE_PILLARS } from '../src/app/features/FeaturesEnergyFlowHero';

describe('FeaturesEnergyFlowHero 6-Pillar Core Engine Suite (Hero Copy Aligned)', () => {
  it('defines all 6 core feature stages covering all hero copy capabilities', () => {
    expect(FEATURE_PILLARS).toHaveLength(6);
    expect(FEATURE_PILLARS.map((p) => p.name)).toEqual([
      'Website & Google Ads',
      '24/7 AI Intake & Voice',
      'SMS & Customer Updates',
      'Custom Quotes & E-Sign',
      'Scheduling & Crew Dispatch',
      'Instant Payments & Invoicing',
    ]);
  });

  it('verifies that each stage addresses its corresponding hero copy concept', () => {
    const [website, aiIntake, updates, quotes, scheduling, payments] = FEATURE_PILLARS;

    // Website & Ads
    expect(website.capability).toContain('website built for your trade');
    expect(website.replacesTool).toContain('Squarespace');
    expect(website.exploreHref).toBe('/features/website-builder');

    // AI Intake & Voice
    expect(aiIntake.capability).toContain('Answers phone calls in 2 rings');
    expect(aiIntake.replacesTool).toContain('CallRail');
    expect(aiIntake.exploreHref).toBe('/features/ai-intake');

    // Customer Updates & SMS
    expect(updates.capability).toContain('2-second automated text replies');
    expect(updates.replacesTool).toContain('Podium');
    expect(updates.exploreHref).toBe('/features/text-to-job');

    // Quotes & E-Sign
    expect(quotes.capability).toContain('line presets');
    expect(quotes.replacesTool).toContain('PandaDoc');
    expect(quotes.exploreHref).toBe('/features/quotes');

    // Scheduling & Crew
    expect(scheduling.capability).toContain('calendar dispatch');
    expect(scheduling.replacesTool).toContain('Jobber');
    expect(scheduling.exploreHref).toBe('/features/dispatch');

    // Payments & Invoicing
    expect(payments.capability).toContain('Automatic upfront deposit collection');
    expect(payments.replacesTool).toContain('Stripe Invoicing');
    expect(payments.exploreHref).toBe('/features/payments');
  });

  it('has 3 key specs/deliverables for every stage', () => {
    FEATURE_PILLARS.forEach((pillar) => {
      expect(pillar.specs).toHaveLength(3);
      pillar.specs.forEach((spec) => {
        expect(spec.length).toBeGreaterThan(5);
      });
    });
  });

  it('contains full customer journey story metadata and job record stages', () => {
    FEATURE_PILLARS.forEach((pillar) => {
      expect(pillar.storyTitle).toBeDefined();
      expect(pillar.storyTime).toMatch(/\d:\d\d PM/);
      expect(pillar.storyHomeowner).toBe('Sarah J. (Austin, TX)');
      expect(pillar.storyNarrative.length).toBeGreaterThan(20);
      expect(pillar.storyOutcome).toContain('✓');
      expect(pillar.jobRecordStage).toBeDefined();
    });
  });
});
