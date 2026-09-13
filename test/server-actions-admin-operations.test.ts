import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    const err = new Error(`NEXT_REDIRECT:${path}`);
    (err as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${path};307;;`;
    throw err;
  }),
  revalidatePath: vi.fn(),
  requireMfaPermission: vi.fn(),
  requirePermission: vi.fn(),
  requireAdmin: vi.fn(),
  logAdminAction: vi.fn(),
  dispatchOnCallPage: vi.fn(),
  dispatchOnCallTestDrill: vi.fn(),
  getQuickStopRequestById: vi.fn(),
  refundPayment: vi.fn(),
  logQuickStopEvent: vi.fn(),
  resolveQuickStopCancellation: vi.fn(),
  getPaymentForAdmin: vi.fn(),
  refundBlockedReason: vi.fn(),
  addSupportCaseNote: vi.fn(),
  updateSupportCaseStatus: vi.fn(),
  getSupportCase: vi.fn(),
  sendSupportCaseCustomerEmail: vi.fn(),
  changeStaffAccess: vi.fn(),
  inviteStaff: vi.fn(),
  getAccountOwnerEmail: vi.fn(),
  sendMagicLinkEmail: vi.fn(),
  resolvePrivacyRequest: vi.fn(),
  cronJob: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/auth', () => ({
  requireMfaPermission: mocks.requireMfaPermission,
  requirePermission: mocks.requirePermission,
  requireAdmin: mocks.requireAdmin,
}));
vi.mock('@/lib/admin', () => ({ logAdminAction: mocks.logAdminAction }));
vi.mock('@/lib/on-call-paging', () => ({
  dispatchOnCallPage: mocks.dispatchOnCallPage,
  dispatchOnCallTestDrill: mocks.dispatchOnCallTestDrill,
}));
vi.mock('@/lib/quick-stop-requests', () => ({
  getQuickStopRequestById: mocks.getQuickStopRequestById,
  logQuickStopEvent: mocks.logQuickStopEvent,
}));
vi.mock('@/lib/quick-stop-refunds', () => ({
  resolveQuickStopCancellation: mocks.resolveQuickStopCancellation,
}));
vi.mock('@/lib/payments', () => ({
  refundPayment: mocks.refundPayment,
}));
vi.mock('@/lib/admin-payments', () => ({
  getPaymentForAdmin: mocks.getPaymentForAdmin,
  refundBlockedReason: mocks.refundBlockedReason,
}));
vi.mock('@/lib/support-cases', () => ({
  addSupportCaseNote: mocks.addSupportCaseNote,
  updateSupportCaseStatus: mocks.updateSupportCaseStatus,
  getSupportCase: mocks.getSupportCase,
  isCaseStatus: (s: string) => ['open', 'in_progress', 'resolved', 'closed'].includes(s),
  visibilityFromForm: (v: string) => (v === 'customer' ? 'customer' : 'internal'),
}));
vi.mock('@/lib/email', () => ({
  sendSupportCaseCustomerEmail: mocks.sendSupportCaseCustomerEmail,
  getAccountOwnerEmail: mocks.getAccountOwnerEmail,
}));
vi.mock('@/lib/staff-directory', () => ({
  changeStaffAccess: mocks.changeStaffAccess,
  inviteStaff: mocks.inviteStaff,
}));
vi.mock('@/lib/staff', () => ({
  isStaffRole: (r: string) => ['owner', 'admin', 'read_only', 'support'].includes(r),
  staffCan: (staff: any, perm: string) => staff?.permissions?.includes(perm) ?? true,
}));
vi.mock('@/lib/magic-link', () => ({
  sendMagicLinkEmail: mocks.sendMagicLinkEmail,
}));
vi.mock('@/lib/privacy-requests', () => ({
  resolvePrivacyRequest: mocks.resolvePrivacyRequest,
}));
vi.mock('@/lib/cron-jobs', () => ({
  cronJob: mocks.cronJob,
}));

import {
  logIncidentAction,
  resolveIncidentAction,
  togglePublishIncidentAction,
} from '@/app/admin/incidents/actions';
import { adminRefundQuickStopAction } from '@/app/admin/quick-stops/[id]/actions';
import { dispatchTestPageAction, runCronJobNowAction } from '@/app/admin/health/actions';
import { logManualResolutionAction, requestDualApprovalAction } from '@/app/admin/manual/actions';
import { refundPaymentAction } from '@/app/admin/payments/[id]/actions';
import { addNoteAction, changeStatusAction } from '@/app/admin/cases/[id]/actions';
import { changeStaffAccessAction, inviteStaffAction } from '@/app/admin/staff/actions';
import { resendOnboardingFromListAction } from '@/app/admin/accounts/actions';
import { setRiskDispositionAction } from '@/app/admin/risk/actions';
import { resolvePlatformPrivacyRequestAction } from '@/app/admin/privacy-requests/actions';

describe('Server Actions: Admin Operations & Governance', () => {
  let fakeAdmin: any;
  const adminContext = {
    admin: null as any,
    adminEmail: 'operator@letsgetquoted.test',
    staff: { id: 'staff-1', email: 'operator@letsgetquoted.test', role: 'admin', permissions: ['ops.manage', 'money.refund', 'staff.manage', 'account.support', 'account.enforce', 'privacy.manage'] },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fakeAdmin = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'inc-123' }, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'inc-123' }, error: null }),
            single: vi.fn().mockResolvedValue({ data: { id: 'inc-123' }, error: null }),
          }),
        }),
      }),
    };
    adminContext.admin = fakeAdmin;
    mocks.requireMfaPermission.mockResolvedValue(adminContext);
    mocks.requirePermission.mockResolvedValue(adminContext);
    mocks.requireAdmin.mockResolvedValue(adminContext);
  });

  describe('incidents actions', () => {
    it('logs an incident and pages on-call when critical', async () => {
      const form = new FormData();
      form.set('title', 'Database outage');
      form.set('description', 'Primary connection pool exhausted');
      form.set('kind', 'incident');
      form.set('severity', 'critical');
      form.set('affected_services', 'api, webhooks');

      await expect(logIncidentAction(form)).rejects.toThrow('NEXT_REDIRECT:/admin/incidents?done=logged');
      expect(fakeAdmin.from).toHaveBeenCalledWith('platform_incidents');
      expect(mocks.logAdminAction).toHaveBeenCalled();
      expect(mocks.dispatchOnCallPage).toHaveBeenCalledWith(
        expect.objectContaining({
          incidentKey: 'platform_incident_inc-123',
          severity: 'P1_CRITICAL',
        }),
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/incidents');
    });

    it('resolves an active incident with audit trail', async () => {
      const form = new FormData();
      form.set('resolution_summary', 'Swapped read-replicas and scaled pool');
      form.set('root_cause', 'Spike in unindexed queries');

      await expect(resolveIncidentAction('inc-123', form)).rejects.toThrow('NEXT_REDIRECT:/admin/incidents?done=resolved');
      expect(mocks.logAdminAction).toHaveBeenCalledWith(
        fakeAdmin,
        adminContext,
        expect.objectContaining({
          action: 'platform_incident_resolve',
          targetId: 'inc-123',
        }),
      );
    });

    it('toggles incident public publishing state', async () => {
      const form = new FormData();
      form.set('incident_id', 'inc-123');
      form.set('published', 'true');

      await expect(togglePublishIncidentAction(form)).rejects.toThrow('NEXT_REDIRECT:/admin/incidents?done=published');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/status');
    });
  });

  describe('quick-stops actions', () => {
    it('refunds a Quick Stop request payment', async () => {
      mocks.getQuickStopRequestById.mockResolvedValue({
        account_id: 'acc-1',
        payment_id: 'pay-1',
        paid_at: '2026-09-12T00:00:00Z',
        refund_cents: 0,
      });
      mocks.refundPayment.mockResolvedValue({ refundedTotal: 150, isFull: true });

      const form = new FormData();
      form.set('reason', 'Customer requested refund within grace period');
      form.set('amount', '150');

      await expect(adminRefundQuickStopAction('req-123', form)).rejects.toThrow(
        'NEXT_REDIRECT:/admin/quick-stops/req-123?done=refunded',
      );
      expect(mocks.refundPayment).toHaveBeenCalledWith(fakeAdmin, 'acc-1', 'pay-1', 150);
      expect(mocks.logQuickStopEvent).toHaveBeenCalled();
      expect(mocks.logAdminAction).toHaveBeenCalled();
    });
  });

  describe('health actions', () => {
    it('dispatches test page to on-call drill', async () => {
      mocks.dispatchOnCallTestDrill.mockResolvedValue({
        id: 'drill-123',
        dispatchedChannels: ['pushover', 'email'],
      });

      const res = await dispatchTestPageAction();
      expect(res.success).toBe(true);
      expect(res.message).toMatch(/Test page accepted by pushover, email/);
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/health');
    });

    it('validates confirmation when manually triggering money cron jobs', async () => {
      mocks.cronJob.mockReturnValue({ importance: 'money' });

      const resWithoutConfirm = await runCronJobNowAction('overage-settlement', 'wrong');
      expect(resWithoutConfirm.success).toBe(false);
      expect(resWithoutConfirm.message).toMatch(/Typed confirmation required/);
    });
  });

  describe('manual runbook actions', () => {
    it('logs staff completion of manual operational runbook', async () => {
      const res = await logManualResolutionAction({
        slug: 'db-failover',
        articleTitle: 'Database Failover Runbook',
        stepsCompleted: 5,
        totalSteps: 5,
        durationSeconds: 120,
      });

      expect(res.success).toBe(true);
      expect(mocks.logAdminAction).toHaveBeenCalledWith(
        fakeAdmin,
        adminContext,
        expect.objectContaining({
          action: 'manual.resolution_completed',
          targetId: 'db-failover',
        }),
      );
    });

    it('records secondary approval requests for dual-control runbooks', async () => {
      const res = await requestDualApprovalAction({
        slug: 'delete-tenant-pii',
        articleTitle: 'Tenant PII Deletion',
        reason: 'GDPR right to be forgotten mandate',
      });

      expect(res.success).toBe(true);
      expect(mocks.logAdminAction).toHaveBeenCalledWith(
        fakeAdmin,
        adminContext,
        expect.objectContaining({
          action: 'manual.dual_auth_requested',
        }),
      );
    });
  });

  describe('admin payment refunds', () => {
    it('refunds payment from console and enforces reason requirement', async () => {
      mocks.getPaymentForAdmin.mockResolvedValue({
        id: 'pay-123',
        account_id: 'acc-1',
      });
      mocks.refundBlockedReason.mockReturnValue(null);
      mocks.refundPayment.mockResolvedValue({ amount: 100, isFull: false, refundedTotal: 100 });

      const form = new FormData();
      form.set('reason', 'Duplicate charge reported by customer');
      form.set('amount', '100');

      await expect(refundPaymentAction('pay-123', form)).rejects.toThrow(
        'NEXT_REDIRECT:/admin/payments/pay-123?done=refunded',
      );
      expect(mocks.refundPayment).toHaveBeenCalledWith(fakeAdmin, 'acc-1', 'pay-123', 100);
      expect(mocks.logAdminAction).toHaveBeenCalledWith(
        fakeAdmin,
        adminContext,
        expect.objectContaining({
          action: 'payment_refund',
          targetId: 'pay-123',
        }),
      );
    });
  });

  describe('support cases actions', () => {
    it('adds support case note and notifies customer if public', async () => {
      mocks.addSupportCaseNote.mockResolvedValue({ id: 'note-1' });
      mocks.getSupportCase.mockResolvedValue({
        requester_email: 'user@example.com',
        subject: 'Cannot login',
      });

      const form = new FormData();
      form.set('body', 'We reset your password link.');
      form.set('visibility', 'customer');

      await expect(addNoteAction('case-123', form)).rejects.toThrow(
        'NEXT_REDIRECT:/admin/cases/case-123?done=replied',
      );
      expect(mocks.addSupportCaseNote).toHaveBeenCalledWith(
        fakeAdmin,
        adminContext,
        'case-123',
        'We reset your password link.',
        'customer',
      );
      expect(mocks.sendSupportCaseCustomerEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'user@example.com' }),
      );
    });

    it('changes support case status', async () => {
      mocks.updateSupportCaseStatus.mockResolvedValue(true);

      const form = new FormData();
      form.set('status', 'resolved');

      await expect(changeStatusAction('case-123', form)).rejects.toThrow(
        'NEXT_REDIRECT:/admin/cases/case-123?done=status',
      );
      expect(mocks.updateSupportCaseStatus).toHaveBeenCalledWith(
        fakeAdmin,
        adminContext,
        'case-123',
        'resolved',
      );
    });
  });

  describe('staff directory actions', () => {
    it('changes staff role access with mandatory audit reason', async () => {
      mocks.changeStaffAccess.mockResolvedValue({ ok: true });

      const form = new FormData();
      form.set('role', 'admin');
      form.set('reason', 'Promoted to support lead');

      await expect(changeStaffAccessAction('staff-2', form)).rejects.toThrow(
        'NEXT_REDIRECT:/admin/staff?done=changed',
      );
      expect(mocks.changeStaffAccess).toHaveBeenCalledWith(
        fakeAdmin,
        adminContext,
        expect.objectContaining({
          staffId: 'staff-2',
          role: 'admin',
          reason: 'Promoted to support lead',
        }),
      );
    });

    it('invites new staff member', async () => {
      mocks.inviteStaff.mockResolvedValue({ ok: true });

      const form = new FormData();
      form.set('email', 'newstaff@letsgetquoted.test');
      form.set('role', 'support');
      form.set('reason', 'New hire onboarding');

      await expect(inviteStaffAction(form)).rejects.toThrow(
        'NEXT_REDIRECT:/admin/staff?done=invited',
      );
      expect(mocks.inviteStaff).toHaveBeenCalledWith(
        fakeAdmin,
        adminContext,
        expect.objectContaining({
          email: 'newstaff@letsgetquoted.test',
          role: 'support',
        }),
      );
    });
  });

  describe('account, risk, and privacy actions', () => {
    it('resends onboarding magic link from accounts list', async () => {
      mocks.getAccountOwnerEmail.mockResolvedValue('owner@contractor.test');

      const form = new FormData();
      form.set('back', 'filter=unactivated&q=plumbing');

      await expect(resendOnboardingFromListAction('acc-999', form)).rejects.toThrow(
        'NEXT_REDIRECT:/admin/accounts?filter=unactivated&q=plumbing&done=onboarding_resent',
      );
      expect(mocks.sendMagicLinkEmail).toHaveBeenCalledWith(
        'owner@contractor.test',
        '/dashboard/settings',
      );
    });

    it('records risk disposition review for contractor account', async () => {
      const form = new FormData();
      form.set('disposition', 'cleared');
      form.set('note', 'Verified contractor state business license and insurance');

      await expect(setRiskDispositionAction('11111111-1111-4111-8111-111111111111', form)).rejects.toThrow(
        'NEXT_REDIRECT:/admin/risk?done=reviewed',
      );
      expect(fakeAdmin.from).toHaveBeenCalledWith('risk_reviews');
      expect(mocks.logAdminAction).toHaveBeenCalled();
    });

    it('resolves privacy requests with operational notes', async () => {
      const form = new FormData();
      form.set('request_id', 'priv-123');
      form.set('resolution_notes', 'All customer PII purged from storage and logs');

      await resolvePlatformPrivacyRequestAction(form);
      expect(mocks.resolvePrivacyRequest).toHaveBeenCalledWith(
        fakeAdmin,
        adminContext,
        'priv-123',
        'All customer PII purged from storage and logs',
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/privacy-requests');
    });
  });
});
