import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${url};307;;`;
    throw err;
  }),
  requireMfaPermission: vi.fn(),
  requirePermission: vi.fn(),
  logAdminAction: vi.fn(),
  issueAccountCredit: vi.fn(),
  getAccountOwnerEmail: vi.fn(() => Promise.resolve('owner@apex.com' as string | null)),
  sendMagicLinkEmail: vi.fn(),
  sendMessagingApplicationStatusEmail: vi.fn(() => Promise.resolve()),
  addAccountNote: vi.fn(),
  addAccountTag: vi.fn(),
  removeAccountTag: vi.fn(),
  uploadAccountAttachment: vi.fn(),
  deleteAccountAttachment: vi.fn(),
  isAttachmentFile: vi.fn((f: any) => Boolean(f)),
  logPrivacyRequest: vi.fn(),
  resolvePrivacyRequest: vi.fn(),
  isPrivacyRequestKind: vi.fn((k: string) => ['export', 'deletion', 'correction'].includes(k)),
  isAccountFlag: vi.fn((f: string) => ['auto_review_requests', 'connect_onboarded'].includes(f)),
  readAccountCustomDomains: vi.fn(() => Promise.resolve(['apexroofing.com'])),
  releaseCustomDomains: vi.fn(),
  requestAccountClosure: vi.fn(() => Promise.resolve({ jobId: 'close-job-1' })),
  // Messaging provisioning
  logMessagingRegistrationActionFailure: vi.fn(() => 'corr-12345'),
  loadAdminMessagingRegistrationApplication: vi.fn(),
  loadMessagingComplianceVerification: vi.fn(),
  loadMessagingNumberPurchasePolicy: vi.fn(),
  messagingNumberPurchaseConfirmation: vi.fn((num: string, pol: any) => `CONFIRM PURCHASE ${num}`),
  minutesUntilCampaignAssignment: vi.fn(() => 0),
  purchaseMessagingNumber: vi.fn(),
  reconcileMessagingNumberAssignment: vi.fn(),
  recordMessagingComplianceVerification: vi.fn(),
  requireProvisioningMutationEnabled: vi.fn(),
  requireSignalWireProviderProvisioningReadiness: vi.fn(),
  resolveIndeterminateMessagingNumberOperation: vi.fn(),
  reviewMessagingRegistrationApplication: vi.fn(),
  configureMessagingNumberInbound: vi.fn(),
  assignMessagingNumberCampaign: vi.fn(),
  searchAndRecordMessagingNumberCandidate: vi.fn(),
  setMessagingNumberPurchasePolicy: vi.fn(),
  verifySignalWireCampaignBinding: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('@/lib/auth', () => ({
  requireMfaPermission: mocks.requireMfaPermission,
  requirePermission: mocks.requirePermission,
}));

vi.mock('@/lib/admin', () => ({
  logAdminAction: mocks.logAdminAction,
  issueAccountCredit: mocks.issueAccountCredit,
}));

vi.mock('@/lib/email', () => ({
  getAccountOwnerEmail: mocks.getAccountOwnerEmail,
  sendMessagingApplicationStatusEmail: mocks.sendMessagingApplicationStatusEmail,
}));

vi.mock('@/lib/magic-link', () => ({
  sendMagicLinkEmail: mocks.sendMagicLinkEmail,
}));

vi.mock('@/lib/account-notes', () => ({
  addAccountNote: mocks.addAccountNote,
  addAccountTag: mocks.addAccountTag,
  removeAccountTag: mocks.removeAccountTag,
}));

vi.mock('@/lib/account-attachments', () => ({
  uploadAccountAttachment: mocks.uploadAccountAttachment,
  deleteAccountAttachment: mocks.deleteAccountAttachment,
  isAttachmentFile: mocks.isAttachmentFile,
}));

vi.mock('@/lib/privacy-requests', () => ({
  logPrivacyRequest: mocks.logPrivacyRequest,
  resolvePrivacyRequest: mocks.resolvePrivacyRequest,
  isPrivacyRequestKind: mocks.isPrivacyRequestKind,
}));

vi.mock('@/lib/account-flags', () => ({
  isAccountFlag: mocks.isAccountFlag,
}));

vi.mock('@/lib/custom-domain-release', () => ({
  readAccountCustomDomains: mocks.readAccountCustomDomains,
  releaseCustomDomains: mocks.releaseCustomDomains,
}));

vi.mock('@/lib/account-closure-orchestrator', () => ({
  requestAccountClosure: mocks.requestAccountClosure,
}));

vi.mock('@/lib/messaging-registration-action-failure', () => ({
  logMessagingRegistrationActionFailure: mocks.logMessagingRegistrationActionFailure,
}));

vi.mock('@/lib/messaging-number-provisioning', () => ({
  assignMessagingNumberCampaign: mocks.assignMessagingNumberCampaign,
  configureMessagingNumberInbound: mocks.configureMessagingNumberInbound,
  loadAdminMessagingRegistrationApplication: mocks.loadAdminMessagingRegistrationApplication,
  loadMessagingComplianceVerification: mocks.loadMessagingComplianceVerification,
  loadMessagingNumberPurchasePolicy: mocks.loadMessagingNumberPurchasePolicy,
  messagingNumberPurchaseConfirmation: mocks.messagingNumberPurchaseConfirmation,
  minutesUntilCampaignAssignment: mocks.minutesUntilCampaignAssignment,
  purchaseMessagingNumber: mocks.purchaseMessagingNumber,
  reconcileMessagingNumberAssignment: mocks.reconcileMessagingNumberAssignment,
  recordMessagingComplianceVerification: mocks.recordMessagingComplianceVerification,
  requireProvisioningMutationEnabled: mocks.requireProvisioningMutationEnabled,
  requireSignalWireProviderProvisioningReadiness: mocks.requireSignalWireProviderProvisioningReadiness,
  resolveIndeterminateMessagingNumberOperation: mocks.resolveIndeterminateMessagingNumberOperation,
  reviewMessagingRegistrationApplication: mocks.reviewMessagingRegistrationApplication,
  searchAndRecordMessagingNumberCandidate: mocks.searchAndRecordMessagingNumberCandidate,
  setMessagingNumberPurchasePolicy: mocks.setMessagingNumberPurchasePolicy,
  SupabaseMessagingNumberOperationStore: vi.fn(),
  verifySignalWireCampaignBinding: mocks.verifySignalWireCampaignBinding,
}));

vi.mock('@/lib/signalwire-number-provisioning', () => ({
  SignalWireNumberProvisioningClient: {
    fromEnvironment: vi.fn(() => ({})),
  },
}));

import {
  suspendAccountAction,
  unsuspendAccountAction,
  issueAccountCreditAction,
  lockQuickStopAction,
  unlockQuickStopAction,
  resetVerificationAction,
  setLegalHoldAction,
  removeLegalHoldAction,
  restrictPayoutsAction,
  unrestrictPayoutsAction,
  resendOnboardingAction,
  setAccountSyntheticAction,
  signOutAllSessionsAction,
  setAccountFlagAction,
  addAccountNoteAction,
  addAccountTagAction,
  removeAccountTagAction,
  uploadAccountAttachmentAction,
  deleteAccountAttachmentAction,
  logPrivacyRequestAction,
  resolvePrivacyRequestAction,
  deleteAccountAction,
  closeAndAnonymizeAccountAction,
} from '@/app/admin/accounts/[id]/actions';

import {
  reviewMessagingApplicationAction,
  recordMessagingComplianceVerificationAction,
  searchMessagingNumberCandidateAction,
  purchaseMessagingNumberAction,
  configureMessagingInboundAction,
  assignMessagingCampaignAction,
  reconcileMessagingAssignmentAction,
  resolveMessagingNumberOperationAction,
  setMessagingNumberSpendPolicyAction,
} from '@/app/admin/messaging/registrations/actions';

function createMockSupabase(initialData: Record<string, any> = {}) {
  const store: Record<string, any> = { ...initialData };

  const chainable = (result: any = { data: null, error: null }) => {
    const chain: any = {
      select: vi.fn(() => chain),
      insert: vi.fn(() => chain),
      update: vi.fn(() => chain),
      upsert: vi.fn(() => chain),
      delete: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      neq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      is: vi.fn(() => chain),
      single: vi.fn(() =>
        Promise.resolve({
          data: Array.isArray(result?.data) ? result.data[0] ?? null : result?.data ?? null,
          error: result?.error ?? null,
        }),
      ),
      maybeSingle: vi.fn(() =>
        Promise.resolve({
          data: Array.isArray(result?.data) ? result.data[0] ?? null : result?.data ?? null,
          error: result?.error ?? null,
        }),
      ),
      then: (resolve: (val: any) => any) => Promise.resolve(result).then(resolve),
    };
    return chain;
  };

  return {
    from: vi.fn((table: string) => {
      if (store[table]) return chainable(store[table]);
      return chainable({ data: [], error: null });
    }),
    auth: {
      admin: {
        updateUserById: vi.fn(() => Promise.resolve({ error: null })),
        deleteUser: vi.fn(() => Promise.resolve({ error: null })),
      },
    },
  };
}

describe('Group 3: Admin Accounts and Messaging Registrations Actions', () => {
  const accountId = 'acc-adm-001';
  const adminEmail = 'superadmin@apex.com';
  const userId = 'usr-admin-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. ADMIN ACCOUNT ACTIONS
  // =========================================================================
  describe('Admin Account Operations', () => {
    it('suspendAccountAction and unsuspendAccountAction require confirmation and log action', async () => {
      const mockDb = createMockSupabase({
        accounts: { data: { suspended_at: null, suspended_reason: null } },
      });
      mocks.requireMfaPermission.mockResolvedValue({ admin: mockDb, adminEmail, userId });

      // Suspend without confirmation redirects to error
      const form1 = new FormData();
      form1.set('reason', 'Payment fraud investigation');
      await expect(suspendAccountAction(accountId, form1)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?error=confirm');

      // Suspend with valid confirmation
      form1.set('confirm', 'SUSPEND');
      await expect(suspendAccountAction(accountId, form1)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?done=suspended');
      expect(mocks.logAdminAction).toHaveBeenCalledWith(
        mockDb,
        expect.any(Object),
        expect.objectContaining({ action: 'account_suspend', accountId }),
      );

      // Unsuspend
      const form2 = new FormData();
      form2.set('reason', 'Cleared fraud check');
      await expect(unsuspendAccountAction(accountId, form2)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?done=unsuspended');
      expect(mocks.logAdminAction).toHaveBeenCalledWith(
        mockDb,
        expect.any(Object),
        expect.objectContaining({ action: 'account_unsuspend', accountId }),
      );
    });

    it('issueAccountCreditAction validates amount and calls issueAccountCredit', async () => {
      const mockDb = createMockSupabase();
      mocks.requireMfaPermission.mockResolvedValue({ admin: mockDb, adminEmail, userId });

      // Invalid amount
      const form1 = new FormData();
      form1.set('amount', 'invalid');
      form1.set('reason', 'Goodwill credit');
      await expect(issueAccountCreditAction(accountId, form1)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?error=amount');

      // Valid amount
      form1.set('amount', '50.00');
      await expect(issueAccountCreditAction(accountId, form1)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?done=credit');
      expect(mocks.issueAccountCredit).toHaveBeenCalledWith(
        mockDb,
        expect.any(Object),
        expect.objectContaining({ amountCents: 5000, reason: 'Goodwill credit' }),
      );
    });

    it('lockQuickStopAction and unlockQuickStopAction toggle lock window', async () => {
      const mockDb = createMockSupabase();
      mocks.requireMfaPermission.mockResolvedValue({ admin: mockDb, adminEmail, userId });

      // Lock
      const form1 = new FormData();
      form1.set('days', '14');
      form1.set('reason', 'Exceeded rapid booking limit');
      await expect(lockQuickStopAction(accountId, form1)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?done=es_locked');

      // Unlock
      const form2 = new FormData();
      form2.set('reason', 'Operator override');
      await expect(unlockQuickStopAction(accountId, form2)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?done=es_unlocked');
    });

    it('resetVerificationAction, setLegalHoldAction, removeLegalHoldAction update compliance status', async () => {
      const mockDb = createMockSupabase();
      mocks.requireMfaPermission.mockResolvedValue({ admin: mockDb, adminEmail, userId });

      // Reset verification requires confirmation
      const rForm = new FormData();
      rForm.set('reason', 'Bank changed');
      rForm.set('confirm', 'RESET');
      await expect(resetVerificationAction(accountId, rForm)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?done=reset_verification');

      // Set legal hold
      const lhForm = new FormData();
      lhForm.set('reason', 'Subpoena received');
      lhForm.set('confirm', 'LEGAL_HOLD');
      await expect(setLegalHoldAction(accountId, lhForm)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?done=legal_hold_set');

      // Remove legal hold
      const rmLhForm = new FormData();
      rmLhForm.set('reason', 'Litigation closed');
      await expect(removeLegalHoldAction(accountId, rmLhForm)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?done=legal_hold_lifted');
    });

    it('restrictPayoutsAction and unrestrictPayoutsAction control payouts', async () => {
      const mockDb = createMockSupabase();
      mocks.requireMfaPermission.mockResolvedValue({ admin: mockDb, adminEmail, userId });

      const form1 = new FormData();
      form1.set('reason', 'Suspect chargeback volume');
      form1.set('confirm', 'RESTRICT');
      await expect(restrictPayoutsAction(accountId, form1)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?done=payouts_restricted');

      const form2 = new FormData();
      form2.set('reason', 'Funds released after review');
      await expect(unrestrictPayoutsAction(accountId, form2)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?done=payouts_unrestricted');
    });

    it('resendOnboardingAction, setAccountSyntheticAction, signOutAllSessionsAction work properly', async () => {
      const mockDb = createMockSupabase({
        accounts: { data: { test_marker: null } },
        memberships: { data: [{ user_id: 'usr-sub-1' }] },
      });
      mocks.requirePermission.mockResolvedValue({ admin: mockDb, adminEmail, userId });
      mocks.requireMfaPermission.mockResolvedValue({ admin: mockDb, adminEmail, userId });

      // Resend onboarding
      await expect(resendOnboardingAction(accountId)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?done=onboarding_resent');
      expect(mocks.sendMagicLinkEmail).toHaveBeenCalledWith('owner@apex.com', '/dashboard/settings');

      // Set synthetic
      const synForm = new FormData();
      synForm.set('reason', 'Staging account testing');
      synForm.set('synthetic', 'true');
      await expect(setAccountSyntheticAction(accountId, synForm)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?done=marked_synthetic');

      // Sign out all sessions
      const signoutForm = new FormData();
      signoutForm.set('reason', 'Account compromised report');
      signoutForm.set('confirm', 'SIGN OUT');
      await expect(signOutAllSessionsAction(accountId, signoutForm)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?done=signed_out');
      expect(mockDb.auth.admin.updateUserById).toHaveBeenCalledWith('usr-sub-1', { ban_duration: '24h' });
    });

    it('setAccountFlagAction toggles valid account flags and logs audit', async () => {
      const mockDb = createMockSupabase({
        accounts: { data: { auto_review_requests: false } },
      });
      mocks.requirePermission.mockResolvedValue({ admin: mockDb, adminEmail, userId });

      // Invalid flag
      const badForm = new FormData();
      badForm.set('flag', 'invalid_flag_hack');
      await expect(setAccountFlagAction(accountId, badForm)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?error=flag');

      // Valid flag
      const goodForm = new FormData();
      goodForm.set('flag', 'auto_review_requests');
      goodForm.set('next', 'on');
      goodForm.set('reason', 'Contractor request');
      await expect(setAccountFlagAction(accountId, goodForm)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?done=flag_changed');
      expect(mocks.logAdminAction).toHaveBeenCalledWith(
        mockDb,
        expect.any(Object),
        expect.objectContaining({ action: 'account_flag_change', accountId }),
      );
    });

    it('account notes, tags, attachments, and privacy requests actions execute cleanly', async () => {
      const mockDb = createMockSupabase();
      mocks.requirePermission.mockResolvedValue({ admin: mockDb, adminEmail, userId });

      // Note
      const noteForm = new FormData();
      noteForm.set('body', 'Called customer regarding dispute.');
      await expect(addAccountNoteAction(accountId, noteForm)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?done=noted');
      expect(mocks.addAccountNote).toHaveBeenCalledWith(mockDb, accountId, adminEmail, 'Called customer regarding dispute.');

      // Tag add / remove
      const tagForm = new FormData();
      tagForm.set('tag', 'vip');
      await expect(addAccountTagAction(accountId, tagForm)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?done=tagged');

      const rmTagForm = new FormData();
      rmTagForm.set('tag_id', 'tag-1');
      await expect(removeAccountTagAction(accountId, rmTagForm)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?done=untagged');

      // Attachment upload / delete
      const attForm = new FormData();
      attForm.set('file', new File(['doc'], 'invoice.pdf', { type: 'application/pdf' }));
      await expect(uploadAccountAttachmentAction(accountId, attForm)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?done=attached');

      const delAttForm = new FormData();
      delAttForm.set('attachment_id', 'att-1');
      await expect(deleteAccountAttachmentAction(accountId, delAttForm)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?done=attachment_deleted');

      // Privacy log / resolve
      const privForm = new FormData();
      privForm.set('kind', 'export');
      privForm.set('details', 'Customer requested all work orders');
      await expect(logPrivacyRequestAction(accountId, privForm)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?done=privacy_logged');

      const resPrivForm = new FormData();
      resPrivForm.set('request_id', 'req-1');
      resPrivForm.set('resolution_notes', 'Zip archive sent');
      await expect(resolvePrivacyRequestAction(accountId, resPrivForm)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?done=privacy_resolved');
    });

    it('deleteAccountAction and closeAndAnonymizeAccountAction perform irreversible operations', async () => {
      const mockDb = createMockSupabase({
        accounts: { data: { account_number: 1042, stripe_customer_id: 'cus_123', quickbooks_realm_id: 'realm_456' } },
        memberships: { data: [{ user_id: 'owner-usr-1' }] },
      });
      mocks.requireMfaPermission.mockResolvedValue({ admin: mockDb, adminEmail, userId });

      // Delete account requires typing account number
      const delForm = new FormData();
      delForm.set('confirm', '9999'); // Mismatch
      await expect(deleteAccountAction(accountId, delForm)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?error=confirm');

      delForm.set('confirm', '1042');
      await expect(deleteAccountAction(accountId, delForm)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts?deleted=1');
      expect(mocks.releaseCustomDomains).toHaveBeenCalledWith(['apexroofing.com']);
      expect(mocks.logAdminAction).toHaveBeenCalledWith(
        mockDb,
        expect.any(Object),
        expect.objectContaining({ action: 'account_delete' }),
      );

      // Close & Anonymize
      const closeForm = new FormData();
      closeForm.set('confirm', '1042');
      await expect(closeAndAnonymizeAccountAction(accountId, closeForm)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?done=closure_requested');
      expect(mocks.requestAccountClosure).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 2. MESSAGING REGISTRATIONS ACTIONS
  // =========================================================================
  describe('Messaging Registrations Operations', () => {
    const validAppId = '11111111-1111-4111-8111-111111111111';
    const brandId = '22222222-2222-4222-8222-222222222222';
    const campaignId = '33333333-3333-4333-8333-333333333333';
    const sampleApp = {
      id: validAppId,
      accountId: 'acc-msg-1',
      status: 'submitted',
      revision: 1,
      legalBusinessName: 'Apex Roofing LLC',
      dbaName: 'Apex Roofing',
      websiteUrl: 'https://apexroofing.com',
      desiredAreaCode: '313',
      region: 'US',
      candidateNumber: '+13135550199',
      purchasedNumber: '+13135550199',
      providerNumberId: 'num-obj-1',
      providerCampaignId: campaignId,
      providerBrandId: brandId,
      inboundConfiguredAt: '2026-09-01T00:00:00Z',
      purchasedAt: '2026-09-01T00:00:00Z',
      assignmentOrderId: 'order-1',
      businessEmail: 'owner@apexroofing.com',
    };

    const freshApp = {
      ...sampleApp,
      providerNumberId: null,
      providerCampaignId: null,
      providerBrandId: null,
      purchasedNumber: null,
      inboundConfiguredAt: null,
      purchasedAt: null,
      assignmentOrderId: null,
    };

    it('reviewMessagingApplicationAction rejects or approves registration applications', async () => {
      const mockDb = createMockSupabase();
      mocks.requireMfaPermission.mockResolvedValue({ admin: mockDb, adminEmail, userId });
      mocks.loadAdminMessagingRegistrationApplication.mockResolvedValue(freshApp);
      mocks.loadMessagingComplianceVerification.mockResolvedValue({
        accountId: 'acc-msg-1',
        applicationRevision: 1,
        verificationMethod: 'ein',
        einLastFour: '1234',
        otpReference: null,
      });

      // Reject application
      const rejectForm = new FormData();
      rejectForm.set('applicationId', validAppId);
      rejectForm.set('decision', 'rejected');
      rejectForm.set('detail', 'The provided EIN does not match state business registry.');

      await expect(reviewMessagingApplicationAction(rejectForm)).rejects.toThrow(`NEXT_REDIRECT:/admin/messaging/registrations?application=${validAppId}&done=1`);
      expect(mocks.reviewMessagingRegistrationApplication).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: 'rejected',
          detail: 'The provided EIN does not match state business registry.',
        }),
      );

      // Approve application
      const approveForm = new FormData();
      approveForm.set('applicationId', validAppId);
      approveForm.set('decision', 'approved');
      approveForm.set('providerBrandId', brandId);
      approveForm.set('providerCampaignId', campaignId);
      approveForm.set('confirmation', `APPROVE ${validAppId}`);

      await expect(reviewMessagingApplicationAction(approveForm)).rejects.toThrow(`NEXT_REDIRECT:/admin/messaging/registrations?application=${validAppId}&done=1`);
      expect(mocks.reviewMessagingRegistrationApplication).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: 'approved',
          providerBrandId: brandId,
          providerCampaignId: campaignId,
        }),
      );
    });

    it('recordMessagingComplianceVerificationAction records tax verification and guards against full EIN', async () => {
      const mockDb = createMockSupabase();
      mocks.requireMfaPermission.mockResolvedValue({ admin: mockDb, adminEmail, userId });
      mocks.loadAdminMessagingRegistrationApplication.mockResolvedValue(freshApp);

      // Full EIN in reference is refused
      const badForm = new FormData();
      badForm.set('applicationId', validAppId);
      badForm.set('verificationMethod', 'ein');
      badForm.set('einLastFour', '1234');
      badForm.set('verificationReference', 'EIN 12-3456789 verified');

      await expect(recordMessagingComplianceVerificationAction(badForm)).rejects.toThrow('NEXT_REDIRECT:/admin/messaging/registrations?error=1');

      // Valid reference
      const goodForm = new FormData();
      goodForm.set('applicationId', validAppId);
      goodForm.set('verificationMethod', 'ein');
      goodForm.set('einLastFour', '1234');
      goodForm.set('verificationReference', 'IRS Case Ref #88412');

      await expect(recordMessagingComplianceVerificationAction(goodForm)).rejects.toThrow(`NEXT_REDIRECT:/admin/messaging/registrations?application=${validAppId}&done=1`);
      expect(mocks.recordMessagingComplianceVerification).toHaveBeenCalledWith(
        expect.objectContaining({
          verificationReference: 'IRS Case Ref #88412',
          einLastFour: '1234',
        }),
      );
    });

    it('searchMessagingNumberCandidateAction and purchaseMessagingNumberAction manage numbers', async () => {
      const mockDb = createMockSupabase();
      mocks.requireMfaPermission.mockResolvedValue({ admin: mockDb, adminEmail, userId });
      mocks.loadAdminMessagingRegistrationApplication.mockResolvedValue(sampleApp);
      mocks.loadMessagingComplianceVerification.mockResolvedValue({
        accountId: 'acc-msg-1',
        applicationRevision: 1,
        verificationMethod: 'ein',
        einLastFour: '1234',
      });
      mocks.loadMessagingNumberPurchasePolicy.mockResolvedValue({
        monthlyPriceCents: 200,
        monthlySpendCeilingCents: 10000,
      });

      // Search candidate
      mocks.searchAndRecordMessagingNumberCandidate.mockResolvedValue({ number: '+13135550199' });
      const searchForm = new FormData();
      searchForm.set('applicationId', validAppId);

      await expect(searchMessagingNumberCandidateAction(searchForm)).rejects.toThrow(`NEXT_REDIRECT:/admin/messaging/registrations?application=${validAppId}&done=1`);
      expect(mocks.searchAndRecordMessagingNumberCandidate).toHaveBeenCalled();

      // Purchase number
      mocks.purchaseMessagingNumber.mockResolvedValue({ providerObjectId: 'p-obj-123', replay: false });
      const buyForm = new FormData();
      buyForm.set('applicationId', validAppId);
      buyForm.set('confirmation', 'CONFIRM PURCHASE +13135550199');

      await expect(purchaseMessagingNumberAction(buyForm)).rejects.toThrow(`NEXT_REDIRECT:/admin/messaging/registrations?application=${validAppId}&done=1`);
      expect(mocks.purchaseMessagingNumber).toHaveBeenCalled();
    });

    it('configureMessagingInboundAction, assignMessagingCampaignAction, reconcileMessagingAssignmentAction configure provisioning', async () => {
      const mockDb = createMockSupabase();
      mocks.requireMfaPermission.mockResolvedValue({ admin: mockDb, adminEmail, userId });
      mocks.loadAdminMessagingRegistrationApplication.mockResolvedValue(sampleApp);
      mocks.loadMessagingComplianceVerification.mockResolvedValue({
        accountId: 'acc-msg-1',
        applicationRevision: 1,
        verificationMethod: 'ein',
        einLastFour: '1234',
      });

      // Inbound config
      mocks.configureMessagingNumberInbound.mockResolvedValue({ providerObjectId: 'inbound-1', replay: false });
      const inForm = new FormData();
      inForm.set('applicationId', validAppId);
      inForm.set('confirmation', 'CONFIGURE +13135550199');
      await expect(configureMessagingInboundAction(inForm)).rejects.toThrow(`NEXT_REDIRECT:/admin/messaging/registrations?application=${validAppId}&done=1`);

      // Assign campaign
      mocks.assignMessagingNumberCampaign.mockResolvedValue({ providerObjectId: 'order-1', replay: false });
      const assignForm = new FormData();
      assignForm.set('applicationId', validAppId);
      assignForm.set('confirmation', 'ASSIGN +13135550199');
      await expect(assignMessagingCampaignAction(assignForm)).rejects.toThrow(`NEXT_REDIRECT:/admin/messaging/registrations?application=${validAppId}&done=1`);

      // Reconcile assignment
      mocks.reconcileMessagingNumberAssignment.mockResolvedValue('complete');
      const recForm = new FormData();
      recForm.set('applicationId', validAppId);
      recForm.set('confirmation', 'RECONCILE +13135550199');
      await expect(reconcileMessagingAssignmentAction(recForm)).rejects.toThrow(`NEXT_REDIRECT:/admin/messaging/registrations?application=${validAppId}&done=1`);
      expect(mocks.sendMessagingApplicationStatusEmail).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'active', purchasedNumber: '+13135550199' }),
      );
    });

    it('resolveMessagingNumberOperationAction and setMessagingNumberSpendPolicyAction recover and configure policy', async () => {
      const mockDb = createMockSupabase();
      mocks.requireMfaPermission.mockResolvedValue({ admin: mockDb, adminEmail, userId });
      mocks.loadAdminMessagingRegistrationApplication.mockResolvedValue(sampleApp);
      mocks.loadMessagingComplianceVerification.mockResolvedValue({
        accountId: 'acc-msg-1',
        applicationRevision: 1,
        verificationMethod: 'ein',
        einLastFour: '1234',
      });

      // Resolve indeterminate operation
      const opId = '44444444-4444-4444-8444-444444444444';
      const resOpForm = new FormData();
      resOpForm.set('applicationId', validAppId);
      resOpForm.set('operationId', opId);
      resOpForm.set('resolution', 'confirmed_absent');
      resOpForm.set('confirmation', `ABSENT ${opId}`);

      await expect(resolveMessagingNumberOperationAction(resOpForm)).rejects.toThrow(`NEXT_REDIRECT:/admin/messaging/registrations?application=${validAppId}&done=1`);
      expect(mocks.resolveIndeterminateMessagingNumberOperation).toHaveBeenCalled();

      // Set spend policy
      mocks.setMessagingNumberPurchasePolicy.mockResolvedValue({
        provider: 'signalwire',
        revision: 2,
        monthlyPriceCents: 250,
        monthlySpendCeilingCents: 50000,
      });

      const policyForm = new FormData();
      policyForm.set('applicationId', validAppId);
      policyForm.set('monthlyPriceCents', '250');
      policyForm.set('monthlySpendCeilingCents', '50000');
      policyForm.set('confirmation', 'SET SIGNALWIRE POLICY USD 2.50/MO LIMIT USD 500.00/MO');

      await expect(setMessagingNumberSpendPolicyAction(policyForm)).rejects.toThrow(`NEXT_REDIRECT:/admin/messaging/registrations?application=${validAppId}&done=1`);
      expect(mocks.setMessagingNumberPurchasePolicy).toHaveBeenCalled();
    });

    it('messaging actions handle validation errors and invalid inputs', async () => {
      const mockDb = createMockSupabase();
      mocks.requireMfaPermission.mockResolvedValue({ admin: mockDb, adminEmail, userId });

      // Invalid UUID in applicationId
      const badIdForm = new FormData();
      badIdForm.set('applicationId', 'not-a-valid-uuid');
      await expect(reviewMessagingApplicationAction(badIdForm)).rejects.toThrow('NEXT_REDIRECT:/admin/messaging/registrations?error=1');

      // Review decision invalid
      mocks.loadAdminMessagingRegistrationApplication.mockResolvedValue(freshApp);
      const badDecisionForm = new FormData();
      badDecisionForm.set('applicationId', validAppId);
      badDecisionForm.set('decision', 'invalid_decision');
      await expect(reviewMessagingApplicationAction(badDecisionForm)).rejects.toThrow('NEXT_REDIRECT:/admin/messaging/registrations?error=1');

      // Rejection with detail too short (< 10 chars)
      const shortDetailForm = new FormData();
      shortDetailForm.set('applicationId', validAppId);
      shortDetailForm.set('decision', 'rejected');
      shortDetailForm.set('detail', 'short');
      await expect(reviewMessagingApplicationAction(shortDetailForm)).rejects.toThrow('NEXT_REDIRECT:/admin/messaging/registrations?error=1');

      // Approval with confirmation mismatch
      const badConfirmApproveForm = new FormData();
      badConfirmApproveForm.set('applicationId', validAppId);
      badConfirmApproveForm.set('decision', 'approved');
      badConfirmApproveForm.set('providerBrandId', brandId);
      badConfirmApproveForm.set('providerCampaignId', campaignId);
      badConfirmApproveForm.set('confirmation', 'WRONG CONFIRM');
      await expect(reviewMessagingApplicationAction(badConfirmApproveForm)).rejects.toThrow('NEXT_REDIRECT:/admin/messaging/registrations?error=1');

      // Purchase without candidate number
      const noCandidateApp = { ...sampleApp, candidateNumber: null };
      mocks.loadAdminMessagingRegistrationApplication.mockResolvedValue(noCandidateApp);
      const buyForm = new FormData();
      buyForm.set('applicationId', validAppId);
      await expect(purchaseMessagingNumberAction(buyForm)).rejects.toThrow('NEXT_REDIRECT:/admin/messaging/registrations?error=1');

      // Inbound config without purchased number
      const noPurchasedApp = { ...sampleApp, purchasedNumber: null };
      mocks.loadAdminMessagingRegistrationApplication.mockResolvedValue(noPurchasedApp);
      const inForm = new FormData();
      inForm.set('applicationId', validAppId);
      await expect(configureMessagingInboundAction(inForm)).rejects.toThrow('NEXT_REDIRECT:/admin/messaging/registrations?error=1');

      // Campaign assignment prerequisites missing
      const notReadyApp = { ...sampleApp, inboundConfiguredAt: null };
      mocks.loadAdminMessagingRegistrationApplication.mockResolvedValue(notReadyApp);
      const assignForm = new FormData();
      assignForm.set('applicationId', validAppId);
      await expect(assignMessagingCampaignAction(assignForm)).rejects.toThrow('NEXT_REDIRECT:/admin/messaging/registrations?error=1');

      // Spend policy range invalid (unit price > ceiling)
      mocks.loadAdminMessagingRegistrationApplication.mockResolvedValue(sampleApp);
      const badPolicyForm = new FormData();
      badPolicyForm.set('applicationId', validAppId);
      badPolicyForm.set('monthlyPriceCents', '10000');
      badPolicyForm.set('monthlySpendCeilingCents', '500'); // ceiling < price
      await expect(setMessagingNumberSpendPolicyAction(badPolicyForm)).rejects.toThrow('NEXT_REDIRECT:/admin/messaging/registrations?error=1');
    });
  });

  describe('Admin Account Additional Validation & Error Branches', () => {
    it('validates short reasons, empty notes, missing owners, and database deletion blocks', async () => {
      const mockDb = createMockSupabase();
      mocks.requireMfaPermission.mockResolvedValue({ admin: mockDb, adminEmail, userId });
      mocks.requirePermission.mockResolvedValue({ admin: mockDb, adminEmail, userId });

      // Reason too short (< 4 chars)
      const shortReasonForm = new FormData();
      shortReasonForm.set('reason', 'no');
      await expect(suspendAccountAction(accountId, shortReasonForm)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?error=reason_required');

      // Empty note
      const emptyNoteForm = new FormData();
      emptyNoteForm.set('body', '   ');
      await expect(addAccountNoteAction(accountId, emptyNoteForm)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?error=note');

      // Empty tag
      const emptyTagForm = new FormData();
      emptyTagForm.set('tag', '');
      await expect(addAccountTagAction(accountId, emptyTagForm)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?error=tag');

      // Resend onboarding without owner email
      mocks.getAccountOwnerEmail.mockResolvedValue(null);
      await expect(resendOnboardingAction(accountId)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?error=no_owner');

      // Privacy resolution notes missing
      const resForm = new FormData();
      resForm.set('request_id', 'req-1');
      resForm.set('resolution_notes', '');
      await expect(resolvePrivacyRequestAction(accountId, resForm)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?error=resolution_notes_required');

      // Deletion blocked by database foreign key restrict (code 23503)
      const delDb = createMockSupabase({
        accounts: { data: { account_number: 9999 } },
      });
      delDb.from = vi.fn((table: string) => {
        if (table === 'accounts') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({ data: { account_number: 9999 }, error: null })),
              })),
            })),
            delete: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ error: { code: '23503', message: 'violates FK' } })),
            })),
          };
        }
        return createMockSupabase().from(table);
      }) as any;
      mocks.requireMfaPermission.mockResolvedValue({ admin: delDb, adminEmail, userId });

      const delForm = new FormData();
      delForm.set('confirm', '9999');
      await expect(deleteAccountAction(accountId, delForm)).rejects.toThrow('NEXT_REDIRECT:/admin/accounts/acc-adm-001?error=delete_blocked');
    });
  });
});
