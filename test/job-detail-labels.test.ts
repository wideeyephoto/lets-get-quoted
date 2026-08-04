import { describe, it, expect } from 'vitest';
import {
  FEED_KIND_ICON,
  FEED_KIND_LABEL,
  INVOICE_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  completeJobConfirmMessage,
  completeJobNeedsConfirm,
  reviewPillState,
  willAskForReview,
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

  it('describes the pill in its own words, not the account setting’s', () => {
    // "Automatic review asks are off" is the wrong explanation for a switch the
    // owner just flicked off themselves two seconds ago.
    const off = completeJobConfirmMessage({ ...base, sendReview: false });
    expect(off).toContain('switched off for this one');
    expect(off).not.toContain('automatic review asks are off');

    // ...and the pill overrides the account setting the other way too.
    const on = completeJobConfirmMessage({ ...base, autoReviewRequest: false, sendReview: true });
    expect(on).toContain('texted');
    expect(on).toContain('even though automatic asks are off');
  });

  it('will not promise a send the pill cannot actually cause', () => {
    // ON cannot conjure a review link, a channel, or a second ask.
    for (const over of [{ reviewUrlConfigured: false }, { alreadyRequested: true }, { channel: null }]) {
      const message = completeJobConfirmMessage({ ...base, autoReviewRequest: false, sendReview: true, ...over });
      expect(message).not.toMatch(/will be (texted|emailed)/);
    }
  });
});

describe('willAskForReview', () => {
  const base = {
    clientName: 'Dana Whitfield',
    autoReviewRequest: true,
    reviewUrlConfigured: true,
    alreadyRequested: false,
    channel: 'text' as const,
  };

  it('follows the account setting when there is no pill', () => {
    expect(willAskForReview(base)).toBe(true);
    expect(willAskForReview({ ...base, autoReviewRequest: false })).toBe(false);
  });

  it('lets the pill override the account setting both ways', () => {
    expect(willAskForReview({ ...base, sendReview: false })).toBe(false);
    expect(willAskForReview({ ...base, autoReviewRequest: false, sendReview: true })).toBe(true);
  });

  it('never lets the pill override what makes a send impossible', () => {
    // These are not preferences. deliverJobReviewRequest bails on a missing
    // review link, the ask is once per job, and a customer with no mobile and
    // no email cannot be reached at all.
    expect(willAskForReview({ ...base, sendReview: true, reviewUrlConfigured: false })).toBe(false);
    expect(willAskForReview({ ...base, sendReview: true, alreadyRequested: true })).toBe(false);
    expect(willAskForReview({ ...base, sendReview: true, channel: null })).toBe(false);
  });
});

describe('reviewPillState', () => {
  const base = {
    clientName: 'Dana Whitfield',
    autoReviewRequest: true,
    reviewUrlConfigured: true,
    alreadyRequested: false,
    channel: 'text' as const,
  };

  it('starts where the account setting says', () => {
    expect(reviewPillState(base)).toEqual({ canAsk: true, defaultOn: true, channel: 'text' });
    expect(reviewPillState({ ...base, autoReviewRequest: false })).toEqual({ canAsk: true, defaultOn: false, channel: 'text' });
  });

  it('refuses to offer a toggle that could not send anything', () => {
    // An owner who flips a switch to ON and gets nothing has been told
    // something untrue, and they never find out — the send is silent either way.
    expect(reviewPillState({ ...base, reviewUrlConfigured: false }).canAsk).toBe(false);
    expect(reviewPillState({ ...base, alreadyRequested: true }).canAsk).toBe(false);
    expect(reviewPillState({ ...base, channel: null }).canAsk).toBe(false);
  });

  it('says which of the three reasons, because the fixes differ', () => {
    const noLink = reviewPillState({ ...base, reviewUrlConfigured: false });
    expect(noLink.canAsk === false && noLink.reason).toMatch(/review link/i);

    const asked = reviewPillState({ ...base, alreadyRequested: true });
    expect(asked.canAsk === false && asked.reason).toMatch(/already been asked/i);

    const nowhere = reviewPillState({ ...base, channel: null });
    expect(nowhere.canAsk === false && nowhere.reason).toMatch(/no mobile or email/i);
  });

  it('does not leave a hole where the name goes', () => {
    const asked = reviewPillState({ ...base, clientName: '  ', alreadyRequested: true });
    expect(asked.canAsk === false && asked.reason).toContain('the customer');
  });
});

describe('completeJobNeedsConfirm', () => {
  const base = {
    clientName: 'Dana Whitfield',
    autoReviewRequest: true,
    reviewUrlConfigured: true,
    alreadyRequested: false,
    channel: 'text' as const,
  };

  it('asks only when something is about to happen that cannot be undone', () => {
    expect(completeJobNeedsConfirm(base)).toBe(true);
    expect(completeJobNeedsConfirm({ ...base, sendReview: false })).toBe(false);
  });

  it('does not stop a completion that sends nothing', () => {
    // Completion itself is undoable from the feed. A dialog that fires when
    // nothing irreversible is happening is how people learn to click through
    // dialogs — including the one that matters.
    expect(completeJobNeedsConfirm({ ...base, autoReviewRequest: false })).toBe(false);
    expect(completeJobNeedsConfirm({ ...base, reviewUrlConfigured: false })).toBe(false);
    expect(completeJobNeedsConfirm({ ...base, alreadyRequested: true })).toBe(false);
    expect(completeJobNeedsConfirm({ ...base, channel: null })).toBe(false);
  });
});
