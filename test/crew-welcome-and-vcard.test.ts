import { describe, it, expect, vi } from 'vitest';
import { crewWelcomeText } from '@/lib/sms-templates';
import { formatFieldVcard } from '@/lib/sms-field-templates';

describe('Crew Welcome Onboarding SMS', () => {
  it('generates a clean GSM-7 onboarding message explaining field intake', () => {
    const text = crewWelcomeText({
      crewName: 'Mike',
      businessName: 'Apex Roofing',
    });

    expect(text).toContain('Apex Roofing');
    expect(text).toContain('Mike');
    expect(text).toContain('progress updates, gate codes, or material receipt photos');
    expect(text).toContain('Reply STOP to opt out');
    expect(/^[\x20-\x7E]+$/.test(text)).toBe(true);
  });
});

describe('Field vCard Contact Generation', () => {
  it('generates a valid vCard 3.0 string with name, phone, and notes', () => {
    const vcard = formatFieldVcard('Apex Roofing & Construction', '+12485550199');

    expect(vcard).toContain('BEGIN:VCARD');
    expect(vcard).toContain('VERSION:3.0');
    expect(vcard).toContain('FN:Apex Roofing & Construction Field Updates');
    expect(vcard).toContain('ORG:Apex Roofing & Construction');
    expect(vcard).toContain('TEL;TYPE=CELL,VOICE,TEXT,PREF:+12485550199');
    expect(vcard).toContain('Let\'s Get Quoted AI Voice & Text-to-Job Field Intake Line');
    expect(vcard).toContain('END:VCARD');
  });
});
