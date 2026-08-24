import { describe, it, expect } from 'vitest';
import {
  buildDepositReminderMessage,
  formatDepositAmount,
  isDepositFollowupDue,
  DEFAULT_DEPOSIT_FOLLOWUP_DAYS,
  MAX_DEPOSIT_FOLLOWUPS,
} from '../src/lib/deposit-followups';

describe('Deposit Follow-ups Engine', () => {
  it('formats deposit amounts correctly into USD currency', () => {
    expect(formatDepositAmount(500)).toBe('$500');
    expect(formatDepositAmount(1250.5)).toBe('$1,250.50');
    expect(formatDepositAmount(0)).toBe('$0');
  });

  it('builds clear, personalized SMS reminder messages by sequence index', () => {
    const ctx = {
      clientName: 'Sarah Connor',
      businessName: 'Apex Plumbing',
      quoteRef: 'Q-101',
      depositAmount: 500,
      payUrl: 'https://pay.example.com/d/123',
      sequenceIndex: 0,
    };

    const firstMsg = buildDepositReminderMessage(ctx);
    expect(firstMsg).toContain('Hi Sarah');
    expect(firstMsg).toContain('Apex Plumbing');
    expect(firstMsg).toContain('$500');
    expect(firstMsg).toContain('https://pay.example.com/d/123');

    const secondMsg = buildDepositReminderMessage({ ...ctx, sequenceIndex: 1 });
    expect(secondMsg).toContain('holding your project window');

    const finalMsg = buildDepositReminderMessage({ ...ctx, sequenceIndex: 2 });
    expect(finalMsg).toContain('need your $500 deposit to hold your crew');
  });

  it('correctly determines when deposit follow-up is due', () => {
    const now = new Date('2026-08-24T12:00:00Z');

    // Just accepted today (0 days ago) -> not due yet (day 1 is target)
    const justAccepted = isDepositFollowupDue({
      acceptedAt: '2026-08-24T10:00:00Z',
      remindersSent: 0,
      now,
    });
    expect(justAccepted.due).toBe(false);

    // Accepted 1 day ago -> first reminder due
    const oneDayAgo = isDepositFollowupDue({
      acceptedAt: '2026-08-23T10:00:00Z',
      remindersSent: 0,
      now,
    });
    expect(oneDayAgo.due).toBe(true);
    expect(oneDayAgo.nextIndex).toBe(0);

    // First reminder already sent today -> not due again
    const alreadySentToday = isDepositFollowupDue({
      acceptedAt: '2026-08-23T10:00:00Z',
      remindersSent: 1,
      lastRemindedAt: '2026-08-24T11:00:00Z',
      now,
    });
    expect(alreadySentToday.due).toBe(false);

    // 3 days ago, 1 reminder already sent -> second reminder due
    const threeDaysAgo = isDepositFollowupDue({
      acceptedAt: '2026-08-21T10:00:00Z',
      remindersSent: 1,
      lastRemindedAt: '2026-08-22T10:00:00Z',
      now,
    });
    expect(threeDaysAgo.due).toBe(true);
    expect(threeDaysAgo.nextIndex).toBe(1);

    // All max reminders sent -> never due
    const maxedOut = isDepositFollowupDue({
      acceptedAt: '2026-08-01T10:00:00Z',
      remindersSent: MAX_DEPOSIT_FOLLOWUPS,
      now,
    });
    expect(maxedOut.due).toBe(false);
  });
});
