import { describe, expect, it } from 'vitest';
import {
  formatFieldNoteConfirmation,
  formatCrewTaskConfirmation,
  normalizeFieldSmsText,
} from '@/lib/sms-field-templates';
import { segmentSms } from '@/lib/sms-segments';

describe('field confirmation names and text', () => {
  it('preserves GSM accented names without increasing encoding cost', () => {
    const message = formatFieldNoteConfirmation('J-101', 'José Müller');
    expect(message).toContain('José Müller');
    expect(segmentSms(message)).toMatchObject({ encoding: 'gsm-7', segments: 1 });
  });

  it('preserves non-Latin names, task details and review links', () => {
    const message = formatCrewTaskConfirmation('J-101', '李明', '检查门锁', 'Zoë', 'https://example.com/review/123');
    expect(message).toContain('李明');
    expect(message).toContain('检查门锁');
    expect(message).toContain('Zoë');
    expect(message).toContain('https://example.com/review/123');
    expect(segmentSms(message).encoding).toBe('ucs-2');
  });

  it('removes nonprinting controls without joining tab-separated words', () => {
    expect(normalizeFieldSmsText('  José\tMüller\u0000\nGate 2  ')).toBe('José Müller\nGate 2');
  });
});
