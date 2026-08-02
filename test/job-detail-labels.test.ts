import { describe, it, expect } from 'vitest';
import {
  FEED_KIND_ICON,
  FEED_KIND_LABEL,
  INVOICE_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  completeJobConfirmMessage,
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

describe('the "Mark Job Completed" confirmation', () => {
  // Completing a job is undoable from the feed. The review request it can
  // trigger is a text to a customer, and is not. So the dialog has to describe
  // what THIS account's settings will actually do — a warning that fires when
  // nothing will happen teaches people to click straight through warnings.
  const base = {
    clientName: 'Dana Whitfield',
    autoReviewRequest: true,
    reviewUrlConfigured: true,
    alreadyRequested: false,
    channel: 'text' as const,
  };

  it('always names the job closing out and the way back', () => {
    for (const over of [{}, { autoReviewRequest: false }, { reviewUrlConfigured: false }, { alreadyRequested: true }]) {
      const message = completeJobConfirmMessage({ ...base, ...over });
      expect(message).toContain('Mark this job complete?');
      expect(message.toLowerCase()).toContain('undo');
    }
  });

  it('warns that a review request goes out, and by which channel', () => {
    const texted = completeJobConfirmMessage(base);
    expect(texted).toContain('Dana Whitfield');
    expect(texted).toContain('texted');
    expect(texted.toLowerCase()).toContain("can't be recalled");

    const emailed = completeJobConfirmMessage({ ...base, channel: 'email' });
    expect(emailed).toContain('emailed');
    expect(emailed).not.toContain('texted');
  });

  it('does not threaten a text when automatic asks are off', () => {
    const message = completeJobConfirmMessage({ ...base, autoReviewRequest: false });
    expect(message).toContain('No review request goes out');
    expect(message).not.toMatch(/will be (texted|emailed)/);
  });

  it('does not promise a send that the missing review link would swallow', () => {
    // deliverJobReviewRequest bails before sending anything when no Google
    // review URL is saved, so the dialog must not say a text is coming.
    const message = completeJobConfirmMessage({ ...base, reviewUrlConfigured: false });
    expect(message).toContain('nothing will be sent');
    expect(message).not.toMatch(/will be (texted|emailed)/);
  });

  it('knows the ask only fires once per job', () => {
    const message = completeJobConfirmMessage({ ...base, alreadyRequested: true });
    expect(message).toMatch(/already been asked/);
    expect(message).not.toMatch(/will be (texted|emailed)/);
  });

  it('says so when there is nowhere to send it', () => {
    const message = completeJobConfirmMessage({ ...base, channel: null });
    expect(message).toMatch(/no mobile or email/);
    expect(message).not.toMatch(/will be (texted|emailed)/);
  });

  it('does not leave a hole where the name goes', () => {
    const message = completeJobConfirmMessage({ ...base, clientName: '   ' });
    expect(message).toContain('the customer');
    expect(message).not.toContain('  will be');
  });
});
