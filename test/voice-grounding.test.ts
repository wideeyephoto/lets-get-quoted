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

  it('only claims business is licensed if verified licensing data is present', () => {
    const unlicensedContext: VoiceGroundingContext = {
      companyName: 'Quick Clean Gutters',
      trade: 'gutter specialist',
      serviceNames: ['Gutter Cleaning'],
      serviceAreas: 'Detroit',
      availableSlots: [],
      isLicensed: false,
    };
    const unlicensedPrompt = buildVoiceSystemPrompt(unlicensedContext);
    expect(unlicensedPrompt).toContain('a professional gutter specialist business');
    expect(unlicensedPrompt).not.toContain('a licensed gutter specialist business');

    const licensedContext: VoiceGroundingContext = {
      companyName: 'Master Volt Electric',
      trade: 'electrician',
      serviceNames: ['EV Charger Install'],
      serviceAreas: 'Ann Arbor',
      availableSlots: [],
      isLicensed: true,
      licenseNumber: 'LIC-998822',
    };
    const licensedPrompt = buildVoiceSystemPrompt(licensedContext);
    expect(licensedPrompt).toContain('a licensed electrician business');
  });

  it('incorporates recognized returning caller context into the system prompt', () => {
    const context: VoiceGroundingContext = {
      companyName: 'Apex Plumbing',
      trade: 'plumber',
      serviceNames: ['Drain Cleaning'],
      serviceAreas: 'Royal Oak',
      availableSlots: [],
      recognizedCaller: {
        clientName: 'Sarah Connor',
        serviceAddress: '450 Oak St',
        activeJobRef: 'JOB-992',
        activeJobScope: 'Tankless Water Heater Installation',
        scheduledFor: '2026-08-28 at 09:00',
      },
    };

    const prompt = buildVoiceSystemPrompt(context);
    expect(prompt).toContain('Sarah Connor');
    expect(prompt).toContain('450 Oak St');
    expect(prompt).toContain('JOB-992');
    expect(prompt).toContain('Tankless Water Heater Installation');
    expect(prompt).toContain('2026-08-28 at 09:00');
  });

  it('injects tailored persona instructions based on configured voiceTone', () => {
    const friendlyContext: VoiceGroundingContext = {
      companyName: 'Apex Plumbing',
      trade: 'plumber',
      serviceNames: [],
      serviceAreas: 'Metro',
      availableSlots: [],
      voiceTone: 'friendly',
    };
    expect(buildVoiceSystemPrompt(friendlyContext)).toContain('Warm, neighborly, and empathetic');

    const dispatcherContext: VoiceGroundingContext = {
      companyName: 'Apex Plumbing',
      trade: 'plumber',
      serviceNames: [],
      serviceAreas: 'Metro',
      availableSlots: [],
      voiceTone: 'urgent_dispatcher',
    };
    expect(buildVoiceSystemPrompt(dispatcherContext)).toContain('Focused, rapid, and safety-first');

    const professionalContext: VoiceGroundingContext = {
      companyName: 'Apex Plumbing',
      trade: 'plumber',
      serviceNames: [],
      serviceAreas: 'Metro',
      availableSlots: [],
      voiceTone: 'professional',
    };
    expect(buildVoiceSystemPrompt(professionalContext)).toContain('Polished, professional, and clear');
  });
});

describe('buildVoicePostPrompt', () => {
  it('includes key structured intake dimensions in JSON schema format', () => {
    const postPrompt = buildVoicePostPrompt();
    expect(postPrompt).toContain('caller_name');
    expect(postPrompt).toContain('caller_phone');
    expect(postPrompt).toContain('service_address');
    expect(postPrompt).toContain('work_requested');
    expect(postPrompt).toContain('urgency');
    expect(postPrompt).toContain('is_emergency');
    expect(postPrompt).toContain('requested_slot');
    expect(postPrompt).toContain('follow_up_action');
  });
});
