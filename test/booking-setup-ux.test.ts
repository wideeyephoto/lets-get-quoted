import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SETUP = readFileSync('src/app/dashboard/schedule/booking/BookingSetup.tsx', 'utf8');
const DEMO = readFileSync('src/app/demo/schedule/booking/page.tsx', 'utf8');

describe('booking request setup language and hierarchy', () => {
  it('sets the request-and-confirm expectation before the settings', () => {
    expect(SETUP).toContain('Booking requests <Icon name="calendar" />');
    expect(SETUP).toContain('Customers request a preferred arrival window. You confirm the final time.');
    expect(DEMO).toContain('Customers request a preferred arrival window. You confirm the final time.');
  });

  it('uses a compact three-part summary instead of four large dashboard cards', () => {
    expect(SETUP.match(/className="bset-summary-item"/g)).toHaveLength(3);
    expect(SETUP).not.toContain('className="bset-cards"');
  });

  it('labels the preview as the time-selection step rather than the whole flow', () => {
    expect(SETUP).toContain('<h2>Availability preview</h2>');
    expect(SETUP).toContain('This is the time-selection step customers see.');
    expect(SETUP).toContain('Customers first describe the job.');
  });
});

describe('booking request setup explains rules in owner language', () => {
  it('marks selected windows that customers cannot actually choose', () => {
    expect(SETUP).toContain("unavailable ? <em className=\"is-warning\">Not offered</em>");
    expect(SETUP).toContain('Edit working hours');
  });

  it('describes qualification outcomes without infrastructure jargon', () => {
    expect(SETUP).toContain('Qualify jobs before showing available times');
    expect(SETUP).toContain('Who can request a time');
    expect(SETUP).not.toContain('Distance Matrix API');
    expect(SETUP).not.toContain('geocoded');
  });

  it('keeps recurring time off with the time-off controls, not the preview rail', () => {
    const timeOff = SETUP.indexOf('function TimeOff');
    const recurringUse = SETUP.indexOf('<RecurringCard todayKey={todayKey} />');
    const recurringDefinition = SETUP.indexOf('function RecurringCard');
    expect(recurringUse).toBeGreaterThan(timeOff);
    expect(recurringUse).toBeLessThan(recurringDefinition);
  });
});
