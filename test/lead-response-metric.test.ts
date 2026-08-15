import { describe, expect, it } from 'vitest';
import { getAverageRequestResponseMs, getRequestResponseMs, type Lead } from '@/lib/leads';

const createdAt = '2026-08-01T12:00:00.000Z';

function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    account_id: 'account-1',
    source: 'website_form',
    status: 'contacted',
    name: 'Dana',
    phone: null,
    email: null,
    address: null,
    project_type: null,
    estimated_hours: null,
    quote_visit: null,
    message: null,
    photo_paths: [],
    source_page: null,
    converted_job: null,
    client_id: null,
    triage: null,
    lat: null,
    lng: null,
    geocoded_at: null,
    created_at: createdAt,
    updated_at: '2026-08-10T12:00:00.000Z',
    ...over,
  };
}

describe('lead response metric', () => {
  it('does not treat an unrelated record update as a customer response', () => {
    expect(getRequestResponseMs(lead())).toBeNull();
  });

  it('measures from arrival to the first logged contact', () => {
    const row = lead({
      triage: {
        score: 'warm',
        flags: [],
        contactLog: [
          { at: '2026-08-01T15:00:00.000Z', label: 'Called' },
          { at: '2026-08-01T13:00:00.000Z', label: 'Texted' },
        ],
      },
    });
    expect(getRequestResponseMs(row)).toBe(3_600_000);
  });

  it('averages only leads with a logged response', () => {
    const oneHour = lead({ triage: { score: 'warm', flags: [], contactLog: [{ at: '2026-08-01T13:00:00.000Z', label: 'Texted' }] } });
    const threeHours = lead({ id: 'lead-2', triage: { score: 'hot', flags: [], contactLog: [{ at: '2026-08-01T15:00:00.000Z', label: 'Called' }] } });
    expect(getAverageRequestResponseMs([lead(), oneHour, threeHours])).toBe(7_200_000);
  });
});
