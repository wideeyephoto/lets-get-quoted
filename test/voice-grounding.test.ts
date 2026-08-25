import { describe, expect, it } from 'vitest';
import { buildVoicePostPrompt, buildVoiceSystemPrompt, type VoiceGroundingContext } from '@/lib/voice/grounding';

describe('buildVoiceSystemPrompt', () => {
  it('constructs tailored system instructions containing trade, services, areas, and schedule slots', () => {
    const context: VoiceGroundingContext = {
      companyName: 'Apex Plumbing & Heating',
      trade: 'plumber',
      serviceNames: ['Emergency Leak Repair', 'Water Heater Installation', 'Drain Cleaning'],
      serviceAreas: 'Maplewood, South Orange, Millburn',
      availableSlots: ['Wednesday, Aug 26 (Morning: 8 AM – 12 PM)', 'Thursday, Aug 27 (Afternoon: 1 PM – 5 PM)'],
    };

    const prompt = buildVoiceSystemPrompt(context);

    expect(prompt).toContain('Apex Plumbing & Heating');
    expect(prompt).toContain('plumber');
    expect(prompt).toContain('Maplewood, South Orange, Millburn');
    expect(prompt).toContain('Emergency Leak Repair, Water Heater Installation, Drain Cleaning');
    expect(prompt).toContain('Wednesday, Aug 26 (Morning: 8 AM – 12 PM)');
  });

  it('handles fallback defaults gracefully when services or areas are unspecified', () => {
    const context: VoiceGroundingContext = {
      companyName: 'BrokePipes LLC',
      trade: 'home services contractor',
      serviceNames: [],
      serviceAreas: 'the local area',
      availableSlots: [],
    };

    const prompt = buildVoiceSystemPrompt(context);

    expect(prompt).toContain('BrokePipes LLC');
    expect(prompt).toContain('home services contractor');
    expect(prompt).toContain('We provide professional home services contractor services.');
  });
});

describe('buildVoicePostPrompt', () => {
  it('includes key structured intake dimensions', () => {
    const postPrompt = buildVoicePostPrompt();
    expect(postPrompt).toContain('Caller Name');
    expect(postPrompt).toContain('Callback Phone');
    expect(postPrompt).toContain('Service Address');
    expect(postPrompt).toContain('Urgency Level');
  });
});
