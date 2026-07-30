import { describe, it, expect } from 'vitest';
import { AUTOMATION_COLUMNS, AUTOMATION_LABELS } from '@/lib/automations';

describe('automation labels', () => {
  it('names every switchable automation, so no audit line leaks a column name', () => {
    expect(Object.keys(AUTOMATION_LABELS).sort()).toEqual(Object.keys(AUTOMATION_COLUMNS).sort());
  });

  it('reads as something a contractor would recognise, not a database field', () => {
    for (const [key, label] of Object.entries(AUTOMATION_LABELS)) {
      expect(label.length).toBeGreaterThan(2);
      expect(label).not.toContain('_'); // not a column name
      expect(label[0]).toBe(label[0].toUpperCase());
      // Never the raw key, which is what would show if a label went missing.
      expect(label.toLowerCase()).not.toBe(key);
    }
  });

  it('produces the audit summary the toggle actions write', () => {
    const summary = (key: keyof typeof AUTOMATION_LABELS, on: boolean) =>
      `${AUTOMATION_LABELS[key]} turned ${on ? 'on' : 'off'}`;
    expect(summary('booking', false)).toBe('Online booking turned off');
    expect(summary('daily-digest', true)).toBe('Daily digest turned on');
    expect(summary('missed-call', false)).toBe('Missed-call text-back turned off');
  });
});
