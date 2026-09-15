import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    const err = new Error(`NEXT_REDIRECT:${path}`);
    (err as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${path};307;;`;
    throw err;
  }),
  revalidatePath: vi.fn(),
  headers: vi.fn(async () => new Headers({ 'x-forwarded-for': '127.0.0.1' })),
  createAdminClient: vi.fn(),
  checkRateLimit: vi.fn(),
  checkRateLimitStrict: vi.fn(),
  resolvePortalAccess: vi.fn(),
  submitPortalMessage: vi.fn(),
  setRecurringPlanActive: vi.fn(),
  createJobFeedEvent: vi.fn(),
  getAccountOwnerEmail: vi.fn(),
  sendContractorAlertEmail: vi.fn(),
  requestJobFollowup: vi.fn(),
  resolveJobAccess: vi.fn(),
  chooseOption: vi.fn(),
  respondAsClient: vi.fn(),
  signCustomerFormSubmission: vi.fn(),
  getTrackingByToken: vi.fn(),
  applyHomeownerReply: vi.fn(),
  homeownerReply: vi.fn(),
  acceptSubcontractorOffer: vi.fn(),
  declineSubcontractorOffer: vi.fn(),
  askSubcontractorQuestion: vi.fn(),
  keepAsBackup: vi.fn(),
  selectScheduleOption: vi.fn(),
  requestDifferentScheduleOptions: vi.fn(),
  recordReviewRating: vi.fn(),
  submitPrivateFeedback: vi.fn(),
  parseUnsubscribeToken: vi.fn(),
  suppressEmail: vi.fn(),
  approveClientJobQuote: vi.fn(),
  askQuoteQuestion: vi.fn(),
  updateClientQuoteOptions: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('@/lib/auth', () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  checkRateLimitStrict: mocks.checkRateLimitStrict,
  clientIpFrom: () => '127.0.0.1',
}));
vi.mock('@/lib/client-portal', () => ({ resolvePortalAccess: mocks.resolvePortalAccess }));
vi.mock('@/lib/client-portal-data', () => ({ submitPortalMessage: mocks.submitPortalMessage }));
vi.mock('@/lib/recurring', () => ({ setRecurringPlanActive: mocks.setRecurringPlanActive }));
vi.mock('@/lib/job-feed', () => ({
  createJobFeedEvent: mocks.createJobFeedEvent,
  approveClientJobQuote: mocks.approveClientJobQuote,
}));
vi.mock('@/lib/email', () => ({
  getAccountOwnerEmail: mocks.getAccountOwnerEmail,
  sendContractorAlertEmail: mocks.sendContractorAlertEmail,
}));
vi.mock('@/lib/client-followup-request', () => ({ requestJobFollowup: mocks.requestJobFollowup }));
vi.mock('@/lib/change-order-client', () => ({
  resolveJobAccess: mocks.resolveJobAccess,
  respondAsClient: mocks.respondAsClient,
}));
vi.mock('@/lib/selections-data', () => ({ chooseOption: mocks.chooseOption }));
vi.mock('@/lib/forms/forms-data', () => ({ signCustomerFormSubmission: mocks.signCustomerFormSubmission }));
vi.mock('@/lib/job-tracking', () => ({ getTrackingByToken: mocks.getTrackingByToken }));
vi.mock('@/lib/arrival-send', () => ({ applyHomeownerReply: mocks.applyHomeownerReply }));
vi.mock('@/lib/arrival', () => ({ homeownerReply: mocks.homeownerReply }));
vi.mock('@/lib/subcontractor-dispatch-data', () => ({
  acceptSubcontractorOffer: mocks.acceptSubcontractorOffer,
  declineSubcontractorOffer: mocks.declineSubcontractorOffer,
  askSubcontractorQuestion: mocks.askSubcontractorQuestion,
  keepAsBackup: mocks.keepAsBackup,
}));
vi.mock('@/lib/scheduling', () => ({
  selectScheduleOption: mocks.selectScheduleOption,
  requestDifferentScheduleOptions: mocks.requestDifferentScheduleOptions,
  selectClientJobScheduleOption: mocks.selectScheduleOption,
  requestDifferentClientJobScheduleOptions: mocks.requestDifferentScheduleOptions,
}));
vi.mock('@/lib/reviews', () => ({
  recordReviewRating: mocks.recordReviewRating,
  submitPrivateFeedback: mocks.submitPrivateFeedback,
}));
vi.mock('@/lib/email-suppression', () => ({
  parseUnsubscribeToken: mocks.parseUnsubscribeToken,
  suppressEmail: mocks.suppressEmail,
}));
vi.mock('@/lib/client-question', () => ({ askQuoteQuestion: mocks.askQuoteQuestion }));
vi.mock('@/lib/quote-options-data', () => ({ updateClientQuoteOptions: mocks.updateClientQuoteOptions }));

import {
  sendPortalMessageAction,
  customerTogglePlanAction,
  markPortalMessagesReadAction,
} from '@/app/portal/view/[token]/actions';
import {
  requestJobFollowupAction,
  submitJobFeedbackAction,
  approveClientJobQuoteAction,
} from '@/app/client/jobs/[token]/actions';
import { chooseSelectionAction } from '@/app/client/jobs/[token]/selection-actions';
import { respondToChangeOrderAction } from '@/app/client/jobs/[token]/change-order-actions';
import { signClientFormAction } from '@/app/client/jobs/[token]/form-actions';
import { homeownerReplyAction } from '@/app/track/[token]/actions';
import {
  acceptOfferAction,
  declineOfferAction,
  askQuestionAction,
  keepAsBackupAction,
} from '@/app/sub/[token]/actions';
import {
  selectScheduleOptionAction,
  requestDifferentScheduleOptionsAction,
} from '@/app/schedule/[token]/actions';
import { rateReviewAction, submitFeedbackAction } from '@/app/review/[token]/actions';
import { unsubscribeAction } from '@/app/unsubscribe/actions';

describe('Server Actions: Customer Portal & Token Access', () => {
  let fakeAdmin: any;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeAdmin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        insert: vi.fn().mockResolvedValue({ error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    };
    mocks.createAdminClient.mockReturnValue(fakeAdmin);
    mocks.checkRateLimit.mockResolvedValue(true);
    mocks.checkRateLimitStrict.mockResolvedValue(true);
    mocks.homeownerReply.mockReturnValue(true);
  });

  describe('portal/view/[token]/actions', () => {
    const TOKEN = 'valid-portal-token';

    it('sends portal message and revalidates path on success', async () => {
      mocks.resolvePortalAccess.mockResolvedValue({ accountId: 'acc-1', clientId: 'cli-1' });
      mocks.submitPortalMessage.mockResolvedValue({ ok: true });

      const form = new FormData();
      form.set('message', 'Hello, when are you arriving?');

      const res = await sendPortalMessageAction(TOKEN, form);
      expect(res.ok).toBe(true);
      expect(mocks.submitPortalMessage).toHaveBeenCalledWith(fakeAdmin, {
        accountId: 'acc-1',
        clientId: 'cli-1',
        body: 'Hello, when are you arriving?',
        jobId: null,
      });
      expect(mocks.revalidatePath).toHaveBeenCalledWith(`/portal/view/${TOKEN}`);
    });

    it('toggles recurring plan pause/resume with alert email', async () => {
      mocks.resolvePortalAccess.mockResolvedValue({ accountId: 'acc-1', clientId: 'cli-1' });
      fakeAdmin.from.mockImplementation((table: string) => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: table === 'recurring_plans'
            ? { id: 'plan-1', client_id: 'cli-1', title: 'Monthly AC Filter', last_job_id: 'job-1' }
            : table === 'clients'
            ? { name: 'John Doe', phone: '+15125550100', email: 'john@example.com' }
            : { business_name: 'Super HVAC' },
          error: null,
        }),
      }));
      mocks.getAccountOwnerEmail.mockResolvedValue('owner@hvac.test');

      await customerTogglePlanAction(TOKEN, 'plan-1', false);
      expect(mocks.setRecurringPlanActive).toHaveBeenCalledWith(fakeAdmin, 'acc-1', 'plan-1', false);
      expect(mocks.sendContractorAlertEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientEmail: 'owner@hvac.test',
          heading: 'Recurring Plan Paused',
        }),
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith(`/portal/view/${TOKEN}`);
    });

    it('marks portal messages as read', async () => {
      mocks.resolvePortalAccess.mockResolvedValue({ accountId: 'acc-1', clientId: 'cli-1' });
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });
      fakeAdmin.from.mockReturnValue({ update: updateMock });

      await markPortalMessagesReadAction(TOKEN);
      expect(updateMock).toHaveBeenCalled();
    });
  });

  describe('client/jobs/[token] actions', () => {
    const TOKEN = 'valid-job-token';

    it('requests job followup with attachments', async () => {
      mocks.requestJobFollowup.mockResolvedValue({ ok: true });
      const form = new FormData();
      form.set('category', 'issue');
      form.set('description', 'Leak under sink persists');

      const res = await requestJobFollowupAction(TOKEN, form);
      expect(res.ok).toBe(true);
      expect(mocks.requestJobFollowup).toHaveBeenCalledWith(TOKEN, {
        category: 'issue',
        description: 'Leak under sink persists',
        files: [],
      });
      expect(mocks.revalidatePath).toHaveBeenCalledWith(`/client/jobs/${TOKEN}`);
    });

    it('approves quote with signature', async () => {
      mocks.approveClientJobQuote.mockResolvedValue({ ok: true, requiresDeposit: false });

      const form = new FormData();
      form.set('signerName', 'Alice Homeowner');
      form.set('signaturePath', 'data:image/svg...');

      await expect(approveClientJobQuoteAction(TOKEN, form)).rejects.toThrow(
        `NEXT_REDIRECT:/client/jobs/${TOKEN}?approved=1`,
      );
      expect(mocks.approveClientJobQuote).toHaveBeenCalledWith(
        TOKEN,
        [],
        'Alice Homeowner',
        { path: 'data:image/svg...' },
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith(`/client/jobs/${TOKEN}`);
    });
  });

  describe('selections, change-orders, and form actions', () => {
    const TOKEN = 'job-access-token';

    it('records homeowner material selection', async () => {
      mocks.resolveJobAccess.mockResolvedValue({ accountId: 'acc-1', jobId: 'job-1' });
      mocks.chooseOption.mockResolvedValue({
        ok: true,
        snapshot: { name: 'Matte Black', reference: 'MB-101' },
      });

      const form = new FormData();
      form.set('optionId', 'opt-1');
      form.set('byName', 'Jane Doe');

      const res = await chooseSelectionAction(TOKEN, 'sel-1', form);
      expect(res.ok).toBe(true);
      expect(mocks.chooseOption).toHaveBeenCalledWith(fakeAdmin, 'acc-1', {
        selectionId: 'sel-1',
        optionId: 'opt-1',
        jobId: 'job-1',
        byName: 'Jane Doe',
      });
      expect(mocks.createJobFeedEvent).toHaveBeenCalled();
    });

    it('responds to change order approval', async () => {
      mocks.respondAsClient.mockResolvedValue({ ok: true });

      const form = new FormData();
      form.set('decision', 'approved');
      form.set('signatureName', 'Jane Doe');

      const res = await respondToChangeOrderAction(TOKEN, 'co-1', form);
      expect(res.ok).toBe(true);
      expect(mocks.respondAsClient).toHaveBeenCalledWith(TOKEN, 'co-1', {
        decision: 'approved',
        signatureName: 'Jane Doe',
        declineReason: '',
      });
      expect(mocks.revalidatePath).toHaveBeenCalledWith(`/client/jobs/${TOKEN}`);
    });

    it('e-signs client completion certificate', async () => {
      mocks.resolveJobAccess.mockResolvedValue({ accountId: 'acc-1', jobId: 'job-1' });
      mocks.signCustomerFormSubmission.mockResolvedValue({
        templateSnapshot: { title: 'Certificate of Final Completion' },
      });

      const res = await signClientFormAction(TOKEN, 'sub-1', {
        signaturePath: 'sig-path-data',
        signerName: 'Jane Doe',
      });

      expect(res.success).toBe(true);
      expect(mocks.signCustomerFormSubmission).toHaveBeenCalledWith(
        fakeAdmin,
        'sub-1',
        expect.objectContaining({ signerName: 'Jane Doe' }),
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith(`/client/jobs/${TOKEN}`);
    });
  });

  describe('tracking, subcontractor, and scheduling actions', () => {
    it('applies homeowner arrival reply and redirects', async () => {
      mocks.getTrackingByToken.mockResolvedValue({
        accountId: 'acc-1',
        jobId: 'job-1',
        trackingId: 'trk-1',
        clientFirst: 'Bob',
      });
      mocks.applyHomeownerReply.mockResolvedValue({ ok: true });

      const form = new FormData();
      form.set('reply', 'gate_unlocked');

      await expect(homeownerReplyAction('trk-token', form)).rejects.toThrow(
        'NEXT_REDIRECT:/track/trk-token?said=gate_unlocked',
      );
      expect(mocks.applyHomeownerReply).toHaveBeenCalled();
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/track/trk-token');
    });

    it('accepts and declines subcontractor dispatch offers', async () => {
      await acceptOfferAction('sub-token');
      expect(mocks.acceptSubcontractorOffer).toHaveBeenCalledWith('sub-token');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/sub/sub-token');

      const declineForm = new FormData();
      declineForm.set('reason', 'Fully booked');
      declineForm.set('backup', 'true');

      await declineOfferAction('sub-token', declineForm);
      expect(mocks.declineSubcontractorOffer).toHaveBeenCalledWith('sub-token', {
        reason: 'Fully booked',
        backup: true,
      });
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/sub/sub-token');
    });

    it('selects scheduling appointment option and redirects', async () => {
      const form = new FormData();
      form.set('optionIndex', '1');
      form.set('notes', 'Please call before arrival');

      await expect(selectScheduleOptionAction('sched-token', form)).rejects.toThrow(
        'NEXT_REDIRECT:/schedule/sched-token?submitted=1',
      );
      expect(mocks.selectScheduleOption).toHaveBeenCalledWith('sched-token', 1, 'Please call before arrival');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/schedule/sched-token');
    });
  });

  describe('review and unsubscribe actions', () => {
    it('records review rating and redirects to completion', async () => {
      await expect(rateReviewAction('rev-token', 5)).rejects.toThrow(
        'NEXT_REDIRECT:/review/rev-token',
      );
      expect(mocks.recordReviewRating).toHaveBeenCalledWith(fakeAdmin, 'rev-token', 5);

      const form = new FormData();
      form.set('feedback', 'Excellent work, very prompt!');

      await expect(submitFeedbackAction('rev-token', form)).rejects.toThrow(
        'NEXT_REDIRECT:/review/rev-token?done=1',
      );
      expect(mocks.submitPrivateFeedback).toHaveBeenCalledWith(fakeAdmin, 'rev-token', 'Excellent work, very prompt!');
    });

    it('verifies unsubscribe token and registers suppression', async () => {
      mocks.parseUnsubscribeToken.mockReturnValue({ accountId: 'acc-1', email: 'user@example.com' });
      mocks.suppressEmail.mockResolvedValue(true);

      const form = new FormData();
      form.set('token', 'unsub-token-xyz');

      await expect(unsubscribeAction(form)).rejects.toThrow(
        'NEXT_REDIRECT:/unsubscribe?token=unsub-token-xyz&done=1',
      );
      expect(mocks.suppressEmail).toHaveBeenCalledWith(
        fakeAdmin,
        'acc-1',
        'user@example.com',
        'unsubscribe_link',
      );
    });
  });
});
