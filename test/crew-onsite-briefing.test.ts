import { describe, it, expect } from 'vitest';
import {
  buildJobsiteArrivalBriefingText,
  type JobsiteArrivalBriefingParams,
} from '@/lib/crew-onsite-briefing';

describe('On-Site Crew Arrival Dispatch Briefing', () => {
  it('builds friendly, clean GSM-7 on-site briefing text with address and client name', () => {
    const params: JobsiteArrivalBriefingParams = {
      crewFirstName: 'Mike',
      jobRef: 'J-104',
      clientName: 'Alice Miller',
      address: '142 Elm St, Royal Oak, MI 48067',
      instructions: [
        'Gate code is #4821.',
        'Caution: Dog in backyard, please keep gate latched.',
        'Park on left side of driveway only.',
      ],
    };

    const text = buildJobsiteArrivalBriefingText(params);

    expect(text).toContain('Hey Mike! Arrived at 142 Elm St (Alice Miller).');
    expect(text).toContain('Special requests & site notes:');
    expect(text).toContain('* Gate code is #4821.');
    expect(text).toContain('* Caution: Dog in backyard, please keep gate latched.');
    expect(text).toContain('* Park on left side of driveway only.');
    expect(text).toContain('Have a great shift! Reply STOP to opt out.');
  });

  it('falls back gracefully to job reference when street address is missing', () => {
    const params: JobsiteArrivalBriefingParams = {
      crewFirstName: 'Dave',
      jobRef: 'J-205',
      clientName: 'John Davis',
      address: null,
      instructions: ['Customer requested call 10 min prior to starting.'],
    };

    const text = buildJobsiteArrivalBriefingText(params);

    expect(text).toContain('Hey Dave! Arrived at J-205 (John Davis).');
    expect(text).toContain('* Customer requested call 10 min prior to starting.');
    expect(text).toContain('Have a great shift! Reply STOP to opt out.');
  });

  it('limits instructions to the top 3 items for SMS length control', () => {
    const params: JobsiteArrivalBriefingParams = {
      crewFirstName: 'Sarah',
      jobRef: 'J-301',
      clientName: 'Robert Smith',
      address: '500 Oak St',
      instructions: [
        'Item 1: Gate code 1234',
        'Item 2: Beware of dog',
        'Item 3: Delicate tile floor in foyer',
        'Item 4: This fourth item should be truncated',
        'Item 5: This fifth item should also be truncated',
      ],
    };

    const text = buildJobsiteArrivalBriefingText(params);

    expect(text).toContain('Item 1: Gate code 1234');
    expect(text).toContain('Item 2: Beware of dog');
    expect(text).toContain('Item 3: Delicate tile floor in foyer');
    expect(text).not.toContain('Item 4');
    expect(text).not.toContain('Item 5');
  });

  it('sanitizes non-ASCII characters to preserve pure GSM-7 carrier compatibility', () => {
    const params: JobsiteArrivalBriefingParams = {
      crewFirstName: 'Renée',
      jobRef: 'J-401',
      clientName: 'O’Connor “VIP” — Client',
      address: '88 Maple Ave',
      instructions: ['“Don’t park on lawn” — use street spaces.'],
    };

    const text = buildJobsiteArrivalBriefingText(params);

    // Emojis, curly quotes, and em-dashes should be cleanly sanitized to ASCII
    expect(text).not.toMatch(/[‘’“”—]/);
    expect(text).toContain("Don't park on lawn");
    expect(text).toContain('Reply STOP to opt out.');
  });
});
