import { describe, it, expect } from 'vitest';
import {
  FEED_KIND_ICON,
  FEED_KIND_LABEL,
  INVOICE_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  getFeedDisplayBody,
  getFeedDisplayTitle,
  marginTier,
} from '@/lib/job-detail-labels';
import { formatJobTime } from '@/lib/jobs';

// These labels are shared by the full job page and the pipeline's Focus pane.
// The point of the module is that the two can't describe the same event
// differently, so the tests pin the renamings that aren't obvious from the key.

describe('job feed labels', () => {
  it('renames the events whose kind does not match what happened', () => {
    expect(getFeedDisplayTitle({ kind: 'job_created', title: 'Job created' })).toBe('Quote sent');
    expect(getFeedDisplayTitle({ kind: 'client_link_created', title: 'x' })).toBe('Client view link created');
    expect(getFeedDisplayTitle({ kind: 'client_link_revoked', title: 'x' })).toBe('Client view links revoked');
  });

  it('falls back to the stored title, then to the raw kind', () => {
    expect(getFeedDisplayTitle({ kind: 'payment_paid', title: 'Payment received' })).toBe('Payment received');
    expect(getFeedDisplayTitle({ kind: 'something_new', title: '' })).toBe('something_new');
  });

  it('supplies a body for the two link events that have none', () => {
    expect(getFeedDisplayBody({ kind: 'client_link_created', body: null })).toMatch(/client view link/i);
    expect(getFeedDisplayBody({ kind: 'client_link_revoked', body: null })).toMatch(/revoked/i);
    expect(getFeedDisplayBody({ kind: 'job_update', body: 'Moved to Tuesday' })).toBe('Moved to Tuesday');
  });

  it('has an icon for every labelled kind, so nothing renders a bare fallback', () => {
    // A few kinds are label-only by design (reminders, feedback); the money and
    // invoice events are the ones that must never look anonymous in a timeline.
    const mustHaveIcons = Object.keys(FEED_KIND_LABEL).filter((k) => /payment|invoice|dispute|job_|client_link/.test(k));
    for (const kind of mustHaveIcons) {
      expect(FEED_KIND_ICON[kind], `no icon for ${kind}`).toBeTruthy();
    }
  });

  it('covers every payment and invoice status', () => {
    for (const status of ['requested', 'processing', 'paid', 'failed', 'refunded', 'disputed'] as const) {
      expect(PAYMENT_STATUS_LABEL[status]).toBeTruthy();
    }
    for (const status of ['draft', 'sent', 'signed', 'paid', 'void'] as const) {
      expect(INVOICE_STATUS_LABEL[status]).toBeTruthy();
    }
  });
});

describe('margin tiers', () => {
  it('splits at 35% and 20%', () => {
    expect(marginTier(0.5)).toBe('margin-good');
    expect(marginTier(0.35)).toBe('margin-good');
    expect(marginTier(0.34)).toBe('margin-ok');
    expect(marginTier(0.2)).toBe('margin-ok');
    expect(marginTier(0.19)).toBe('margin-bad');
    expect(marginTier(-0.5)).toBe('margin-bad');
  });
});

describe('scheduled time formatting', () => {
  it('turns a stored clock value into something a person reads', () => {
    // The jobs list was printing scheduled_time verbatim — "Aug 3 · 08:14:00".
    expect(formatJobTime('08:14:00')).toBe('8:14 AM');
    expect(formatJobTime('13:00')).toBe('1:00 PM');
    expect(formatJobTime('00:30')).toBe('12:30 AM');
    expect(formatJobTime('12:00')).toBe('12:00 PM');
    expect(formatJobTime(null)).toBeNull();
    expect(formatJobTime('nonsense')).toBeNull();
  });
});
