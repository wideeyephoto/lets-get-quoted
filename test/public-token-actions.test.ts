import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The three smallest token surfaces: /sub/[token], /schedule/[token] and
 * /review/[token].
 *
 * They are thin by design — each one validates what it can cheaply, hands the
 * token to a lib function that re-resolves it, and sends the visitor onward.
 * Thin is the right shape, and it is still worth pinning, because the mistakes
 * available here are quiet ones: validating an index after the write instead of
 * before it, revalidating a dashboard path from an unauthenticated request, or
 * branching on a review rating.
 */

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string) => {
    // Next's redirect throws to stop the action. A mock that returns instead
    // would let execution fall through and quietly prove the wrong thing.
    const error = new Error(`NEXT_REDIRECT:${path}`);
    (error as Error & { digest: string }).digest = `NEXT_REDIRECT;replace;${path}`;
    throw error;
  }),
  acceptSubcontractorOffer: vi.fn(),
  declineSubcontractorOffer: vi.fn(),
  askSubcontractorQuestion: vi.fn(),
  keepAsBackup: vi.fn(),
  selectScheduleOption: vi.fn(),
  requestDifferentScheduleOptions: vi.fn(),
  recordReviewRating: vi.fn(),
  submitPrivateFeedback: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/lib/auth', () => ({ createAdminClient: () => ({ marker: 'admin-client' }) }));
vi.mock('@/lib/subcontractor-dispatch-data', () => ({
  acceptSubcontractorOffer: mocks.acceptSubcontractorOffer,
  declineSubcontractorOffer: mocks.declineSubcontractorOffer,
  askSubcontractorQuestion: mocks.askSubcontractorQuestion,
  keepAsBackup: mocks.keepAsBackup,
}));
vi.mock('@/lib/scheduling', () => ({
  selectScheduleOption: mocks.selectScheduleOption,
  requestDifferentScheduleOptions: mocks.requestDifferentScheduleOptions,
  selectClientJobScheduleOption: vi.fn(),
  requestDifferentClientJobScheduleOptions: vi.fn(),
}));
vi.mock('@/lib/reviews', () => ({
  recordReviewRating: mocks.recordReviewRating,
  submitPrivateFeedback: mocks.submitPrivateFeedback,
}));

import {
  acceptOfferAction,
  askQuestionAction,
  declineOfferAction,
  keepAsBackupAction,
} from '@/app/sub/[token]/actions';
import {
  requestDifferentScheduleOptionsAction,
  selectScheduleOptionAction,
} from '@/app/schedule/[token]/actions';
import { rateReviewAction, submitFeedbackAction } from '@/app/review/[token]/actions';

const TOKEN = 'public-link-token';

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

/** The path a redirect was sent to, from the error Next would have thrown. */
async function redirectedTo(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('NEXT_REDIRECT:')) return message.slice('NEXT_REDIRECT:'.length);
    throw error;
  }
  throw new Error('Expected a redirect, and the action returned instead.');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.redirect.mockImplementation((path: string) => {
    const error = new Error(`NEXT_REDIRECT:${path}`);
    (error as Error & { digest: string }).digest = `NEXT_REDIRECT;replace;${path}`;
    throw error;
  });
});

