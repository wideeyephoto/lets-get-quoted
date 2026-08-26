import { describe, expect, it } from 'vitest';
import { buildVoiceSystemPrompt, type VoiceGroundingContext } from '@/lib/voice/grounding';

describe('AI Voice Smart Routing & Grounding', () => {
  it('includes smart routing context when office and emergency forward phones exist', () => {
    const context: VoiceGroundingContext = {
      companyName: 'BrokePipes Plumbing',
      trade: 'plumbing',
      serviceNames: ['Drain Cleaning', 'Water Heater Repair'],
      serviceAreas: 'Royal Oak, MI',
      availableSlots: ['Thursday (Morning or Afternoon)'],
      isLicensed: true,
      licenseNumber: 'PLUMB-9921',
      voiceTone: 'urgent_dispatcher',
      forwardPhoneOffice: '+12485550100',
      forwardPhoneEmergency: '+12485550199',
    };

    const prompt = buildVoiceSystemPrompt(context);

    expect(prompt).toContain('BrokePipes Plumbing');
    expect(prompt).toContain('Drain Cleaning');
    expect(prompt).toContain('Thursday (Morning or Afternoon)');
    expect(prompt).toContain('Tone & Demeanor: Focused, rapid, and safety-first.');
    expect(prompt).toContain('transfer_to_business');
  });

  it('includes recognized returning caller details in system prompt', () => {
    const context: VoiceGroundingContext = {
      companyName: 'Apex Roofing',
      trade: 'roofing',
      serviceNames: ['Roof Inspection', 'Shingle Repair'],
      serviceAreas: 'Detroit, MI',
      availableSlots: [],
      voiceTone: 'friendly',
      recognizedCaller: {
        clientName: 'David Miller',
        serviceAddress: '742 Evergreen Terrace',
        activeJobRef: 'JOB-2026-44',
        activeJobScope: 'Roof Leak Repair',
        scheduledFor: '2026-08-28 at 10:00 AM',
      },
    };

    const prompt = buildVoiceSystemPrompt(context);

    expect(prompt).toContain('David Miller');
    expect(prompt).toContain('742 Evergreen Terrace');
    expect(prompt).toContain('JOB-2026-44');
    expect(prompt).toContain('Tone & Demeanor: Warm, neighborly, and empathetic.');
  });
});
