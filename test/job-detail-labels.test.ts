import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FEED_KIND_ICON,
  formatBookedDay,
  FEED_KIND_LABEL,
  INVOICE_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  completeJobReviewSentence,
  completeJobNeedsConfirm,
  isEarlyCompletion,
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

describe('the review sentence on the completion preflight', () => {
  // Completing a job is undoable from the feed. The review request it can
  // trigger is a text to a customer, and is not. So the preflight has to
  // describe what THIS account's settings will actually do — a warning that
  // fires when nothing will happen teaches people to click straight through
  // warnings.
  //
  // It is a lib function rather than prose in the component because six states
  // reach it and three of them look identical from the outside while sending
  // nothing at all.
  const base = {
    clientName: 'Dana Whitfield',
    autoReviewRequest: true,
    reviewUrlConfigured: true,
    alreadyRequested: false,
    channel: 'text' as const,
  };

  it('warns that a review request goes out, and by which channel', () => {
    const texted = completeJobReviewSentence(base);
    expect(texted).toContain('Dana Whitfield');
    expect(texted).toContain('texted');
    expect(texted.toLowerCase()).toContain("can't be recalled");

    const emailed = completeJobReviewSentence({ ...base, channel: 'email' });
    expect(emailed).toContain('emailed');
    expect(emailed).not.toContain('texted');
  });

  it('does not threaten a text when automatic asks are off', () => {
    const message = completeJobReviewSentence({ ...base, autoReviewRequest: false });
    expect(message).toContain('No review request goes out');
    expect(message).not.toMatch(/will be (texted|emailed)/);
  });

  it('does not promise a send that the missing review link would swallow', () => {
    // deliverJobReviewRequest bails before sending anything when no Google
    // review URL is saved, so the preflight must not say a text is coming.
    const message = completeJobReviewSentence({ ...base, reviewUrlConfigured: false });
    expect(message).toContain('nothing will be sent');
    expect(message).not.toMatch(/will be (texted|emailed)/);
  });

  it('knows the ask only fires once per job', () => {
    const message = completeJobReviewSentence({ ...base, alreadyRequested: true });
    expect(message).toMatch(/already been asked/);
    expect(message).not.toMatch(/will be (texted|emailed)/);
  });

  it('says so when there is nowhere to send it', () => {
    const message = completeJobReviewSentence({ ...base, channel: null });
    expect(message).toMatch(/no mobile or email/);
    expect(message).not.toMatch(/will be (texted|emailed)/);
  });

  it('does not leave a hole where the name goes', () => {
    const message = completeJobReviewSentence({ ...base, clientName: '   ' });
    expect(message).toContain('the customer');
    expect(message).not.toContain('  will be');
  });

  it('describes the pill in its own words, not the account setting’s', () => {
    // "Automatic review asks are off" is the wrong explanation for a switch the
    // owner just flicked off themselves two seconds ago.
    const off = completeJobReviewSentence({ ...base, sendReview: false });
    expect(off).toContain('switched off for this one');
    expect(off).not.toContain('automatic review asks are off');

    // ...and the pill overrides the account setting the other way too.
    const on = completeJobReviewSentence({ ...base, autoReviewRequest: false, sendReview: true });
    expect(on).toContain('texted');
    expect(on).toContain('even though automatic asks are off');
  });

  it('will not promise a send the pill cannot actually cause', () => {
    // ON cannot conjure a review link, a channel, or a second ask.
    for (const over of [{ reviewUrlConfigured: false }, { alreadyRequested: true }, { channel: null }]) {
      const message = completeJobReviewSentence({ ...base, autoReviewRequest: false, sendReview: true, ...over });
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

/**
 * Closing a job before the day it was booked for.
 *
 * The date was never consulted. A job scheduled for the 10th could be started,
 * paid and completed on the 9th with no dialog at all — the only thing that
 * could raise one was a pending review text, so with automatic asks off there
 * was nothing between the button and a closed job.
 *
 * A confirm, not a block. Finishing early is ordinary in this trade, and the
 * recurring-plan menu completes a future-dated visit by design; refusing would
 * break a shipped flow to prevent something that is not wrong.
 */
describe('completing a job before its booked day', () => {
  const quiet = {
    clientName: 'Dana Whitfield',
    autoReviewRequest: false,
    reviewUrlConfigured: false,
    alreadyRequested: false,
    channel: null,
    todayKey: '2026-08-09',
  };

  it('is worth stopping to confirm, even when no review goes out', () => {
    expect(completeJobNeedsConfirm({ ...quiet, scheduledFor: '2026-08-10' })).toBe(true);
  });

  it('is not, on the day itself or after it', () => {
    expect(completeJobNeedsConfirm({ ...quiet, scheduledFor: '2026-08-09' })).toBe(false);
    expect(completeJobNeedsConfirm({ ...quiet, scheduledFor: '2026-08-01' })).toBe(false);
  });

  it('is not, on a job with no date at all', () => {
    expect(completeJobNeedsConfirm({ ...quiet, scheduledFor: null })).toBe(false);
  });

  it('stays quiet when the caller has not supplied a clock', () => {
    // Every existing caller predates the two fields. Absent must mean "do not
    // check", never "assume today is the epoch and everything is early".
    expect(completeJobNeedsConfirm({ ...quiet, todayKey: undefined, scheduledFor: '2026-08-10' })).toBe(false);
    expect(isEarlyCompletion({ ...quiet, todayKey: undefined, scheduledFor: '2026-08-10' })).toBe(false);
  });

  it('names the day, and says the booking survives', () => {
    const button = readFileSync(join(process.cwd(), 'src', 'app', 'dashboard', 'jobs', '[id]', 'CompleteJobButton.tsx'), 'utf8');
    expect(formatBookedDay('2026-08-10')).toBe('Mon, Aug 10');
    expect(button).toContain('{formatBookedDay(input.scheduledFor)}');
    expect(button).toContain('closing it early');
    // Completing does not un-book the work, and a preflight implying it did
    // would be describing something that does not happen.
    expect(button).toContain('The date stays on the calendar');
    // And it is behind isEarlyCompletion, so an on-time completion never sees it.
    expect(button).toContain('const early = isEarlyCompletion(input);');
    expect(button).toContain('{early && input.scheduledFor ? (');
  });

  it('says it alongside the review sentence rather than instead of it', () => {
    // Two different irreversible-ish things; the preflight has to carry both or
    // it is trading one surprise for another.
    const button = readFileSync(join(process.cwd(), 'src', 'app', 'dashboard', 'jobs', '[id]', 'CompleteJobButton.tsx'), 'utf8');
    expect(button).toContain('completeJobReviewSentence(input)');
    expect(button.indexOf('closing it early')).toBeLessThan(button.indexOf('completeJobReviewSentence(input)'));
  });
});