describe('a subcontractor answering a dispatch offer', () => {
  it('accepts through the token and refreshes only this token page', async () => {
    await acceptOfferAction(TOKEN);

    expect(mocks.acceptSubcontractorOffer).toHaveBeenCalledWith(TOKEN);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/sub/${TOKEN}`);
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(1);
  });

  it('declines with the reason and the backup flag the form carried', async () => {
    await declineOfferAction(TOKEN, form({ reason: 'Booked that week', backup: 'on' }));

    expect(mocks.declineSubcontractorOffer).toHaveBeenCalledWith(TOKEN, {
      reason: 'Booked that week',
      backup: true,
    });
  });

  it('treats a missing backup checkbox as not wanting to be a backup', async () => {
    await declineOfferAction(TOKEN, form({ reason: 'Booked that week' }));

    expect(mocks.declineSubcontractorOffer).toHaveBeenCalledWith(TOKEN, {
      reason: 'Booked that week',
      backup: false,
    });
  });

  it('passes a question through as text', async () => {
    await askQuestionAction(TOKEN, form({ question: 'Is parking on site?' }));

    expect(mocks.askSubcontractorQuestion).toHaveBeenCalledWith(TOKEN, 'Is parking on site?');
  });

  it('keeps an empty question as an empty string rather than undefined', async () => {
    await askQuestionAction(TOKEN, form({}));

    expect(mocks.askSubcontractorQuestion).toHaveBeenCalledWith(TOKEN, '');
  });

  /**
   * The comment at the top of that module says these actions revalidate only
   * their own page, because revalidating a dashboard path from an
   * unauthenticated request hands a stranger a lever on somebody else's cache.
   * This is the test that makes that a rule rather than a note.
   */
  it.each([
    ['accept', () => acceptOfferAction(TOKEN)],
    ['decline', () => declineOfferAction(TOKEN, form({ reason: 'No' }))],
    ['ask', () => askQuestionAction(TOKEN, form({ question: 'When?' }))],
    ['keep as backup', () => keepAsBackupAction(TOKEN)],
  ])('never revalidates anything but its own page on %s', async (_label, run) => {
    await run();

    for (const [path] of mocks.revalidatePath.mock.calls) {
      expect(path).toBe(`/sub/${TOKEN}`);
    }
  });
});

describe('a customer picking a schedule option', () => {
  it.each(['-1', '3', '1.5', 'two', ''])('refuses the option index %j before any write', async (optionIndex) => {
    await expect(selectScheduleOptionAction(TOKEN, form({ optionIndex }))).rejects.toThrow(
      'Choose a valid schedule option.',
    );

    expect(mocks.selectScheduleOption).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('refuses a submission carrying no option field at all', async () => {
    // Number(null) is 0, so this is the case that would book the first slot
    // for a request that never chose one.
    await expect(selectScheduleOptionAction(TOKEN, form({}))).rejects.toThrow('Choose a valid schedule option.');

    expect(mocks.selectScheduleOption).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2])('accepts option %i and sends the customer to the submitted page', async (optionIndex) => {
    const path = await redirectedTo(() =>
      selectScheduleOptionAction(TOKEN, form({ optionIndex: String(optionIndex), notes: ' Morning is better ' })),
    );

    expect(mocks.selectScheduleOption).toHaveBeenCalledWith(TOKEN, optionIndex, 'Morning is better');
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/schedule/${TOKEN}`);
    expect(path).toBe(`/schedule/${TOKEN}?submitted=1`);
  });

  it('sends no notes rather than an empty string', async () => {
    await redirectedTo(() => selectScheduleOptionAction(TOKEN, form({ optionIndex: '0', notes: '   ' })));

    expect(mocks.selectScheduleOption).toHaveBeenCalledWith(TOKEN, 0, null);
  });

  it('asks for different options through the same token', async () => {
    const path = await redirectedTo(() =>
      requestDifferentScheduleOptionsAction(TOKEN, form({ notes: 'None of these work' })),
    );

    expect(mocks.requestDifferentScheduleOptions).toHaveBeenCalledWith(TOKEN, 'None of these work');
    expect(path).toBe(`/schedule/${TOKEN}?submitted=1`);
  });

  it('does not redirect when the write throws', async () => {
    mocks.selectScheduleOption.mockRejectedValue(new Error('This link has expired.'));

    await expect(selectScheduleOptionAction(TOKEN, form({ optionIndex: '0' }))).rejects.toThrow('This link has expired.');
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe('a customer rating a finished job', () => {
  /**
   * Routing 4-5★ to Google and 1-3★ to a private form is review gating, and
   * this action used to do it. Every rating now lands on the same screen. If a
   * branch ever comes back, these are the cases that fail.
   */
  it.each([1, 2, 3, 4, 5])('sends a %i★ rating to the same screen as every other', async (rating) => {
    const path = await redirectedTo(() => rateReviewAction(TOKEN, rating));

    expect(mocks.recordReviewRating).toHaveBeenCalledWith(expect.anything(), TOKEN, rating);
    expect(path).toBe(`/review/${TOKEN}`);
  });

  it('records the rating before redirecting, not after', async () => {
    mocks.recordReviewRating.mockRejectedValue(new Error('Invite not found'));

    await expect(rateReviewAction(TOKEN, 5)).rejects.toThrow('Invite not found');
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('sends blank feedback back to the form without writing', async () => {
    const path = await redirectedTo(() => submitFeedbackAction(TOKEN, form({ feedback: '   ' })));

    expect(mocks.submitPrivateFeedback).not.toHaveBeenCalled();
    expect(path).toBe(`/review/${TOKEN}?step=feedback`);
  });

  it('stores real feedback and confirms it', async () => {
    const path = await redirectedTo(() =>
      submitFeedbackAction(TOKEN, form({ feedback: '  The crew left a mess.  ' })),
    );

    expect(mocks.submitPrivateFeedback).toHaveBeenCalledWith(expect.anything(), TOKEN, 'The crew left a mess.');
    expect(path).toBe(`/review/${TOKEN}?done=1`);
  });
});
