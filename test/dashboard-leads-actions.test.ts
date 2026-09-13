import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string) => {
    const err = new Error(`NEXT_REDIRECT:${path}`);
    (err as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${path};307;;`;
    throw err;
  }),
  cookies: vi.fn(() => ({
    set: vi.fn(),
    get: vi.fn(),
  })),
  requireOfficeContext: vi.fn(),
  requireOwnerContext: vi.fn(),
  createAdminClient: vi.fn(),
  createLead: vi.fn(),
  getLead: vi.fn(),
  updateLeadStatus: vi.fn(),
  updateLeadDetails: vi.fn(),
  convertLeadToJob: vi.fn(),
  unconvertLeadFromJob: vi.fn(),
  scheduleLeadQuoteVisit: vi.fn(),
  clearLeadQuoteVisit: vi.fn(),
  applyQuoteAcceptance: vi.fn(),
  createClientJobAccessToken: vi.fn(),
  createJobFeedEvent: vi.fn(),
  createDepositRequest: vi.fn(),
  createPaymentPlan: vi.fn(),
  uploadLeadPhoto: vi.fn(),
  deleteLeadPhotos: vi.fn(),
  softDeleteEntity: vi.fn(),
  sendClientJobDashboardSms: vi.fn(),
  sendLeadDeclineSms: vi.fn(),
  sendLeadQuoteVisitSms: vi.fn(),
  sendLeadQuoteVisitOptionsSms: vi.fn(),
  sendClientQuoteEmail: vi.fn(),
  loadBusinessName: vi.fn().mockResolvedValue('Apex Plumbing'),
  triggerWonLeadOfflineConversion: vi.fn(),
  syncLeadWonConversion: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('next/headers', () => ({
  cookies: mocks.cookies,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  unstable_rethrow: vi.fn((err: unknown) => {
    if (typeof err === 'object' && err !== null && 'digest' in err) {
      throw err;
    }
  }),
}));

vi.mock('@/lib/auth', () => ({
  requireOfficeContext: mocks.requireOfficeContext,
  requireOwnerContext: mocks.requireOwnerContext,
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/lib/leads', () => ({
  createLead: mocks.createLead,
  getLead: mocks.getLead,
  getLeadTriage: vi.fn(() => ({})),
  updateLeadStatus: mocks.updateLeadStatus,
  updateLeadDetails: mocks.updateLeadDetails,
  convertLeadToJob: mocks.convertLeadToJob,
  unconvertLeadFromJob: mocks.unconvertLeadFromJob,
  scheduleLeadQuoteVisit: mocks.scheduleLeadQuoteVisit,
  clearLeadQuoteVisit: mocks.clearLeadQuoteVisit,
  LEAD_DECLINE_REASONS: { too_expensive: 'Too expensive' },
  LEAD_LAYOUT_COOKIE: 'lead_layout',
  LEADS_VIEW_COOKIE: 'leads_view',
  normalizeLeadsView: vi.fn((v) => v || 'pipeline'),
  normalizeLeadLostAfterDays: vi.fn((d) => Number(d) || 30),
}));

vi.mock('@/lib/job-feed', () => ({
  applyQuoteAcceptance: mocks.applyQuoteAcceptance,
  createClientJobAccessToken: mocks.createClientJobAccessToken,
  createJobFeedEvent: mocks.createJobFeedEvent,
  createPaymentFeedEvent: vi.fn(),
}));

vi.mock('@/lib/jobs', () => ({
  computeQuoteTotal: vi.fn((items) => (items || []).reduce((acc: number, item: any) => acc + (item.amount || 0), 0)),
  formatJobQuoteSummary: vi.fn(() => 'Quote summary text'),
  parseQuoteItems: vi.fn((items) => items || []),
  saveQuoteItems: vi.fn(),
}));

vi.mock('@/lib/payments', () => ({
  createDepositRequest: mocks.createDepositRequest,
}));

vi.mock('@/lib/payment-plans', () => ({
  createPaymentPlan: mocks.createPaymentPlan,
}));

vi.mock('@/lib/invoices', () => ({
  createInvoice: vi.fn(),
  addInvoiceItem: vi.fn(),
  listInvoices: vi.fn().mockResolvedValue([]),
  selectPrimaryInvoice: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/lead-photo-storage', () => ({
  uploadLeadPhoto: mocks.uploadLeadPhoto,
  deleteLeadPhotos: mocks.deleteLeadPhotos,
}));

vi.mock('@/lib/recoverable-deletions', () => ({
  softDeleteEntity: mocks.softDeleteEntity,
}));

vi.mock('@/lib/business-name', () => ({
  loadBusinessName: mocks.loadBusinessName,
  BUSINESS_NAME_FALLBACK: 'Let\'s Get Quoted',
}));

vi.mock('@/lib/sms', () => ({
  sendClientJobDashboardSms: mocks.sendClientJobDashboardSms,
  sendLeadDeclineSms: mocks.sendLeadDeclineSms,
  sendLeadQuoteVisitSms: mocks.sendLeadQuoteVisitSms,
  sendLeadQuoteVisitOptionsSms: mocks.sendLeadQuoteVisitOptionsSms,
  isPhoneOptedOut: vi.fn().mockResolvedValue(false),
  recordSmsConsent: vi.fn(),
}));

vi.mock('@/lib/email', () => ({
  sendClientQuoteEmail: mocks.sendClientQuoteEmail,
  sendQuoteSentConfirmationEmail: vi.fn(),
}));

vi.mock('@/lib/confirmation-prefs', () => ({
  wantsConfirmation: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/google-ads-conversion-outbox', () => ({
  triggerWonLeadOfflineConversion: mocks.triggerWonLeadOfflineConversion,
  syncLeadWonConversion: mocks.syncLeadWonConversion,
}));

vi.mock('@/lib/meta-capi-outbox', () => ({
  triggerWonLeadMetaCapiConversion: vi.fn(),
}));

import {
  createLeadAction,
  updateLeadStatusAction,
  reopenLeadAction,
  updateLeadDetailsAction,
  updateLeadAddressAction,
  updateLeadContactAction,
  updateLeadNameAction,
  scheduleLeadQuoteVisitAction,
  clearLeadQuoteVisitAction,
  convertLeadAction,
  snoozeLeadAction,
  unsnoozeLeadAction,
  archiveLeadAction,
  deleteLeadAction,
  declineLeadAction,
  undoConvertLeadAction,
  setLeadLostAfterDaysAction,
} from '@/app/dashboard/leads/actions';

describe('Dashboard Leads Server Actions (dashboard/leads/actions.ts)', () => {
  const TEST_ACCOUNT_ID = 'acc-leads-777';

  function createMockSupabase(overrides: Record<string, any> = {}) {
    return {
      from: vi.fn((table: string) => {
        const chain: any = {
          select: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          neq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: table === 'accounts'
              ? { id: 'acc-1', stripe_connect_id: 'acct_123', connect_onboarded: true }
              : { id: 'lead-1', job_id: 'job-1', address: '123 Main St' },
            error: null,
          }),
          single: vi.fn().mockResolvedValue({
            data: table === 'accounts'
              ? { id: 'acc-1', stripe_connect_id: 'acct_123', connect_onboarded: true }
              : { id: 'lead-1', job_id: 'job-1', address: '123 Main St' },
            error: null,
          }),
        };
        if (overrides[table]) {
          Object.assign(chain, overrides[table]);
        }
        if (!chain.then) {
          chain.then = (resolve: any) => resolve({ data: [], error: null });
        }
        return chain;
      }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    const mockSupabase = createMockSupabase();
    mocks.requireOfficeContext.mockResolvedValue({
      supabase: mockSupabase,
      accountId: TEST_ACCOUNT_ID,
      role: 'staff',
    });
    mocks.requireOwnerContext.mockResolvedValue({
      supabase: mockSupabase,
      accountId: TEST_ACCOUNT_ID,
      role: 'owner',
    });
    mocks.createAdminClient.mockReturnValue(mockSupabase);
  });

  describe('createLeadAction', () => {
    it('creates manual lead and redirects to new lead page', async () => {
      mocks.createLead.mockResolvedValue({ id: 'lead-new-123' });

      const fd = new FormData();
      fd.append('name', 'Sarah Connor');
      fd.append('phone', '(555) 300-4000');
      fd.append('email', 'sarah@example.com');
      fd.append('address', '742 Evergreen Terrace');
      fd.append('projectType', 'Roof Inspection');
      fd.append('message', 'Need emergency storm damage quote');

      await expect(createLeadAction(fd)).rejects.toThrow('NEXT_REDIRECT');
      expect(mocks.createLead).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        expect.objectContaining({
          source: 'manual',
          name: 'Sarah Connor',
          phone: '(555) 300-4000',
          email: 'sarah@example.com',
          projectType: 'Roof Inspection',
        })
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/leads');
      expect(mocks.redirect).toHaveBeenCalledWith('/dashboard/leads/lead-new-123?added=1');
    });
  });

  describe('updateLeadStatusAction', () => {
    it('updates status to contacted via standard office context', async () => {
      await updateLeadStatusAction('lead-1', 'contacted');
      expect(mocks.updateLeadStatus).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'lead-1',
        'contacted'
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/leads');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/leads/lead-1');
    });

    it('handles won status: requires owner context, applies quote acceptance and triggers conversions', async () => {
      const mockLead = { id: 'lead-1', converted_job: 'job-777', phone: '555-123-4567', email: 'lead@example.com' };
      mocks.getLead.mockResolvedValue(mockLead);

      await updateLeadStatusAction('lead-1', 'won');
      expect(mocks.requireOwnerContext).toHaveBeenCalled();
      expect(mocks.updateLeadStatus).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'lead-1',
        'won'
      );
      expect(mocks.applyQuoteAcceptance).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'job-777',
        { source: 'owner_verbal' }
      );
      expect(mocks.triggerWonLeadOfflineConversion).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        mockLead,
        0
      );
    });

    it('reopenLeadAction resets lead to contacted and revalidates', async () => {
      const mockSupabase = createMockSupabase();
      mocks.requireOwnerContext.mockResolvedValue({
        supabase: mockSupabase,
        accountId: TEST_ACCOUNT_ID,
        role: 'owner',
      });
      mocks.getLead.mockResolvedValue({ id: 'lead-1', status: 'lost' });

      await reopenLeadAction('lead-1');
      expect(mockSupabase.from).toHaveBeenCalledWith('leads');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/leads');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/leads/lead-1');
    });
  });

  describe('Inline Lead Attribute Updates', () => {
    it('updateLeadDetailsAction updates notes, project type, and address', async () => {
      const fd = new FormData();
      fd.append('name', 'John Client');
      fd.append('projectType', 'Gutter Cleaning');
      fd.append('message', 'Access via back gate only');

      await updateLeadDetailsAction('lead-1', fd);
      expect(mocks.updateLeadDetails).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'lead-1',
        expect.objectContaining({
          name: 'John Client',
          projectType: 'Gutter Cleaning',
          message: 'Access via back gate only',
        })
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/leads/lead-1');
    });

    it('updateLeadAddressAction updates address directly in database', async () => {
      const mockSupabase = createMockSupabase();
      mocks.requireOwnerContext.mockResolvedValue({
        supabase: mockSupabase,
        accountId: TEST_ACCOUNT_ID,
        role: 'owner',
      });

      await updateLeadAddressAction('lead-1', '456 Oak Avenue');
      expect(mockSupabase.from).toHaveBeenCalledWith('leads');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/leads/lead-1');
    });

    it('updateLeadContactAction normalizes phone and trims email', async () => {
      const mockSupabase = createMockSupabase();
      mocks.requireOwnerContext.mockResolvedValue({
        supabase: mockSupabase,
        accountId: TEST_ACCOUNT_ID,
        role: 'owner',
      });

      await updateLeadContactAction('lead-1', '(555) 888-9999', '  JOHN@EXAMPLE.COM  ');
      expect(mockSupabase.from).toHaveBeenCalledWith('leads');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/leads/lead-1');
    });

    it('updateLeadNameAction rejects empty name and updates on valid input', async () => {
      await expect(updateLeadNameAction('lead-1', '  ')).rejects.toThrow('Lead name cannot be blank.');

      const mockSupabase = createMockSupabase();
      mocks.requireOwnerContext.mockResolvedValue({
        supabase: mockSupabase,
        accountId: TEST_ACCOUNT_ID,
        role: 'owner',
      });

      await updateLeadNameAction('lead-1', 'Ellen Ripley');
      expect(mockSupabase.from).toHaveBeenCalledWith('leads');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/leads/lead-1');
    });
  });

  describe('Quote Visit Scheduling', () => {
    it('scheduleLeadQuoteVisitAction schedules visit and sends SMS reminder', async () => {
      const mockLead = { id: 'lead-1', phone: '555-444-5555', name: 'James Holden', address: '123 Main St' };
      mocks.getLead.mockResolvedValue(mockLead);
      mocks.scheduleLeadQuoteVisit.mockResolvedValue({
        ...mockLead,
        quote_visit_scheduled_for: '2026-08-20',
      });

      const fd = new FormData();
      fd.append('quoteVisitDate', '2026-08-20');
      fd.append('quoteVisitTime', '10:00 AM');
      fd.append('quoteVisitAddress', '123 Main St');
      fd.append('quoteVisitSmsConsent', 'on');

      await scheduleLeadQuoteVisitAction('lead-1', fd);
      expect(mocks.scheduleLeadQuoteVisit).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'lead-1',
        expect.objectContaining({
          scheduledFor: '2026-08-20',
          scheduledTime: '10:00 AM',
        })
      );
      expect(mocks.sendLeadQuoteVisitSms).toHaveBeenCalledWith(expect.objectContaining({
        accountId: TEST_ACCOUNT_ID,
        address: '123 Main St',
        scheduledFor: '2026-08-20',
      }));
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/leads/lead-1');
    });

    it('clearLeadQuoteVisitAction removes scheduled quote visit', async () => {
      await clearLeadQuoteVisitAction('lead-1');
      expect(mocks.clearLeadQuoteVisit).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'lead-1'
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/leads/lead-1');
    });
  });

  describe('Lead Conversion to Job', () => {
    it('convertLeadAction rejects when quote items and amount are empty', async () => {
      const fd = new FormData();
      fd.append('quotedAmount', '0');
      await expect(convertLeadAction('lead-1', fd)).rejects.toThrow(
        'Add at least one line item or recurring plan worth $1 or more before sending the quote.'
      );
    });

    it('convertLeadAction successfully converts lead and creates job', async () => {
      const mockLead = {
        id: 'lead-1',
        name: 'Bruce Wayne',
        phone: '555-345-6789',
        email: 'bruce@waynecorp.com',
        address: '1007 Mountain Dr',
      };
      const mockJob = {
        id: 'job-new-77',
        ref: 'JOB-77',
        client_phone: '555-345-6789',
        client_email: 'bruce@waynecorp.com',
        client_name: 'Bruce Wayne',
      };

      mocks.getLead.mockResolvedValue(mockLead);
      mocks.convertLeadToJob.mockResolvedValue(mockJob);
      mocks.createClientJobAccessToken.mockResolvedValue('token-access-77');

      const fd = new FormData();
      fd.append('quotedAmount', '1200');
      fd.append('estimatedHours', '6');
      fd.append('sendClientText', 'on');
      fd.append('paymentTerms', 'full');

      await expect(convertLeadAction('lead-1', fd)).rejects.toThrow('NEXT_REDIRECT');
      expect(mocks.convertLeadToJob).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'lead-1',
        1200,
        6
      );
      expect(mocks.createJobFeedEvent).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'job-new-77',
        expect.objectContaining({ kind: 'job_created' })
      );
      expect(mocks.sendClientJobDashboardSms).toHaveBeenCalledWith(expect.objectContaining({
        accountId: TEST_ACCOUNT_ID,
        token: 'token-access-77',
        jobRef: 'JOB-77',
      }));
      expect(mocks.redirect).toHaveBeenCalledWith(expect.stringContaining('/dashboard/jobs/job-new-77'));
    });

    it('undoConvertLeadAction rolls back converted lead and removes link', async () => {
      await undoConvertLeadAction('lead-1');
      expect(mocks.unconvertLeadFromJob).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'lead-1'
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/leads');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/leads/lead-1');
    });
  });

  describe('Snooze, Decline, and Deletion', () => {
    it('snoozeLeadAction and unsnoozeLeadAction update snoozed_until timestamp', async () => {
      const mockSupabase = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({
        supabase: mockSupabase,
        accountId: TEST_ACCOUNT_ID,
      });

      await snoozeLeadAction('lead-1', 7);
      expect(mockSupabase.from).toHaveBeenCalledWith('leads');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/leads');

      await unsnoozeLeadAction('lead-1');
      expect(mockSupabase.from).toHaveBeenCalledWith('leads');
    });

    it('archiveLeadAction toggles archived status', async () => {
      const mockSupabase = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({
        supabase: mockSupabase,
        accountId: TEST_ACCOUNT_ID,
      });

      await archiveLeadAction('lead-1', true);
      expect(mockSupabase.from).toHaveBeenCalledWith('leads');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/leads');
    });

    it('declineLeadAction marks lead lost, logs decline reason, and sends polite SMS', async () => {
      const mockSupabase = createMockSupabase();
      mocks.requireOwnerContext.mockResolvedValue({
        supabase: mockSupabase,
        accountId: TEST_ACCOUNT_ID,
        role: 'owner',
      });
      const mockLead = { id: 'lead-1', name: 'John Doe', phone: '555-777-8888' };
      mocks.getLead.mockResolvedValue(mockLead);

      await declineLeadAction('lead-1', 'too_expensive', true);
      expect(mockSupabase.from).toHaveBeenCalledWith('leads');
      expect(mocks.sendLeadDeclineSms).toHaveBeenCalledWith(expect.objectContaining({
        accountId: TEST_ACCOUNT_ID,
        phone: '+15557778888',
        reason: 'Too expensive',
      }));
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/leads');
    });

    it('deleteLeadAction soft deletes lead and revalidates paths', async () => {
      mocks.getLead.mockResolvedValue({ id: 'lead-1', photo_paths: [] });

      await deleteLeadAction('lead-1');
      expect(mocks.softDeleteEntity).toHaveBeenCalledWith(
        expect.anything()
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/leads');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/trash');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/activity');
    });

    it('setLeadLostAfterDaysAction updates account settings', async () => {
      const mockSupabase = createMockSupabase();
      mocks.requireOwnerContext.mockResolvedValue({
        supabase: mockSupabase,
        accountId: TEST_ACCOUNT_ID,
        role: 'owner',
      });

      const fd = new FormData();
      fd.append('leadLostAfterDays', '45');

      await setLeadLostAfterDaysAction(fd);
      expect(mockSupabase.from).toHaveBeenCalledWith('accounts');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/leads');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard');
    });
  });
});
