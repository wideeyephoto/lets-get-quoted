import { describe, expect, it } from 'vitest';
import { generateSpeedToLeadSms } from '@/lib/ad-speed-to-lead';

describe('AI Speed-to-Lead SMS Engine', () => {
  it('generates a warm, natural SMS response for standard ad leads', () => {
    const text = generateSpeedToLeadSms({
      businessName: 'Apex Roofing',
      leadName: 'Sarah Jenkins',
      projectType: 'Roof Replacement',
      city: 'Austin, TX',
      urgency: 'standard',
    });

    expect(text).toContain('Hi Sarah');
    expect(text).toContain('Apex Roofing');
    expect(text).toContain('Roof Replacement in Austin');
    expect(text).toContain('tomorrow morning or afternoon');
    expect(text).toContain('Reply STOP to opt out.');
  });

  it('generates high-urgency dispatch SMS for emergency leads', () => {
    const text = generateSpeedToLeadSms({
      businessName: 'Evergreen Plumbing',
      leadName: 'David Miller',
      projectType: 'Burst Pipe Leak',
      city: 'Dallas, TX',
      urgency: 'emergency',
    });

    expect(text).toContain('Hi David');
    expect(text).toContain('urgent request for Burst Pipe Leak in Dallas');
    expect(text).toContain('dispatch team is on standby');
    expect(text).toContain('Reply STOP to opt out.');
  });
});
