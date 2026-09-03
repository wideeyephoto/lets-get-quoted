import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Voice to Chat Buttons across requested Dashboard Pages', () => {
  it('verifies field-intake-hint.tsx defines configurations for all requested pages', () => {
    const hintSrc = readFileSync('src/components/field-intake-hint.tsx', 'utf8');
    expect(hintSrc).toContain("'crew'");
    expect(hintSrc).toContain("'booking'");
    expect(hintSrc).toContain("'quick-stops'");
    expect(hintSrc).toContain("'schedule'");
    expect(hintSrc).toContain("'recurring'");
    expect(hintSrc).toContain("'voice'");

    expect(hintSrc).toContain("pillLabel: 'Voice & Text-to-Crew'");
    expect(hintSrc).toContain("pillLabel: 'Voice & Text-to-Book'");
    expect(hintSrc).toContain("pillLabel: 'Voice & Text-to-Quick-Stop'");
    expect(hintSrc).toContain("pillLabel: 'Voice & Text-to-Schedule'");
    expect(hintSrc).toContain("pillLabel: 'Voice & Text-to-Recurring'");
    expect(hintSrc).toContain("pillLabel: 'Voice & Text Field Line'");
  });

  it('verifies /dashboard/crew page renders FieldIntakeHint page="crew"', () => {
    const src = readFileSync('src/app/dashboard/crew/page.tsx', 'utf8');
    expect(src).toContain('<FieldIntakeHint page="crew" />');
  });

  it('verifies /dashboard/schedule/booking page renders FieldIntakeHint page="booking"', () => {
    const src = readFileSync('src/app/dashboard/schedule/booking/BookingSetup.tsx', 'utf8');
    expect(src).toContain("import FieldIntakeHint from '@/components/field-intake-hint'");
    expect(src).toContain('<FieldIntakeHint page="booking" />');
  });

  it('verifies /dashboard/quick-stops page renders FieldIntakeHint page="quick-stops"', () => {
    const src = readFileSync('src/app/dashboard/quick-stops/QuickStopStatus.tsx', 'utf8');
    expect(src).toContain("import FieldIntakeHint from '@/components/field-intake-hint'");
    expect(src).toContain('<FieldIntakeHint page="quick-stops" />');
  });

  it('verifies /dashboard/schedule page renders FieldIntakeHint page="schedule" in the header and not duplicated on the calendar toolbar', () => {
    const src = readFileSync('src/app/dashboard/schedule/page.tsx', 'utf8');
    expect(src).toContain("import FieldIntakeHint from '@/components/field-intake-hint'");
    expect(src).toContain('<FieldIntakeHint page="schedule" />');

    const calSrc = readFileSync('src/app/dashboard/schedule/schedule-calendar.tsx', 'utf8');
    expect(calSrc).not.toContain('FieldIntakeHint');
  });

  it('verifies /dashboard/recurring page renders FieldIntakeHint page="recurring"', () => {
    const src = readFileSync('src/app/dashboard/recurring/RecurringScreen.tsx', 'utf8');
    expect(src).toContain("import FieldIntakeHint from '@/components/field-intake-hint'");
    expect(src).toContain('<FieldIntakeHint page="recurring" />');
  });

  it('verifies /dashboard/voice-calls page renders FieldIntakeHint page="voice"', () => {
    const src = readFileSync('src/app/dashboard/voice-calls/page.tsx', 'utf8');
    expect(src).toContain("import FieldIntakeHint from '@/components/field-intake-hint'");
    expect(src).toContain('<FieldIntakeHint page="voice" />');
  });
});
