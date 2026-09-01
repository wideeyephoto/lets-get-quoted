import { describe, it, expect } from 'vitest';
import {
  attachFieldReviewLink,
  formatFieldNoteConfirmation,
  formatFieldCostConfirmation,
  formatFieldTaskConfirmation,
  formatFieldLeadConfirmation,
  sanitizeGsm7Text,
} from '@/lib/sms-field-templates';

describe('Field Intake Review & Approval Link Integration', () => {
  const sampleTaskId = '22222222-2222-4222-8222-222222222222';
  const sampleReviewUrl = `https://app.letsgetquoted.com/field/intake/${sampleTaskId}`;

  it('attaches review link to base confirmation text with clean GSM-7 sanitization', () => {
    const baseText = '[LGQ] J-101 (Smith): Logged field note.';
    const formatted = attachFieldReviewLink(baseText, sampleReviewUrl);

    expect(formatted).toBe(
      `[LGQ] J-101 (Smith): Logged field note. Review: https://app.letsgetquoted.com/field/intake/${sampleTaskId}`,
    );
    expect(/^[\x20-\x7E]+$/.test(formatted)).toBe(true);
  });

  it('formats field note confirmation with review URL', () => {
    const text = formatFieldNoteConfirmation('J-104', 'Miller', sampleReviewUrl);
    expect(text).toContain('[LGQ] J-104 (Miller): Logged field note.');
    expect(text).toContain(sampleReviewUrl);
  });

  it('formats field cost confirmation with review URL', () => {
    const text = formatFieldCostConfirmation('J-104', 'Miller', 125.5, 'material', sampleReviewUrl);
    expect(text).toContain('[LGQ] J-104 (Miller): Logged $125.50 material cost.');
    expect(text).toContain(sampleReviewUrl);
  });

  it('formats field task confirmation with review URL', () => {
    const text = formatFieldTaskConfirmation('J-104', 'Miller', 'Install disconnect switch', sampleReviewUrl);
    expect(text).toContain('[LGQ] J-104 (Miller): Added task "Install disconnect switch".');
    expect(text).toContain(sampleReviewUrl);
  });

  it('formats field lead confirmation with review URL', () => {
    const text = formatFieldLeadConfirmation('Robert Johnson', sampleReviewUrl);
    expect(text).toContain('[LGQ] Created new lead for Robert Johnson.');
    expect(text).toContain(sampleReviewUrl);
  });

  it('preserves clean fallback when no review URL is supplied', () => {
    const clean = formatFieldNoteConfirmation('J-101', 'Alice');
    expect(clean).toBe('[LGQ] J-101 (Alice): Logged field note.');
  });
});
