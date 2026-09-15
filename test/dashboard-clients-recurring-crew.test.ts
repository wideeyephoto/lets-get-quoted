import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${url};307;;`;
    throw err;
  }),
  unstable_rethrow: vi.fn((err: unknown) => {
    if (err && typeof err === 'object' && 'digest' in err) {
      throw err;
    }
  }),
  requireOfficeContext: vi.fn(),
  requireOwnerContext: vi.fn(),
  createAdminClient: vi.fn(),
  // Recurring
  advanceDate: vi.fn((date: string) => '2026-09-22'),
  createRecurringPlan: vi.fn(),
  ensurePlanVisits: vi.fn(),
  getRecurringPlan: vi.fn(),
  setRecurringPlanActive: vi.fn(),
  deleteRecurringPlan: vi.fn(),
  runRecurringPlanNow: vi.fn(),
  setRecurringPlanAutopay: vi.fn(),
  todayDateKey: vi.fn(() => '2026-09-15'),
  updateRecurringPlan: vi.fn(),
  requiresReconsent: vi.fn(),
  createCardSetupSession: vi.fn(() => Promise.resolve('https://checkout.stripe.com/setup-123')),
  sendJobAppointmentReminder: vi.fn(),
  sendCardSetupSms: vi.fn(),
  sendCardSetupEmail: vi.fn(),
  deleteJob: vi.fn(),
  getMembershipTier: vi.fn(),
  // Clients
  normalizeUsPhone: vi.fn((val: string) => {
    const digits = val.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return null;
  }),
  updateClient: vi.fn(),
  duplicateMemberKey: vi.fn((members: Array<{ id: string }>) => members.map((m) => m.id).sort().join(':')),
  mergedFields: vi.fn((survivor: any, others: any[]) => ({
    name: survivor.name,
    phone: survivor.phone || others[0]?.phone || null,
    email: survivor.email || others[0]?.email || null,
    address: survivor.address || others[0]?.address || null,
    conflicts: ['Phone conflicted'],
  })),
  parseTable: vi.fn(),
  applyMapping: vi.fn(),
  deterministicMapping: vi.fn(),
  positionalMapping: vi.fn(),
  columnLabels: vi.fn(),
  importClients: vi.fn(),
  aiDetectColumns: vi.fn(),
  // Crew
  resolveCrewBurdenPct: vi.fn(() => Promise.resolve(15)),
  loadBusinessName: vi.fn(() => Promise.resolve('Apex Pro Services')),
  cookies: vi.fn(() => Promise.resolve({
    get: vi.fn((name: string) => ({ value: 'round_15' })),
  })),
  normalizeLaborSettings: vi.fn(() => ({ rounding: 'quarter_hour' })),
  roundHours: vi.fn((h: number) => Math.round(h * 4) / 4),
  geocodeAddress: vi.fn(() => Promise.resolve<{ lat: number; lng: number } | null>({ lat: 42.3314, lng: -83.0458 })),
  normalizePayType: vi.fn((type: unknown) => (type === 'salary' ? 'salary' : type === 'day_rate' ? 'day_rate' : 'hourly')),
  validateManualEnd: vi.fn((): string | null => null),
  clockOut: vi.fn(),
  getTimeEntry: vi.fn(),
  deleteArchivedCrewMember: vi.fn(),
  listCrew: vi.fn(),
  listCrewIdsForJob: vi.fn(),
  saveCrewStartAddress: vi.fn(),
  setCrewArrivalPermissions: vi.fn(),
  setJobCrewAssignments: vi.fn(),
  updateCrewPhoto: vi.fn(),
  updateCrewMember: vi.fn(),
  createCrewMemberForSeatGate: vi.fn(),
  setCrewActiveForSeatGate: vi.fn(),
  countLaborEntriesForCrew: vi.fn(),
  countPayRecordsForCrew: vi.fn(),
  laborEntryLockReason: vi.fn(),
  deleteCrewPhotos: vi.fn(),
  isCrewPhotoFile: vi.fn(),
  uploadCrewPhoto: vi.fn(),
  validateCrewPhotoFile: vi.fn(),
  createCost: vi.fn(),
  getJob: vi.fn(),
  createJobFeedEvent: vi.fn(),
  recordCrewSmsConsent: vi.fn(),
  sendCrewAssignmentSms: vi.fn(),
  sendCrewWelcomeSms: vi.fn(() => Promise.resolve({ ok: true })),
  revokeCrewAccess: vi.fn(),
  sendCrewMagicLink: vi.fn(),
  stampCrewInvite: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  unstable_rethrow: mocks.unstable_rethrow,
}));

vi.mock('next/headers', () => ({
  cookies: mocks.cookies,
}));

vi.mock('@/lib/auth', () => ({
  requireOfficeContext: mocks.requireOfficeContext,
  requireOwnerContext: mocks.requireOwnerContext,
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/lib/recurring', () => ({
  advanceDate: mocks.advanceDate,
  createRecurringPlan: mocks.createRecurringPlan,
  ensurePlanVisits: mocks.ensurePlanVisits,
  getRecurringPlan: mocks.getRecurringPlan,
  setRecurringPlanActive: mocks.setRecurringPlanActive,
  deleteRecurringPlan: mocks.deleteRecurringPlan,
  runRecurringPlanNow: mocks.runRecurringPlanNow,
  setRecurringPlanAutopay: mocks.setRecurringPlanAutopay,
  todayDateKey: mocks.todayDateKey,
  updateRecurringPlan: mocks.updateRecurringPlan,
  requiresReconsent: mocks.requiresReconsent,
}));

vi.mock('@/lib/card-on-file', () => ({
  createCardSetupSession: mocks.createCardSetupSession,
}));

vi.mock('@/lib/reminders', () => ({
  sendJobAppointmentReminder: mocks.sendJobAppointmentReminder,
}));

vi.mock('@/lib/sms', () => ({
  sendCardSetupSms: mocks.sendCardSetupSms,
  recordCrewSmsConsent: mocks.recordCrewSmsConsent,
  sendCrewAssignmentSms: mocks.sendCrewAssignmentSms,
  sendCrewWelcomeSms: mocks.sendCrewWelcomeSms,
}));

vi.mock('@/lib/email', () => ({
  sendCardSetupEmail: mocks.sendCardSetupEmail,
}));

vi.mock('@/lib/jobs', () => ({
  deleteJob: mocks.deleteJob,
  createCost: mocks.createCost,
  getJob: mocks.getJob,
}));

vi.mock('@/lib/membership-tiers', () => ({
  getMembershipTier: mocks.getMembershipTier,
}));

vi.mock('@/lib/phone', () => ({
  normalizeUsPhone: mocks.normalizeUsPhone,
}));

vi.mock('@/lib/clients', () => ({
  updateClient: mocks.updateClient,
}));

vi.mock('@/lib/client-duplicates', () => ({
  duplicateMemberKey: mocks.duplicateMemberKey,
  mergedFields: mocks.mergedFields,
}));

vi.mock('@/lib/client-import', () => ({
  parseTable: mocks.parseTable,
  applyMapping: mocks.applyMapping,
  deterministicMapping: mocks.deterministicMapping,
  positionalMapping: mocks.positionalMapping,
  columnLabels: mocks.columnLabels,
  importClients: mocks.importClients,
}));

vi.mock('@/lib/client-import-ai', () => ({
  aiDetectColumns: mocks.aiDetectColumns,
}));

vi.mock('@/lib/cost-truth-data', () => ({
  resolveCrewBurdenPct: mocks.resolveCrewBurdenPct,
}));

vi.mock('@/lib/business-name', () => ({
  loadBusinessName: mocks.loadBusinessName,
}));

vi.mock('@/lib/labor-settings', () => ({
  LABOR_SETTINGS_COOKIE: 'labor_settings',
  normalizeLaborSettings: mocks.normalizeLaborSettings,
  roundHours: mocks.roundHours,
}));

vi.mock('@/lib/geocode', () => ({
  geocodeAddress: mocks.geocodeAddress,
}));

vi.mock('@/lib/pay-types', () => ({
  normalizePayType: mocks.normalizePayType,
}));

vi.mock('@/lib/time-clock', () => ({
  validateManualEnd: mocks.validateManualEnd,
}));

vi.mock('@/lib/time-clock-data', () => ({
  clockOut: mocks.clockOut,
  getTimeEntry: mocks.getTimeEntry,
}));

vi.mock('@/lib/crew', () => ({
  deleteArchivedCrewMember: mocks.deleteArchivedCrewMember,
  listCrew: mocks.listCrew,
  listCrewIdsForJob: mocks.listCrewIdsForJob,
  saveCrewStartAddress: mocks.saveCrewStartAddress,
  setCrewArrivalPermissions: mocks.setCrewArrivalPermissions,
  setJobCrewAssignments: mocks.setJobCrewAssignments,
  updateCrewPhoto: mocks.updateCrewPhoto,
  updateCrewMember: mocks.updateCrewMember,
}));

vi.mock('@/lib/billing/crew-seat-entitlement', () => ({
  createCrewMemberForSeatGate: mocks.createCrewMemberForSeatGate,
  setCrewActiveForSeatGate: mocks.setCrewActiveForSeatGate,
}));

vi.mock('@/lib/crew-pay-data', () => ({
  countLaborEntriesForCrew: mocks.countLaborEntriesForCrew,
  countPayRecordsForCrew: mocks.countPayRecordsForCrew,
  laborEntryLockReason: mocks.laborEntryLockReason,
}));

vi.mock('@/lib/crew-photo-storage', () => ({
  deleteCrewPhotos: mocks.deleteCrewPhotos,
  isCrewPhotoFile: mocks.isCrewPhotoFile,
  uploadCrewPhoto: mocks.uploadCrewPhoto,
  validateCrewPhotoFile: mocks.validateCrewPhotoFile,
}));

vi.mock('@/lib/job-feed', () => ({
  createJobFeedEvent: mocks.createJobFeedEvent,
}));

vi.mock('@/lib/crew-sms-disclosure', () => ({
  CREW_SMS_DISCLOSURE_VERSION: '2026-03-v1',
}));

vi.mock('@/lib/crew-auth', () => ({
  revokeCrewAccess: mocks.revokeCrewAccess,
  sendCrewMagicLink: mocks.sendCrewMagicLink,
  stampCrewInvite: mocks.stampCrewInvite,
}));

import {
  createRecurringPlanAction,
  runPlanNowAction,
  setPlanActiveAction,
  deletePlanAction,
  skipNextVisitAction,
  remindNextVisitAction,
  setPlanAutopayAction,
  resendCardLinkAction,
  updatePlanAction,
} from '@/app/dashboard/recurring/actions';

import {
  analyzeClientImport,
  previewClientImport,
  commitClientImport,
  updateClientAction,
  createClientAction,
  mergeClientsAction,
  dismissDuplicateGroupAction,
} from '@/app/dashboard/clients/actions';

import {
  createCrewAction,
  updateCrewAction,
  updateCrewPhotoAction,
  setCrewActiveAction,
  deleteArchivedCrewAction,
  inviteCrewAction,
  revokeCrewAccessAction,
  assignCrewToJobAction,
  addLaborEntryAction,
  closeOpenShiftAction,
  deleteLaborEntryAction,
  geocodeJobAction,
  toggleCrewPhoneVerifiedAction,
} from '@/app/dashboard/crew/actions';

function createMockSupabase(initialData: Record<string, any> = {}) {
  const store: Record<string, any> = { ...initialData };

  const chainable = (result: any = { data: null, error: null }, table?: string) => {
    let exactCount = false;
    const chain: any = {
      select: vi.fn((_cols?: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count === 'exact') exactCount = true;
        return chain;
      }),
      insert: vi.fn((val: any) => {
        const row = Array.isArray(val) ? val[0] : val;
        const inserted = { id: row?.id || 'gen-id-123', ...row };
        return chainable({ data: inserted, error: null }, table);
      }),
      update: vi.fn((_val: any) => chain),
      upsert: vi.fn((_val: any) => chain),
      delete: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      neq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      is: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      order: vi.fn(() => chain),
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
      then: (resolve: (val: any) => any) => {
        const payload = exactCount
          ? { count: result?.count ?? (Array.isArray(result?.data) ? result.data.length : 0), data: result?.data ?? null, error: result?.error ?? null }
          : result;
        return Promise.resolve(payload).then(resolve);
      },
    };
    return chain;
  };

  return {
    from: vi.fn((tableName: string) => {
      if (store[tableName]) {
        return chainable(store[tableName], tableName);
      }
      return chainable({ data: [], error: null }, tableName);
    }),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
  };
}

describe('Group 1: Recurring Plans, Clients, and Crew Server Actions', () => {
  const accountId = 'acc-grp1-test';
  const userId = 'usr-grp1-admin';

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockReturnValue(createMockSupabase());
    mocks.todayDateKey.mockReturnValue('2026-09-15');
  });

  // =========================================================================
  // 1. RECURRING PLANS ACTIONS
  // =========================================================================
  describe('Recurring Plans Actions', () => {
    it('createRecurringPlanAction validates mandatory inputs', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userId });

      const form = new FormData();
      await expect(createRecurringPlanAction(form)).rejects.toThrow('Give the plan a name');

      form.set('title', 'Weekly Lawn Service');
      await expect(createRecurringPlanAction(form)).rejects.toThrow('Add the customer name');

      form.set('clientName', 'Alice Brown');
      await expect(createRecurringPlanAction(form)).rejects.toThrow('Pick how often it repeats');

      form.set('frequency', 'weekly');
      await expect(createRecurringPlanAction(form)).rejects.toThrow('Pick the first visit date');

      form.set('firstVisitDate', '2026-09-01'); // In past
      await expect(createRecurringPlanAction(form)).rejects.toThrow('The first visit date can’t be in the past');

      form.set('firstVisitDate', '2026-09-20');
      form.set('amount', '-10');
      await expect(createRecurringPlanAction(form)).rejects.toThrow('Enter a valid amount per visit');

      form.set('amount', '0');
      form.set('autoCharge', 'on');
      await expect(createRecurringPlanAction(form)).rejects.toThrow('Auto-charge needs an amount greater than $0');

      form.set('amount', '85.00');
      await expect(createRecurringPlanAction(form)).rejects.toThrow('Auto-charge needs the customer’s email or phone');
    });

    it('createRecurringPlanAction creates plan with membership tier and sends card link', async () => {
      const tierId = '00000000-0000-0000-0000-000000000001';
      const mockDb = createMockSupabase({
        accounts: { data: { business_name: 'Apex Lawn Pro' } },
        sites: { data: { company_name: 'Apex Site' } },
        sms_consent: { data: { status: 'opted_in' } },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userId });
      mocks.getMembershipTier.mockResolvedValue({
        id: tierId,
        name: 'Gold Member',
        tierLevel: 2,
        benefits: { discount: 10 },
      });
      const createdPlan = {
        id: 'plan-101',
        title: 'Weekly Lawn Mowing',
        client_name: 'Bob Smith',
        client_email: 'bob@example.com',
        client_phone: '+15551234567',
        amount: 120,
        frequency: 'weekly',
        next_run_date: '2026-09-20',
      };
      mocks.createRecurringPlan.mockResolvedValue(createdPlan);
      mocks.getRecurringPlan.mockResolvedValue(createdPlan);

      const form = new FormData();
      form.set('title', 'Weekly Lawn Mowing');
      form.set('scope', 'Mow front and backyard');
      form.set('clientName', 'Bob Smith');
      form.set('clientEmail', 'bob@example.com');
      form.set('clientPhone', '+15551234567');
      form.set('address', '123 Main St');
      form.set('amount', '120.00');
      form.set('frequency', 'weekly');
      form.set('firstVisitDate', '2026-09-20');
      form.set('autoCharge', 'on');
      form.set('termCycles', '12');
      form.set('membershipTierId', tierId);

      await expect(createRecurringPlanAction(form)).rejects.toThrow('NEXT_REDIRECT:/dashboard/recurring?flash=card-sent');

      expect(mocks.createRecurringPlan).toHaveBeenCalledWith(
        mockDb,
        accountId,
        expect.objectContaining({
          title: 'Weekly Lawn Mowing',
          membershipTierId: tierId,
          membershipTierName: 'Gold Member',
          tierLevel: 2,
          termCycles: 12,
        }),
      );
      expect(mocks.ensurePlanVisits).toHaveBeenCalled();
      expect(mocks.sendCardSetupEmail).toHaveBeenCalled();
      expect(mocks.sendCardSetupSms).toHaveBeenCalled();
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/recurring');
    });

    it('createRecurringPlanAction handles tier failure and card link failure gracefully', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userId });
      mocks.getMembershipTier.mockRejectedValue(new Error('Tier database offline'));
      mocks.getRecurringPlan.mockResolvedValue({
        id: 'plan-err',
        title: 'Biweekly Clean',
        client_email: null,
        client_phone: null, // No contact
      });
      mocks.createRecurringPlan.mockResolvedValue({
        id: 'plan-err',
        title: 'Biweekly Clean',
      });
      mocks.ensurePlanVisits.mockRejectedValue(new Error('Horizon population failed'));

      const form = new FormData();
      form.set('title', 'Biweekly Clean');
      form.set('clientName', 'Charlie Doe');
      form.set('clientEmail', 'charlie@example.com');
      form.set('amount', '75');
      form.set('frequency', 'biweekly');
      form.set('firstVisitDate', '2026-09-20');
      form.set('autoCharge', 'on');
      form.set('membershipTierId', '00000000-0000-0000-0000-000000000002');

      // Card setup fails because no contact method exists on plan
      await expect(createRecurringPlanAction(form)).rejects.toThrow('NEXT_REDIRECT:/dashboard/recurring?flash=card-failed');
    });

    it('runPlanNowAction executes recurring plan immediately and redirects', async () => {
      mocks.requireOfficeContext.mockResolvedValue({ accountId });
      mocks.runRecurringPlanNow.mockResolvedValue({ outcome: 'created', jobId: 'job-777' });

      await expect(runPlanNowAction('plan-101')).rejects.toThrow('NEXT_REDIRECT:/dashboard/recurring?flash=ran-created&job=job-777');
      expect(mocks.runRecurringPlanNow).toHaveBeenCalledWith(accountId, 'plan-101');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/recurring');
    });

    it('setPlanActiveAction resumes and pauses plans with visit count', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userId: 'usr-1', role: 'owner' });
      mocks.setRecurringPlanActive.mockResolvedValue({ visitsChanged: 4 });

      await expect(setPlanActiveAction('plan-101', false)).rejects.toThrow('NEXT_REDIRECT:/dashboard/recurring?flash=paused&changed=4');
      await expect(setPlanActiveAction('plan-101', true)).rejects.toThrow('NEXT_REDIRECT:/dashboard/recurring?flash=resumed&changed=4');

      expect(mocks.setRecurringPlanActive).toHaveBeenCalledWith(mockDb, accountId, 'plan-101', true);
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/schedule');
    });

    it('deletePlanAction removes recurring plan and upcoming visits', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
      mocks.deleteRecurringPlan.mockResolvedValue({ visitsRemoved: 3 });

      await expect(deletePlanAction('plan-101')).rejects.toThrow('NEXT_REDIRECT:/dashboard/recurring?flash=deleted&removed=3');
      expect(mocks.deleteRecurringPlan).toHaveBeenCalledWith(mockDb, accountId, 'plan-101');
    });

    it('skipNextVisitAction validates plan presence, active status, and billing states', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userId: 'usr-1', role: 'owner', userEmail: 'me@test.com' });

      // Plan missing
      mocks.getRecurringPlan.mockResolvedValue(null);
      await expect(skipNextVisitAction('plan-missing')).rejects.toThrow('Plan not found.');

      // Plan paused
      mocks.getRecurringPlan.mockResolvedValue({ id: 'plan-1', active: false });
      await expect(skipNextVisitAction('plan-1')).rejects.toThrow('This plan is paused');

      // Visit already complete
      const activePlan = { id: 'plan-1', active: true, next_run_date: '2026-09-20', frequency: 'weekly', anchor_day: 1 };
      mocks.getRecurringPlan.mockResolvedValue(activePlan);

      const dbWithCompleteVisit = createMockSupabase({
        jobs: { data: { id: 'job-complete', status: 'complete' } },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: dbWithCompleteVisit, accountId, userId: 'usr-1', role: 'owner' });
      await expect(skipNextVisitAction('plan-1')).rejects.toThrow('already marked complete');

      // Visit already billed
      const dbWithBilledVisit = createMockSupabase({
        jobs: { data: { id: 'job-billed', status: 'scheduled' } },
        payments: { count: 1, data: [{ id: 'pmt-1' }] },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: dbWithBilledVisit, accountId, userId: 'usr-1', role: 'owner' });
      await expect(skipNextVisitAction('plan-1')).rejects.toThrow('already been billed');

      // Successful skip with job delete and date advance
      const dbWithOpenVisit = createMockSupabase({
        jobs: { data: { id: 'job-open', status: 'scheduled' } },
        payments: { count: 0, data: [] },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: dbWithOpenVisit, accountId, userId: 'usr-1', role: 'owner' });
      mocks.advanceDate.mockReturnValue('2026-09-27');

      await expect(skipNextVisitAction('plan-1')).rejects.toThrow('NEXT_REDIRECT:/dashboard/recurring?flash=skipped&on=2026-09-20&then=2026-09-27');
      expect(mocks.deleteJob).toHaveBeenCalledWith(dbWithOpenVisit, accountId, 'job-open', expect.any(Object));
      expect(mocks.ensurePlanVisits).toHaveBeenCalled();
    });

    it('remindNextVisitAction verifies calendar presence and sends appointment reminder', async () => {
      const activePlan = { id: 'plan-1', next_run_date: '2026-09-20' };
      mocks.getRecurringPlan.mockResolvedValue(activePlan);

      // Not on calendar
      const emptyDb = createMockSupabase({ jobs: { data: null } });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: emptyDb, accountId });
      await expect(remindNextVisitAction('plan-1')).rejects.toThrow('That visit isn’t on the calendar yet');

      // Present on calendar - SMS sent
      const visitDb = createMockSupabase({
        jobs: { data: { id: 'job-visit-1', client_name: 'Sam' } },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: visitDb, accountId });
      mocks.sendJobAppointmentReminder.mockResolvedValue({ sent: true, channel: 'sms' });

      await expect(remindNextVisitAction('plan-1')).rejects.toThrow('NEXT_REDIRECT:/dashboard/recurring?flash=reminded');

      // Present on calendar - Email sent
      mocks.sendJobAppointmentReminder.mockResolvedValue({ sent: true, channel: 'email' });
      await expect(remindNextVisitAction('plan-1')).rejects.toThrow('NEXT_REDIRECT:/dashboard/recurring?flash=reminded-email');

      // No channel sent
      mocks.sendJobAppointmentReminder.mockResolvedValue({ sent: false });
      await expect(remindNextVisitAction('plan-1')).rejects.toThrow('NEXT_REDIRECT:/dashboard/recurring?flash=remind-nochannel');
    });

    it('setPlanAutopayAction and resendCardLinkAction manage auto-charge card setup', async () => {
      const mockDb = createMockSupabase({
        accounts: { data: { business_name: 'Apex Pro' } },
        sites: { data: { company_name: 'Apex' } },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
      mocks.getRecurringPlan.mockResolvedValue({
        id: 'plan-autopay',
        title: 'Mowing',
        client_email: 'autopay@test.com',
      });
      mocks.setRecurringPlanAutopay.mockResolvedValue({ id: 'plan-autopay', card_last4: null });

      // Autopay on without card on file -> triggers card link send
      await expect(setPlanAutopayAction('plan-autopay', true)).rejects.toThrow('NEXT_REDIRECT:/dashboard/recurring?flash=autopay-card-sent');

      // Autopay off
      mocks.setRecurringPlanAutopay.mockResolvedValue({ id: 'plan-autopay', card_last4: '4242' });
      await expect(setPlanAutopayAction('plan-autopay', false)).rejects.toThrow('NEXT_REDIRECT:/dashboard/recurring?flash=autopay-off');

      // Resend card link action (note: redirect in try is caught by catch block, triggering card-failed)
      await expect(resendCardLinkAction('plan-autopay')).rejects.toThrow('NEXT_REDIRECT:/dashboard/recurring?flash=card-failed');
    });

    it('updatePlanAction checks price increases and reconsent requirements', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
      const currentPlan = {
        id: 'plan-1',
        amount: 100,
        frequency: 'monthly',
        next_run_date: '2026-10-01',
        client_name: 'David Lee',
      };
      mocks.getRecurringPlan.mockResolvedValue(currentPlan);

      // Price increase requiring reconsent without confirmation checkbox
      mocks.requiresReconsent.mockReturnValue(true);
      const form1 = new FormData();
      form1.set('amount', '150');
      await expect(updatePlanAction('plan-1', form1)).rejects.toThrow('Confirm David Lee agreed to the increase');

      // Price increase with confirmation checkbox
      form1.set('confirmIncrease', 'on');
      form1.set('frequency', 'biweekly');
      form1.set('nextRunDate', '2026-10-05');
      await updatePlanAction('plan-1', form1);

      expect(mocks.updateRecurringPlan).toHaveBeenCalledWith(
        mockDb,
        accountId,
        'plan-1',
        expect.objectContaining({
          amount: 150,
          frequency: 'biweekly',
          nextRunDate: '2026-10-05',
        }),
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/recurring');
    });
  });

  // =========================================================================
  // 2. CLIENTS ACTIONS
  // =========================================================================
  describe('Clients Actions', () => {
    it('analyzeClientImport handles empty, no rows, AI fallback, and preview output', async () => {
      mocks.requireOfficeContext.mockResolvedValue({ accountId });

      // Empty text
      const res1 = await analyzeClientImport('');
      expect(res1).toEqual({ ok: false, error: 'empty' });

      // ParseTable returns empty
      mocks.parseTable.mockReturnValue([]);
      const res2 = await analyzeClientImport('Some,Bad,Csv');
      expect(res2).toEqual({ ok: false, error: 'norows' });

      // Deterministic mapping match
      const grid = [['Name', 'Phone', 'Email'], ['John Doe', '555-1234', 'john@test.com']];
      mocks.parseTable.mockReturnValue(grid);
      mocks.deterministicMapping.mockReturnValue({
        hasHeader: true,
        sources: { name: [0], phone: [1], email: [2], address: [] },
      });
      mocks.applyMapping.mockReturnValue([{ name: 'John Doe', phone: '555-1234', email: 'john@test.com' }]);
      mocks.columnLabels.mockReturnValue(['Name', 'Phone', 'Email']);

      const res3 = await analyzeClientImport('Name,Phone,Email\nJohn Doe,555-1234,john@test.com');
      expect(res3).toMatchObject({
        ok: true,
        usedAi: false,
        hasHeader: true,
        totalRows: 1,
      });

      // Deterministic null, AI match
      mocks.deterministicMapping.mockReturnValue(null);
      mocks.aiDetectColumns.mockResolvedValue({
        hasHeader: false,
        sources: { name: [0], phone: [1], email: [], address: [] },
      });
      const res4 = await analyzeClientImport('John Doe, 555-1234');
      expect(res4).toMatchObject({
        ok: true,
        usedAi: true,
        hasHeader: false,
      });

      // Both null, positional fallback
      mocks.aiDetectColumns.mockResolvedValue(null);
      mocks.positionalMapping.mockReturnValue({
        hasHeader: false,
        sources: { name: [0], phone: [1], email: [], address: [] },
      });
      const res5 = await analyzeClientImport('John Doe, 555-1234');
      expect(res5).toMatchObject({
        ok: true,
        usedAi: false,
      });
    });

    it('previewClientImport and commitClientImport sanitize and process rows', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

      mocks.parseTable.mockReturnValue([['Alice', '555-0101'], ['Bob', '555-0102']]);
      mocks.applyMapping.mockReturnValue([
        { name: 'Alice', phone: '555-0101' },
        { name: 'Bob', phone: '555-0102' },
      ]);

      const sources = { name: [0], phone: [1], email: [99], address: [-1] }; // Out-of-bounds sanitized
      const preview = await previewClientImport('Alice,555-0101\nBob,555-0102', sources, false);
      expect(preview.totalRows).toBe(2);
      expect(preview.sampleRows).toHaveLength(2);

      mocks.importClients.mockResolvedValue({ imported: 2, duplicates: 0, skipped: 0 });
      const commitRes = await commitClientImport('Alice,555-0101\nBob,555-0102', sources, false);
      expect(commitRes).toEqual({ imported: 2, duplicates: 0, skipped: 0 });
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/clients');

      // Empty commit handling
      mocks.applyMapping.mockReturnValue([]);
      const emptyCommit = await commitClientImport('Empty', sources, false);
      expect(emptyCommit).toEqual({ imported: 0, duplicates: 0, skipped: 0, error: 'norows' });
    });

    it('updateClientAction normalizes phone number and updates client', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

      const form = new FormData();
      form.set('name', 'Johnathan Doe');
      form.set('phone', '(555) 123-4567');
      form.set('email', 'johnathan@example.com');
      form.set('address', '456 Elm St');
      form.set('notes', 'Preferred customer');

      await updateClientAction('client-456', form);

      expect(mocks.updateClient).toHaveBeenCalledWith(
        mockDb,
        accountId,
        'client-456',
        expect.objectContaining({
          name: 'Johnathan Doe',
          phone: '+15551234567',
          email: 'johnathan@example.com',
          address: '456 Elm St',
          notes: 'Preferred customer',
        }),
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/clients/client-456');
    });

    it('createClientAction validates name, checks duplicates, inserts client', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

      const form = new FormData();
      await expect(createClientAction(form)).rejects.toThrow('A customer needs a name.');

      // Duplicate detected by phone
      form.set('name', 'Sarah Connor');
      form.set('phone', '555-999-0000');
      const dbWithExistingPhone = createMockSupabase({
        clients: { data: { id: 'client-existing-phone' } },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: dbWithExistingPhone, accountId });
      await expect(createClientAction(form)).rejects.toThrow('NEXT_REDIRECT:/dashboard/clients/client-existing-phone?existing=1');

      // Duplicate detected by email
      const dbWithExistingEmail = createMockSupabase({
        clients: { data: { id: 'client-existing-email' } },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: dbWithExistingEmail, accountId });
      const emailForm = new FormData();
      emailForm.set('name', 'Sarah Connor');
      emailForm.set('email', 'sarah@resistance.org');
      await expect(createClientAction(emailForm)).rejects.toThrow('NEXT_REDIRECT:/dashboard/clients/client-existing-email?existing=1');

      // No duplicate - successful insert
      const insertDb = createMockSupabase({
        clients: { data: null }, // no duplicate match
      });
      // Mock insert returning new id
      insertDb.from = vi.fn((tableName: string) => {
        if (tableName === 'clients') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
                  })),
                })),
              })),
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ data: { id: 'client-brand-new' }, error: null })),
              })),
            })),
          };
        }
        return createMockSupabase().from(tableName);
      }) as any;
      mocks.requireOfficeContext.mockResolvedValue({ supabase: insertDb, accountId });

      const newForm = new FormData();
      newForm.set('name', 'Brand New Client');
      newForm.set('email', 'brandnew@test.com');
      await expect(createClientAction(newForm)).rejects.toThrow('NEXT_REDIRECT:/dashboard/clients/client-brand-new?created=1');
    });

    it('mergeClientsAction combines survivor with duplicates and re-links records', async () => {
      const survivor = {
        id: 'cl-survivor',
        name: 'Jane Smith',
        phone: '+15550001111',
        email: 'jane@primary.com',
        address: '100 Maple St',
        notes: 'VIP customer',
        created_at: '2026-01-01T00:00:00Z',
      };
      const duplicate = {
        id: 'cl-dup',
        name: 'J. Smith',
        phone: '+15550002222',
        email: null,
        address: '100 Maple St',
        notes: 'Gate code 1234',
        created_at: '2026-02-01T00:00:00Z',
      };

      const mockDb = createMockSupabase({
        clients: { data: [survivor, duplicate] },
      });
      mocks.requireOwnerContext.mockResolvedValue({ supabase: mockDb, accountId });

      const form = new FormData();
      form.set('survivorId', 'cl-survivor');
      form.append('duplicateId', 'cl-dup');

      await expect(mergeClientsAction(form)).rejects.toThrow('NEXT_REDIRECT:/dashboard/clients/cl-survivor?merged=1');

      expect(mocks.mergedFields).toHaveBeenCalledWith(survivor, [duplicate]);
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/clients');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/clients/cl-survivor');
    });

    it('dismissDuplicateGroupAction records dismissed pairs', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

      // Less than 2 member IDs returns early
      const singleForm = new FormData();
      singleForm.append('duplicateId', 'cl-1');
      await dismissDuplicateGroupAction(singleForm);
      expect(mocks.duplicateMemberKey).not.toHaveBeenCalled();

      // 2 member IDs records dismissal and redirects
      const form = new FormData();
      form.append('duplicateId', 'cl-1');
      form.append('duplicateId', 'cl-2');
      form.set('reason', 'Father and son');

      await expect(dismissDuplicateGroupAction(form)).rejects.toThrow('NEXT_REDIRECT:/dashboard/clients?dismissed=1');
      expect(mocks.duplicateMemberKey).toHaveBeenCalledWith([{ id: 'cl-1' }, { id: 'cl-2' }]);
    });
  });

  // =========================================================================
  // 3. CREW ACTIONS
  // =========================================================================
  describe('Crew Actions', () => {
    it('createCrewAction validates consent, name, phone length, and adds crew member', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userId });

      // Consent not checked
      const form1 = new FormData();
      const res1 = await createCrewAction({ status: 'idle', message: '' } as any, form1);
      expect(res1).toEqual({
        status: 'error',
        message: 'Confirm that this crew member gave permission to receive text messages.',
      });

      // Disclosure version mismatch
      form1.set('crewSmsConsent', 'on');
      form1.set('crewSmsDisclosureVersion', 'old-version');
      const res2 = await createCrewAction({ status: 'idle', message: '' } as any, form1);
      expect(res2).toEqual({
        status: 'error',
        message: 'The SMS consent wording has changed. Review it and try again.',
      });

      // Name missing
      form1.set('crewSmsDisclosureVersion', '2026-03-v1');
      const res3 = await createCrewAction({ status: 'idle', message: '' } as any, form1);
      expect(res3).toEqual({ status: 'error', message: 'Enter their name before saving.' });

      // Phone missing or too short
      form1.set('name', 'Marcus Cole');
      const res4 = await createCrewAction({ status: 'idle', message: '' } as any, form1);
      expect(res4.status).toBe('error');

      form1.set('phone', '555-123'); // < 10 digits
      const res5 = await createCrewAction({ status: 'idle', message: '' } as any, form1);
      expect(res5).toEqual({
        status: 'error',
        message: 'That number is too short to text. Enter all ten digits.',
      });

      // Full successful creation with invite
      form1.set('phone', '555-123-4567');
      form1.set('email', 'marcus@example.com');
      form1.set('intent', 'invite');
      form1.set('payType', 'hourly');
      form1.set('hourlyRate', '28.50');

      mocks.createCrewMemberForSeatGate.mockResolvedValue({
        id: 'crew-100',
        name: 'Marcus Cole',
      });
      mocks.recordCrewSmsConsent.mockResolvedValue('recorded');

      const res6 = await createCrewAction({ status: 'idle' }, form1);
      expect(res6.status).toBe('added');
      if (res6.status !== 'added') throw new Error('Expected added');
      expect(res6.id).toBe('crew-100');
      expect(res6.invite).toBe('sent');
      expect(mocks.sendCrewMagicLink).toHaveBeenCalledWith('marcus@example.com', 'Apex Pro Services', accountId);
      expect(mocks.stampCrewInvite).toHaveBeenCalled();
    });

    it('updateCrewAction verifies SMS consent when phone number changes', async () => {
      const mockDb = createMockSupabase({
        crew: { data: { phone: '+15550001111' } },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userId });

      const form = new FormData();
      form.set('name', 'Marcus Cole');
      form.set('phone', '+15550009999'); // Changed phone number

      // Missing consent throws
      await expect(updateCrewAction('crew-100', form)).rejects.toThrow('Confirm that this crew member gave permission');

      // Valid consent on phone change
      form.set('crewSmsConsent', 'on');
      form.set('crewSmsDisclosureVersion', '2026-03-v1');
      form.set('canSendArrival', 'on');
      form.set('phoneVerified', 'on');
      mocks.recordCrewSmsConsent.mockResolvedValue('recorded');

      await updateCrewAction('crew-100', form);

      expect(mocks.recordCrewSmsConsent).toHaveBeenCalled();
      expect(mocks.sendCrewWelcomeSms).toHaveBeenCalled();
      expect(mocks.updateCrewMember).toHaveBeenCalledWith(
        mockDb,
        accountId,
        'crew-100',
        expect.objectContaining({ name: 'Marcus Cole' }),
      );
      expect(mocks.setCrewArrivalPermissions).toHaveBeenCalledWith(
        mockDb,
        accountId,
        'crew-100',
        expect.objectContaining({ send: true }),
      );
    });

    it('updateCrewPhotoAction uploads and cleans previous photo', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

      // No photo file does nothing
      mocks.isCrewPhotoFile.mockReturnValue(false);
      await updateCrewPhotoAction('crew-100', new FormData());
      expect(mocks.uploadCrewPhoto).not.toHaveBeenCalled();

      // Valid photo file
      mocks.isCrewPhotoFile.mockReturnValue(true);
      mocks.uploadCrewPhoto.mockResolvedValue('photos/crew-100-v2.jpg');
      mocks.updateCrewPhoto.mockResolvedValue({ previousPhotoPath: 'photos/crew-100-v1.jpg' });

      const form = new FormData();
      form.set('photo', new File(['img'], 'photo.jpg', { type: 'image/jpeg' }));
      await updateCrewPhotoAction('crew-100', form);

      expect(mocks.uploadCrewPhoto).toHaveBeenCalledWith(accountId, 'crew-100', expect.any(Object));
      expect(mocks.deleteCrewPhotos).toHaveBeenCalledWith(accountId, ['photos/crew-100-v1.jpg']);
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/crew');
    });

    it('setCrewActiveAction activates or deactivates crew seats', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

      mocks.setCrewActiveForSeatGate.mockResolvedValue(undefined);
      const res = await setCrewActiveAction('crew-100', true, { status: 'idle', message: '' }, new FormData());
      expect(res).toEqual({ status: 'saved', message: '' });

      // Handles seat limit rejection gracefully
      mocks.setCrewActiveForSeatGate.mockRejectedValue(new Error('Seat limit reached on current subscription'));
      const errRes = await setCrewActiveAction('crew-100', true, { status: 'idle', message: '' }, new FormData());
      expect(errRes.status).toBe('error');
      expect(errRes.message).toContain('Seat limit reached');
    });

    it('deleteArchivedCrewAction blocks deletion if pay records or labor entries exist', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userId, role: 'owner' });

      // Blocked by pay records
      mocks.countPayRecordsForCrew.mockResolvedValue(2);
      await expect(deleteArchivedCrewAction('crew-100')).rejects.toThrow('appears in a pay period');

      // Blocked by labor entries
      mocks.countPayRecordsForCrew.mockResolvedValue(0);
      mocks.countLaborEntriesForCrew.mockResolvedValue(5);
      await expect(deleteArchivedCrewAction('crew-100')).rejects.toThrow('has 5 labor entries against jobs');

      // Allowed when none exist
      mocks.countLaborEntriesForCrew.mockResolvedValue(0);
      await deleteArchivedCrewAction('crew-100');
      expect(mocks.deleteArchivedCrewMember).toHaveBeenCalledWith(mockDb, accountId, 'crew-100', expect.any(Object));
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/crew');
    });

    it('inviteCrewAction and revokeCrewAccessAction control field app credentials', async () => {
      // Invite crew
      const mockDb = createMockSupabase({
        crew: { data: { id: 'crew-100', name: 'Marcus', email: 'marcus@test.com' } },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

      await inviteCrewAction('crew-100');
      expect(mocks.sendCrewMagicLink).toHaveBeenCalledWith('marcus@test.com', 'Apex Pro Services', accountId);
      expect(mocks.stampCrewInvite).toHaveBeenCalled();

      // Revoke access
      await revokeCrewAccessAction('crew-100');
      expect(mocks.revokeCrewAccess).toHaveBeenCalledWith(expect.anything(), accountId, 'crew-100');
    });

    it('assignCrewToJobAction assigns crew and queues assignment notification SMS', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

      mocks.getJob.mockResolvedValue({
        id: 'job-999',
        ref: 'JOB-999',
        client_name: 'Martha Wayne',
        address: '1007 Mountain Drive',
      });
      mocks.listCrew.mockResolvedValue([
        { id: 'crew-100', name: 'Marcus Cole', phone: '+15551112222' },
      ]);
      mocks.listCrewIdsForJob.mockResolvedValue([]);
      mocks.setJobCrewAssignments.mockResolvedValue({ added: ['crew-100'], removed: [] });
      mocks.sendCrewAssignmentSms.mockResolvedValue({ status: 'queued' });

      const form = new FormData();
      form.set('jobId', 'job-999');
      form.set('notify', 'true');

      await assignCrewToJobAction('crew-100', form);

      expect(mocks.setJobCrewAssignments).toHaveBeenCalledWith(mockDb, accountId, 'job-999', ['crew-100']);
      expect(mocks.sendCrewAssignmentSms).toHaveBeenCalledWith(
        expect.objectContaining({
          jobRef: 'JOB-999',
          phone: '+15551112222',
        }),
      );
      expect(mocks.createJobFeedEvent).toHaveBeenCalledWith(
        mockDb,
        accountId,
        'job-999',
        expect.objectContaining({ kind: 'job_update' }),
      );
    });

    it('addLaborEntryAction, closeOpenShiftAction, deleteLaborEntryAction manage labor costs', async () => {
      const mockDb = createMockSupabase({
        crew: { data: { hourly_rate: 30 } },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
      mocks.getJob.mockResolvedValue({ id: 'job-500', title: 'HVAC Tuneup' });
      mocks.createCost.mockResolvedValue({ id: 'cost-1', amount: 90 });

      // Add labor entry
      const laborForm = new FormData();
      laborForm.set('jobId', 'job-500');
      laborForm.set('crewId', 'crew-100');
      laborForm.set('hours', '3');
      // No rate supplied -> falls back to member hourly_rate (30)

      await addLaborEntryAction(laborForm);
      expect(mocks.createCost).toHaveBeenCalledWith(
        mockDb,
        accountId,
        'job-500',
        expect.objectContaining({
          hours: 3,
          rate: 30,
        }),
      );
      expect(mocks.createJobFeedEvent).toHaveBeenCalled();

      // Close open shift
      mocks.getTimeEntry.mockResolvedValue({
        id: 'entry-1',
        job_id: 'job-500',
        crew_id: 'crew-100',
        started_at: '2026-09-15T08:00:00Z',
        ended_at: null,
      });
      const shiftForm = new FormData();
      shiftForm.set('endedAt', '2026-09-15T16:00:00');
      shiftForm.set('note', 'Closed shift by owner');

      await closeOpenShiftAction('entry-1', shiftForm);
      expect(mocks.clockOut).toHaveBeenCalledWith(
        mockDb,
        accountId,
        expect.objectContaining({ id: 'entry-1' }),
        expect.objectContaining({ closedByOwner: true }),
      );

      // Delete labor entry locked guard
      mocks.laborEntryLockReason.mockResolvedValue('Locked because pay period is finalized');
      await expect(deleteLaborEntryAction('cost-1')).rejects.toThrow('Locked because pay period is finalized');

      // Delete labor entry unlocked
      mocks.laborEntryLockReason.mockResolvedValue(null);
      await deleteLaborEntryAction('cost-1');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/jobs');
    });

    it('createCrewAction covers photo upload, no-email invite, and SMS consent failure branches', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userId });

      // SMS consent failed branch
      mocks.recordCrewSmsConsent.mockResolvedValue('failed');
      const failForm = new FormData();
      failForm.set('crewSmsConsent', 'on');
      failForm.set('crewSmsDisclosureVersion', '2026-03-v1');
      failForm.set('name', 'Dave Brown');
      failForm.set('phone', '555-111-2222');
      mocks.createCrewMemberForSeatGate.mockResolvedValue({ id: 'crew-fail', name: 'Dave Brown' });

      const failRes = await createCrewAction({ status: 'idle' }, failForm);
      expect(failRes.status).toBe('error');
      if (failRes.status !== 'error') throw new Error('Expected error');
      expect(failRes.message).toContain('SMS sending is not authorized');

      // Photo upload branch & invite without email
      mocks.recordCrewSmsConsent.mockResolvedValue('suppressed');
      mocks.isCrewPhotoFile.mockReturnValue(true);
      mocks.uploadCrewPhoto.mockResolvedValue('photos/crew-photo.jpg');

      const photoForm = new FormData();
      photoForm.set('crewSmsConsent', 'on');
      photoForm.set('crewSmsDisclosureVersion', '2026-03-v1');
      photoForm.set('name', 'Dave Brown');
      photoForm.set('phone', '555-111-2222');
      photoForm.set('intent', 'invite'); // wants invite but no email
      photoForm.set('photo', new File(['data'], 'avatar.jpg', { type: 'image/jpeg' }));
      mocks.createCrewMemberForSeatGate.mockResolvedValue({ id: 'crew-photo', name: 'Dave Brown' });

      const photoRes = await createCrewAction({ status: 'idle' }, photoForm);
      expect(photoRes.status).toBe('added');
      if (photoRes.status !== 'added') throw new Error('Expected added');
      expect(photoRes.invite).toBe('no-email');
      expect(mocks.uploadCrewPhoto).toHaveBeenCalledWith(accountId, 'crew-photo', expect.any(Object));
      expect(mocks.updateCrewPhoto).toHaveBeenCalledWith(mockDb, accountId, 'crew-photo', 'photos/crew-photo.jpg');
    });

    it('updateCrewAction handles unchanged phone without re-consenting', async () => {
      const mockDb = createMockSupabase({
        crew: { data: { phone: '+15551112222' } },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId, userId });

      const form = new FormData();
      form.set('name', 'Same Phone Worker');
      form.set('phone', '(555) 111-2222'); // Normalizes to same phone
      form.set('startAddress', '123 Work St');

      await updateCrewAction('crew-same', form);

      expect(mocks.recordCrewSmsConsent).not.toHaveBeenCalled();
      expect(mocks.saveCrewStartAddress).toHaveBeenCalledWith(mockDb, accountId, 'crew-same', '123 Work St');
    });

    it('inviteCrewAction and revokeCrewAccessAction throw when member is missing', async () => {
      const emptyDb = createMockSupabase({ crew: { data: null } });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: emptyDb, accountId });

      await expect(inviteCrewAction('crew-missing')).rejects.toThrow('Crew member not found.');
      await expect(revokeCrewAccessAction('crew-missing')).rejects.toThrow('Crew member not found.');

      // Member without email
      const noEmailDb = createMockSupabase({ crew: { data: { id: 'c-no-em', email: null } } });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: noEmailDb, accountId });
      await expect(inviteCrewAction('c-no-em')).rejects.toThrow('Add an email address for this crew member first');
    });

    it('assignCrewToJobAction validates inputs and handles unnotified assignments', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

      // Missing jobId
      await expect(assignCrewToJobAction('crew-1', new FormData())).rejects.toThrow('Choose a job before assigning crew.');

      // Job not found
      mocks.getJob.mockResolvedValue(null);
      const form = new FormData();
      form.set('jobId', 'job-missing');
      await expect(assignCrewToJobAction('crew-1', form)).rejects.toThrow('Job not found.');

      // Crew member not found
      mocks.getJob.mockResolvedValue({ id: 'job-found' });
      mocks.listCrew.mockResolvedValue([]);
      mocks.listCrewIdsForJob.mockResolvedValue([]);
      await expect(assignCrewToJobAction('crew-missing', form)).rejects.toThrow('Active crew member not found.');

      // Assign without notify
      mocks.listCrew.mockResolvedValue([{ id: 'crew-1', name: 'Joe', phone: '+15550001111' }]);
      mocks.setJobCrewAssignments.mockResolvedValue({ added: ['crew-1'], removed: [] });
      await assignCrewToJobAction('crew-1', form); // notify is absent
      expect(mocks.sendCrewAssignmentSms).not.toHaveBeenCalled();
    });

    it('closeOpenShiftAction validates manual end time and shift existence', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

      // Shift not found
      mocks.getTimeEntry.mockResolvedValue(null);
      await expect(closeOpenShiftAction('e-404', new FormData())).rejects.toThrow('That shift no longer exists.');

      // Shift already ended
      mocks.getTimeEntry.mockResolvedValue({ id: 'e-ended', ended_at: '2026-09-10T12:00:00Z' });
      await expect(closeOpenShiftAction('e-ended', new FormData())).rejects.toThrow('That shift has already been closed.');

      // Invalid manual end time
      mocks.getTimeEntry.mockResolvedValue({ id: 'e-open', started_at: '2026-09-10T08:00:00Z', ended_at: null });
      const badForm = new FormData();
      badForm.set('endedAt', 'not-a-date');
      await expect(closeOpenShiftAction('e-open', badForm)).rejects.toThrow('isn\'t a real time');

      // Problem reported by validateManualEnd
      mocks.validateManualEnd.mockReturnValue('End time cannot be before start time.');
      const form = new FormData();
      form.set('endedAt', '2026-09-10T07:00:00Z');
      await expect(closeOpenShiftAction('e-open', form)).rejects.toThrow('End time cannot be before start time.');
    });

    it('geocodeJobAction handles missing address or geocoder failures', async () => {
      // Missing address
      const noAddressDb = createMockSupabase({ jobs: { data: { id: 'job-no-addr', address: null } } });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: noAddressDb, accountId });
      const res1 = await geocodeJobAction('job-no-addr');
      expect(res1).toEqual({ ok: false, error: 'Job has no address to geocode' });

      // Geocoder returns null
      const addrDb = createMockSupabase({ jobs: { data: { id: 'job-unresolved', address: 'Unknown Galaxy' } } });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: addrDb, accountId });
      mocks.geocodeAddress.mockResolvedValue(null);
      const res2 = await geocodeJobAction('job-unresolved');
      expect(res2).toEqual({ ok: false, error: 'Could not resolve coordinates for this address' });
    });
  });
});

