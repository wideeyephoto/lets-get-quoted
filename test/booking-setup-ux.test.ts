import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SETUP = readFileSync('src/app/dashboard/schedule/booking/BookingSetup.tsx', 'utf8');
const DEMO = readFileSync('src/app/demo/schedule/booking/page.tsx', 'utf8');
const CSS = readFileSync('src/app/globals.css', 'utf8');

describe('booking request setup language and hierarchy', () => {
  it('sets the request-and-confirm expectation before the settings', () => {
    expect(SETUP).toContain('Booking requests <Icon name="calendar" />');
    expect(SETUP).toContain('Customers request a preferred arrival window. You confirm the final time.');
    expect(DEMO).toContain('Customers request a preferred arrival window. You confirm the final time.');
  });

  it('uses a compact three-part summary instead of four large dashboard cards', () => {
    expect(SETUP.match(/bset-summary-item/g)).toHaveLength(3);
    expect(SETUP).not.toContain('className="bset-cards"');
    expect(SETUP).toContain('className={`bset-mobile-summary');
    expect(CSS).toMatch(/\.bset-summary\s*\{\s*display:\s*none;/);
    expect(CSS).toMatch(/\.bset-mobile-summary\s*\{\s*display:\s*block;/);
  });

  it('labels the preview as the time-selection step rather than the whole flow', () => {
    expect(SETUP).toContain('<h2>Availability preview</h2>');
    expect(SETUP).toContain('This is the time-selection step customers see.');
    expect(SETUP).toContain('Customers first describe the job.');
  });
});

describe('booking request setup explains rules in owner language', () => {
  it('marks selected windows that customers cannot actually choose', () => {
    expect(SETUP).toContain("unavailable ? <em className=\"is-warning\">Selected, hidden</em>");
    expect(SETUP).toContain("Deselect hidden {outside.length === 1 ? 'window' : 'windows'}");
    expect(SETUP).toContain("`${outside.length} window${outside.length === 1 ? '' : 's'} hidden`");
    expect(SETUP).toContain('Edit working hours');
  });

  it('keeps warning icons compact and the preview free of a native date scrollbar', () => {
    expect(CSS).toMatch(/\.bset-window-warn\s*>\s*svg\s*\{\s*width:\s*1rem;\s*height:\s*1rem;\s*flex:\s*none;/);
    expect(SETUP).toContain('bookableDays.slice(0, 4)');
    expect(CSS).toMatch(/grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
    expect(CSS).not.toMatch(/\.bset-phone-days\s*\{\s*display:\s*flex;/);
  });

  it('explains the immediate master switch and the manual schedule save', () => {
    expect(SETUP).toContain('This switch applies immediately. Other changes wait for Save schedule.');
    expect(SETUP).toContain('Schedule changes aren’t live yet');
    expect(SETUP).toContain('Review your changes, then choose Save schedule.');
  });

  it('describes qualification outcomes without infrastructure jargon', () => {
    expect(SETUP).toContain('Qualify jobs before showing available times');
    expect(SETUP).toContain('Who can request a time');
    expect(SETUP).toContain('A day is route-fit when an existing scheduled job is within');
    expect(SETUP).not.toContain('Distance Matrix API');
    expect(SETUP).not.toContain('geocoded');
  });

  it('uses semantic switches and keyboard-accessible information tips', () => {
    expect(SETUP.match(/role="switch"/g)?.length).toBeGreaterThanOrEqual(3);
    expect(SETUP).toContain('import InfoTip');
    expect(SETUP).toContain('<InfoTip label={text}>{text}</InfoTip>');
  });

  it('keeps recurring time off with the time-off controls, not the preview rail', () => {
    const timeOff = SETUP.indexOf('function TimeOff');
    const recurringUse = SETUP.indexOf('<RecurringCard todayKey={todayKey} />');
    const recurringDefinition = SETUP.indexOf('function RecurringCard');
    expect(recurringUse).toBeGreaterThan(timeOff);
    expect(recurringUse).toBeLessThan(recurringDefinition);
  });

  it('provides 1-click booking link copy, QR code share modal, and in-context working hours quick edit', () => {
    expect(SETUP).toContain('copyBookingLink');
    expect(SETUP).toContain('Copy link');
    expect(SETUP).toContain('QrModal');
    expect(SETUP).toContain('Quick edit');
    expect(SETUP).toContain('MonthCalendar');
    expect(SETUP).toContain('bset-view-toggle');
    expect(CSS).toContain('.bset-head-actions');
    expect(CSS).toContain('.bset-cal');
    expect(CSS).toContain('.bset-modal-card');
  });
});
