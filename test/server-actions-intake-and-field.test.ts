import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    const err = new Error(`NEXT_REDIRECT:${path}`);
    (err as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${path};307;;`;
    throw err;
  }),
  revalidatePath: vi.fn(),
  cookies: vi.fn(() => ({ set: vi.fn(), get: vi.fn() })),
  headers: vi.fn(async () => new Headers({ 'x-forwarded-for': '127.0.0.1', 'user-agent': 'vitest-agent' })),
  createAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  requireOwnerContext: vi.fn(),
  requireCrewContext: vi.fn(),
  checkRateLimitStrict: vi.fn(),
  getQuickStopRequestById: vi.fn(),
  logQuickStopEvent: vi.fn(),
  resolveQuickStopCancellation: vi.fn(),
  sendContactMessageEmail: vi.fn(),
  getOrCreateSite: vi.fn(),
  generateSiteTextAction: vi.fn(),
  siteIsUnwritten: vi.fn(),
  applyGeneratedSiteText: vi.fn(),
  saveFormTemplate: vi.fn(),
  deleteFormTemplate: vi.fn(),
  getFormTemplate: vi.fn(),
  getTimeClockMode: vi.fn(),
  setTimeClockMode: vi.fn(),
  sendCrewMagicLink: vi.fn(),
  sendMagicLink: vi.fn(),
  cancelAccountClosure: vi.fn(),
  savePushSubscription: vi.fn(),
  deletePushSubscription: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  unstable_rethrow: (e: unknown) => {
    const d = (e as { digest?: unknown })?.digest;
    if (typeof d === 'string' && d.startsWith('NEXT_REDIRECT')) throw e;
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/headers', () => ({
  cookies: mocks.cookies,
  headers: mocks.headers,
}));
vi.mock('@/lib/auth', () => ({
  createAdminClient: mocks.createAdminClient,
  requireOwnerContext: mocks.requireOwnerContext,
}));
vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock('@/lib/crew-auth', () => ({
  requireCrewContext: mocks.requireCrewContext,
  sendCrewMagicLink: mocks.sendCrewMagicLink,
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitStrict: mocks.checkRateLimitStrict,
  clientIpFrom: () => '127.0.0.1',
}));
vi.mock('@/lib/quick-stop-requests', () => ({
  getQuickStopRequestById: mocks.getQuickStopRequestById,
  logQuickStopEvent: mocks.logQuickStopEvent,
}));
vi.mock('@/lib/support-cases', () => ({
  createSupportCase: vi.fn().mockResolvedValue({ id: 'case-1' }),
  addSupportCaseNote: vi.fn().mockResolvedValue({ id: 'note-1' }),
}));
vi.mock('@/lib/quick-stop-refunds', () => ({
  resolveQuickStopCancellation: mocks.resolveQuickStopCancellation,
}));
vi.mock('@/lib/email', () => ({
  sendContactMessageEmail: mocks.sendContactMessageEmail,
}));
vi.mock('@/lib/sites', () => ({
  getOrCreateSite: mocks.getOrCreateSite,
}));
vi.mock('@/lib/site-seed', () => ({
  siteIsUnwritten: mocks.siteIsUnwritten,
  applyGeneratedSiteText: mocks.applyGeneratedSiteText,
}));
vi.mock('@/app/dashboard/sites/actions', () => ({
  generateSiteTextAction: mocks.generateSiteTextAction,
}));
vi.mock('@/lib/forms/forms-data', () => ({
  saveFormTemplate: mocks.saveFormTemplate,
  deleteFormTemplate: mocks.deleteFormTemplate,
  getFormTemplate: mocks.getFormTemplate,
}));
vi.mock('@/lib/time-clock-data', () => ({
  getTimeClockMode: mocks.getTimeClockMode,
  setTimeClockMode: mocks.setTimeClockMode,
}));
vi.mock('@/lib/magic-link', () => ({
  sendMagicLinkEmail: mocks.sendMagicLink,
}));
vi.mock('@/lib/recoverable-deletions', () => ({
  cancelAccountClosure: mocks.cancelAccountClosure,
}));
vi.mock('@/lib/push', () => ({
  savePushSubscription: mocks.savePushSubscription,
  deletePushSubscription: mocks.deletePushSubscription,
}));

import {
  customerCancelQuickStopAction,
  reportNoShowQuickStopAction,
  acceptRevisedWindowQuickStopAction,
} from '@/app/quick-stop/[id]/actions';
import { submitContactMessage } from '@/app/contact/actions';
import { seedSiteFromFirstRunAction } from '@/app/welcome/seed-actions';
import { settleReferralAction, unsettleReferralAction } from '@/app/dashboard/marketing/referrals/actions';
import { saveTemplateAction, deleteTemplateAction, cloneTemplateAction } from '@/app/dashboard/forms/actions';
import { setTimeClockModeAction, saveLaborSettingsAction } from '@/app/dashboard/crew/settings-actions';
import { sendCrewMagicLinkAction } from '@/app/field/login/actions';
import { sendMagicLinkAction } from '@/app/login/actions';
import { reactivateAccountAction } from '@/app/recover-account/actions';
import { subscribeToPushAction, unsubscribeFromPushAction } from '@/app/field/push-actions';

describe('Server Actions: Intake, Field & Account Operations', () => {
  let fakeAdmin: any;
  let fakeSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeAdmin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    };
    const updateChain = {
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [{ id: 'lead-1' }], error: null }),
      then: (resolve: any) => resolve({ error: null }),
    };

    fakeSupabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue(updateChain),
      }),
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'usr-1', email: 'owner@example.com' } },
        }),
      },
    };

    mocks.createAdminClient.mockReturnValue(fakeAdmin);
    mocks.createSupabaseServerClient.mockResolvedValue(fakeSupabase);
    mocks.checkRateLimitStrict.mockResolvedValue(true);
    mocks.requireOwnerContext.mockResolvedValue({
      accountId: 'acc-1',
      userId: 'usr-1',
      supabase: fakeSupabase,
    });
    mocks.requireCrewContext.mockResolvedValue({
      accountId: 'acc-1',
      crew: { id: 'crew-1' },
    });
  });

  describe('quick-stop/[id] actions', () => {
    it('cancels customer quick stop request within allowed state', async () => {
      mocks.getQuickStopRequestById.mockResolvedValue({
        account_id: 'acc-1',
        status: 'confirmed',
      });

      await expect(customerCancelQuickStopAction('qs-1')).rejects.toThrow(
        'NEXT_REDIRECT:/quick-stop/qs-1?done=canceled',
      );
      expect(mocks.resolveQuickStopCancellation).toHaveBeenCalledWith(
        fakeAdmin,
        'acc-1',
        'qs-1',
        expect.objectContaining({ kind: 'customer_cancel' }),
      );
    });

    it('reports no-show within grace window', async () => {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      mocks.getQuickStopRequestById.mockResolvedValue({
        account_id: 'acc-1',
        status: 'confirmed',
        arrived_at: null,
        arrival_date: today,
        arrival_end: '23:59',
      });

      await expect(reportNoShowQuickStopAction('qs-1')).rejects.toThrow(
        'NEXT_REDIRECT:/quick-stop/qs-1?done=no_show',
      );
      expect(mocks.resolveQuickStopCancellation).toHaveBeenCalledWith(
        fakeAdmin,
        'acc-1',
        'qs-1',
        expect.objectContaining({ kind: 'no_show' }),
      );
    });

    it('accepts revised arrival window', async () => {
      mocks.getQuickStopRequestById.mockResolvedValue({
        account_id: 'acc-1',
        status: 'confirmed',
        proposed_arrival_date: '2026-09-13',
        proposed_arrival_start: '09:00',
        proposed_arrival_end: '11:00',
      });

      await expect(acceptRevisedWindowQuickStopAction('qs-1')).rejects.toThrow(
        'NEXT_REDIRECT:/quick-stop/qs-1?done=window_accepted',
      );
    });
  });

  describe('contact actions', () => {
    it('drops honeypot submissions silently without error', async () => {
      const form = new FormData();
      form.set('company', 'Spam Bot LLC'); // honeypot
      form.set('message', 'Buy backlinks now');

      const res = await submitContactMessage(form);
      expect(res).toEqual({ ok: true });
      expect(mocks.sendContactMessageEmail).not.toHaveBeenCalled();
    });

    it('processes legitimate contact messages and creates support cases', async () => {
      const form = new FormData();
      form.set('name', 'Bob Contractor');
      form.set('email', 'bob@example.com');
      form.set('message', 'Need help setting up pricing tiers');

      const res = await submitContactMessage(form);
      expect(res.ok).toBe(true);
      expect(mocks.sendContactMessageEmail).toHaveBeenCalled();
    });
  });

  describe('welcome seed actions', () => {
    it('skips build when site is already written', async () => {
      mocks.getOrCreateSite.mockResolvedValue({ id: 'site-1', headline: 'Existing Site' });
      mocks.siteIsUnwritten.mockReturnValue(false);

      const res = await seedSiteFromFirstRunAction();
      expect(res).toEqual({ ok: true, built: false, reason: 'already_written' });
    });

    it('generates and applies initial website copy for new account', async () => {
      const site = { id: 'site-1', headline: null };
      mocks.getOrCreateSite.mockResolvedValue(site);
      mocks.siteIsUnwritten.mockReturnValue(true);
      mocks.generateSiteTextAction.mockResolvedValue({ headline: 'Fast Expert Plumbing in Austin' });
      mocks.applyGeneratedSiteText.mockReturnValue({ headline: 'Fast Expert Plumbing in Austin' });

      const res = await seedSiteFromFirstRunAction();
      expect(res).toEqual({ ok: true, built: true });
    });
  });

  describe('marketing referrals actions', () => {
    it('settles referrals across lead and quick stop tables', async () => {
      const form = new FormData();
      form.set('leadIds', 'lead-1, lead-2');

      await settleReferralAction(form);
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/marketing/referrals');
    });

    it('unsettles previously stamped referrals', async () => {
      const form = new FormData();
      form.set('leadIds', 'lead-1');

      await unsettleReferralAction(form);
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/marketing/referrals');
    });
  });

  describe('dashboard forms actions', () => {
    it('saves custom form template', async () => {
      mocks.saveFormTemplate.mockResolvedValue({ id: 'tmpl-1' });

      const res = await saveTemplateAction({ id: 'tmpl-1', title: 'Work Order' } as any);
      expect(res).toEqual({ success: true, id: 'tmpl-1' });
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/forms');
    });

    it('deletes form template', async () => {
      const res = await deleteTemplateAction('tmpl-1');
      expect(res).toEqual({ success: true });
      expect(mocks.deleteFormTemplate).toHaveBeenCalledWith(fakeSupabase, 'acc-1', 'tmpl-1');
    });

    it('clones existing form template', async () => {
      mocks.getFormTemplate.mockResolvedValue({
        id: 'tmpl-1',
        title: 'Original Inspection',
        fields: [],
      });
      mocks.saveFormTemplate.mockResolvedValue({ id: 'tmpl-copy' });

      const res = await cloneTemplateAction('tmpl-1');
      expect(res).toEqual({ success: true, id: 'tmpl-copy' });
    });
  });

  describe('crew settings and time clock actions', () => {
    it('updates time clock mode when changed', async () => {
      mocks.getTimeClockMode.mockResolvedValue('off');

      const form = new FormData();
      form.set('timeClockMode', 'required');

      await setTimeClockModeAction(form);
      expect(mocks.setTimeClockMode).toHaveBeenCalledWith(fakeSupabase, 'acc-1', 'required');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/crew');
    });

    it('saves labor pay settings', async () => {
      const form = new FormData();
      form.set('payDelayDays', '7');
      form.set('payWeekday', '5');

      await saveLaborSettingsAction(form);
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/crew');
    });
  });

  describe('auth, recovery, and push actions', () => {
    it('sends magic link to valid email', async () => {
      await sendMagicLinkAction('owner@plumbing.test');
      expect(mocks.sendMagicLink).toHaveBeenCalledWith('owner@plumbing.test', '/dashboard');
    });

    it('sends crew magic link to registered member', async () => {
      await sendCrewMagicLinkAction('crew@plumbing.test');
      expect(mocks.sendCrewMagicLink).toHaveBeenCalledWith('crew@plumbing.test', 'your team');
    });

    it('reactivates account for verified workspace owner', async () => {
      fakeAdmin.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { role: 'owner' },
                error: null,
              }),
            }),
          }),
        }),
      });

      const form = new FormData();
      form.set('accountId', 'acc-1');

      await expect(reactivateAccountAction(form)).rejects.toThrow(
        'NEXT_REDIRECT:/dashboard?reactivated=1',
      );
      expect(mocks.cancelAccountClosure).toHaveBeenCalled();
    });

    it('manages crew push notification subscriptions', async () => {
      const sub = { endpoint: 'https://push.test/123', keys: { p256dh: 'k', auth: 'a' } };
      await subscribeToPushAction(sub);
      expect(mocks.savePushSubscription).toHaveBeenCalledWith('acc-1', 'crew-1', sub, 'vitest-agent');

      await unsubscribeFromPushAction('https://push.test/123');
      expect(mocks.deletePushSubscription).toHaveBeenCalledWith('https://push.test/123');
    });
  });
});
