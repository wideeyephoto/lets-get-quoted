import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CREW_SMS_DISCLOSURE_VERSION } from '@/lib/crew-sms-disclosure';

// Mock dependencies
const mockRecordCrewSmsConsent = vi.fn();
const mockSendCrewWelcomeSms = vi.fn();
const mockSendCrewMagicLink = vi.fn();
const mockStampCrewInvite = vi.fn();
const mockCreateCrewMemberForSeatGate = vi.fn();
const mockUpdateCrewMember = vi.fn();
const mockSaveCrewStartAddress = vi.fn();
const mockSetCrewArrivalPermissions = vi.fn();
const mockLoadBusinessName = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock('next/cache', () => ({
  revalidatePath: (...args: any[]) => mockRevalidatePath(...args),
  revalidateTag: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: () => undefined,
  }),
}));

vi.mock('@/lib/business-name', () => ({
  loadBusinessName: (...args: any[]) => mockLoadBusinessName(...args),
}));

vi.mock('@/lib/sms', () => ({
  recordCrewSmsConsent: (...args: any[]) => mockRecordCrewSmsConsent(...args),
  sendCrewWelcomeSms: (...args: any[]) => mockSendCrewWelcomeSms(...args),
  sendCrewAssignmentSms: vi.fn(),
}));

vi.mock('@/lib/crew-auth', () => ({
  sendCrewMagicLink: (...args: any[]) => mockSendCrewMagicLink(...args),
  stampCrewInvite: (...args: any[]) => mockStampCrewInvite(...args),
  revokeCrewAccess: vi.fn(),
}));

vi.mock('@/lib/billing/crew-seat-entitlement', () => ({
  createCrewMemberForSeatGate: (...args: any[]) => mockCreateCrewMemberForSeatGate(...args),
  setCrewActiveForSeatGate: vi.fn(),
}));

vi.mock('@/lib/crew', () => ({
  deleteArchivedCrewMember: vi.fn(),
  listCrew: vi.fn(),
  listCrewIdsForJob: vi.fn(),
  saveCrewStartAddress: (...args: any[]) => mockSaveCrewStartAddress(...args),
  setCrewArrivalPermissions: (...args: any[]) => mockSetCrewArrivalPermissions(...args),
  setJobCrewAssignments: vi.fn(),
  updateCrewPhoto: vi.fn(),
  updateCrewMember: (...args: any[]) => mockUpdateCrewMember(...args),
}));

let mockExistingPhone = '(248) 555-0000';
let mockInsertResult: any = { data: { id: 'sub-id-1', name: 'Elite Electric' }, error: null };
let mockUpdateResult: any = { error: null };

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => ({
    from: () => ({
      update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    }),
  }),
  requireOfficeContext: async () => {
    const builder: any = {
      eq: () => builder,
      neq: () => builder,
      is: () => builder,
      limit: () => builder,
      order: () => builder,
      maybeSingle: async () => ({
        data: { phone: mockExistingPhone },
        error: null,
      }),
      single: async () => mockInsertResult,
      select: () => builder,
      insert: () => builder,
      update: () => builder,
    };

    return {
      supabase: {
        from: () => builder,
      },
      accountId: '00000000-0000-0000-0000-000000000001',
      userId: '11111111-1111-1111-1111-111111111111',
    };
  },
}));

const { createCrewAction, updateCrewAction } = await import('@/app/dashboard/crew/actions');
const { createSubcontractorAction, updateSubcontractorAction } = await import('@/app/dashboard/crew/subcontractor-actions');

beforeEach(() => {
  vi.clearAllMocks();
  mockExistingPhone = '(248) 555-0000';
  mockInsertResult = { data: { id: 'sub-id-1', name: 'Elite Electric' }, error: null };
  mockUpdateResult = { error: null };

  mockRecordCrewSmsConsent.mockResolvedValue('recorded');
  mockSendCrewWelcomeSms.mockResolvedValue({ id: 'msg-1' });
  mockSendCrewMagicLink.mockResolvedValue(undefined);
  mockStampCrewInvite.mockResolvedValue(undefined);
  mockLoadBusinessName.mockResolvedValue('Acme Construction');
  mockCreateCrewMemberForSeatGate.mockImplementation(async (_s, _a, _acc, data) => ({
    id: 'crew-emp-101',
    name: data.name,
    phone: data.phone,
    email: data.email,
  }));
});

describe('Crew Add & Update Lifecycle Variants', () => {
  describe('Variant 1: Employee add with field invite ("Save and invite")', () => {
    it('creates crew member, records audited consent, queues welcome SMS, and dispatches magic link invite', async () => {
      const formData = new FormData();
      formData.set('name', 'Alice Smith');
      formData.set('phone', '(248) 555-0101');
      formData.set('email', 'alice@example.com');
      formData.set('intent', 'invite');
      formData.set('crewSmsConsent', 'on');
      formData.set('crewSmsDisclosureVersion', CREW_SMS_DISCLOSURE_VERSION);

      const result = await createCrewAction({ status: 'idle' }, formData);

      expect(result.status).toBe('added');
      if (result.status === 'added') {
        expect(result.name).toBe('Alice Smith');
        expect(result.invite).toBe('sent');
        expect(result.message).toContain('An invitation to the field app is on its way to alice@example.com.');
      }

      // Verify consent recording
      expect(mockRecordCrewSmsConsent).toHaveBeenCalledWith({
        accountId: '00000000-0000-0000-0000-000000000001',
        phone: '(248) 555-0101',
        disclosureVersion: CREW_SMS_DISCLOSURE_VERSION,
        userId: '11111111-1111-1111-1111-111111111111',
        crewId: 'crew-emp-101',
        sourcePage: '/dashboard/crew',
        source: 'crew_roster',
      });

      // Verify welcome SMS
      expect(mockSendCrewWelcomeSms).toHaveBeenCalledWith({
        accountId: '00000000-0000-0000-0000-000000000001',
        crewId: 'crew-emp-101',
        phone: '(248) 555-0101',
        crewName: 'Alice Smith',
        businessName: 'Acme Construction',
      });

      // Verify invite flow
      expect(mockSendCrewMagicLink).toHaveBeenCalledWith(
        'alice@example.com',
        'Acme Construction',
        '00000000-0000-0000-0000-000000000001',
      );
      expect(mockStampCrewInvite).toHaveBeenCalledWith(
        expect.anything(),
        '00000000-0000-0000-0000-000000000001',
        'crew-emp-101',
      );
    });
  });

  describe('Variant 2: Employee add without invite ("Save without inviting")', () => {
    it('creates crew member, records consent and sends welcome SMS, but skips invite email', async () => {
      const formData = new FormData();
      formData.set('name', 'Bob Jones');
      formData.set('phone', '(248) 555-0102');
      formData.set('email', 'bob@example.com');
      formData.set('intent', 'save');
      formData.set('crewSmsConsent', 'on');
      formData.set('crewSmsDisclosureVersion', CREW_SMS_DISCLOSURE_VERSION);

      const result = await createCrewAction({ status: 'idle' }, formData);

      expect(result.status).toBe('added');
      if (result.status === 'added') {
        expect(result.invite).toBe('skipped');
        expect(result.message).toBe('Bob Jones was added to your crew.');
      }

      expect(mockRecordCrewSmsConsent).toHaveBeenCalled();
      expect(mockSendCrewWelcomeSms).toHaveBeenCalled();
      expect(mockSendCrewMagicLink).not.toHaveBeenCalled();
      expect(mockStampCrewInvite).not.toHaveBeenCalled();
    });
  });

  describe('Variant 3: Employee add with invite intent but no email', () => {
    it('returns invite=no-email and prompts for email without failing the creation', async () => {
      const formData = new FormData();
      formData.set('name', 'Charlie Brown');
      formData.set('phone', '(248) 555-0103');
      formData.set('intent', 'invite');
      formData.set('crewSmsConsent', 'on');
      formData.set('crewSmsDisclosureVersion', CREW_SMS_DISCLOSURE_VERSION);

      const result = await createCrewAction({ status: 'idle' }, formData);

      expect(result.status).toBe('added');
      if (result.status === 'added') {
        expect(result.invite).toBe('no-email');
        expect(result.message).toContain('Add an email address to their profile to invite them to the field app.');
      }
      expect(mockSendCrewMagicLink).not.toHaveBeenCalled();
    });
  });

  describe('Variant 4: Employee add where email invite fails', () => {
    it('retains crew creation and flags invite=failed gracefully', async () => {
      mockSendCrewMagicLink.mockRejectedValueOnce(new Error('SMTP down'));

      const formData = new FormData();
      formData.set('name', 'Diana Prince');
      formData.set('phone', '(248) 555-0104');
      formData.set('email', 'diana@example.com');
      formData.set('intent', 'invite');
      formData.set('crewSmsConsent', 'on');
      formData.set('crewSmsDisclosureVersion', CREW_SMS_DISCLOSURE_VERSION);

      const result = await createCrewAction({ status: 'idle' }, formData);

      expect(result.status).toBe('added');
      if (result.status === 'added') {
        expect(result.invite).toBe('failed');
        expect(result.message).toContain('The field app invitation could not be sent — try again from their profile.');
      }
    });
  });

  describe('Variant 5: Employee phone number update with consent re-verification', () => {
    it('re-verifies consent and sends welcome SMS when phone changes', async () => {
      mockExistingPhone = '(248) 555-0000';

      const formData = new FormData();
      formData.set('name', 'Alice Smith');
      formData.set('phone', '(248) 555-9999');
      formData.set('crewSmsConsent', 'on');
      formData.set('crewSmsDisclosureVersion', CREW_SMS_DISCLOSURE_VERSION);

      await expect(updateCrewAction('crew-emp-101', formData)).resolves.not.toThrow();

      expect(mockRecordCrewSmsConsent).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: '(248) 555-9999',
          crewId: 'crew-emp-101',
          disclosureVersion: CREW_SMS_DISCLOSURE_VERSION,
        }),
      );
      expect(mockSendCrewWelcomeSms).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: '(248) 555-9999',
          crewId: 'crew-emp-101',
        }),
      );
      expect(mockUpdateCrewMember).toHaveBeenCalled();
    });

    it('bypasses consent re-verification when phone number remains the same', async () => {
      mockExistingPhone = '+12485550000';

      const formData = new FormData();
      formData.set('name', 'Alice Smith');
      formData.set('phone', '(248) 555-0000'); // same normalized number

      await expect(updateCrewAction('crew-emp-101', formData)).resolves.not.toThrow();

      expect(mockRecordCrewSmsConsent).not.toHaveBeenCalled();
      expect(mockSendCrewWelcomeSms).not.toHaveBeenCalled();
      expect(mockUpdateCrewMember).toHaveBeenCalled();
    });

    it('rejects phone number update if consent checkbox is omitted', async () => {
      mockExistingPhone = '(248) 555-0000';

      const formData = new FormData();
      formData.set('name', 'Alice Smith');
      formData.set('phone', '(248) 555-9999'); // changed phone

      await expect(updateCrewAction('crew-emp-101', formData)).rejects.toThrow(
        'Confirm that this crew member gave permission to receive text messages.',
      );
      expect(mockRecordCrewSmsConsent).not.toHaveBeenCalled();
    });

    it('rejects phone number update if disclosure version is outdated', async () => {
      mockExistingPhone = '(248) 555-0000';

      const formData = new FormData();
      formData.set('name', 'Alice Smith');
      formData.set('phone', '(248) 555-9999');
      formData.set('crewSmsConsent', 'on');
      formData.set('crewSmsDisclosureVersion', 'legacy-v0');

      await expect(updateCrewAction('crew-emp-101', formData)).rejects.toThrow(
        'The SMS consent wording has changed. Review it and try again.',
      );
      expect(mockRecordCrewSmsConsent).not.toHaveBeenCalled();
    });
  });

  describe('Variant 6: Subcontractor add with explicit consent & welcome SMS', () => {
    it('creates subcontractor, records audited consent, and sends welcome SMS', async () => {
      const formData = new FormData();
      formData.set('name', 'Dave Roofer');
      formData.set('companyName', 'Apex Roofing');
      formData.set('phone', '(248) 555-0201');
      formData.set('trades', 'Roofing');
      formData.set('crewSmsConsent', 'on');
      formData.set('crewSmsDisclosureVersion', CREW_SMS_DISCLOSURE_VERSION);

      const result = await createSubcontractorAction({ status: 'idle' }, formData);

      expect(result.status).toBe('added');
      if (result.status === 'added') {
        expect(result.message).toContain('Apex Roofing was added to your subcontractors.');
      }

      expect(mockRecordCrewSmsConsent).toHaveBeenCalledWith({
        accountId: '00000000-0000-0000-0000-000000000001',
        phone: '(248) 555-0201',
        disclosureVersion: CREW_SMS_DISCLOSURE_VERSION,
        userId: '11111111-1111-1111-1111-111111111111',
        crewId: 'sub-id-1',
        sourcePage: '/dashboard/crew',
        source: 'crew_roster',
      });

      expect(mockSendCrewWelcomeSms).toHaveBeenCalledWith({
        accountId: '00000000-0000-0000-0000-000000000001',
        crewId: 'sub-id-1',
        phone: '(248) 555-0201',
        crewName: 'Dave Roofer',
        businessName: 'Acme Construction',
      });
    });

    it('rejects subcontractor add when consent checkbox is missing', async () => {
      const formData = new FormData();
      formData.set('name', 'Dave Roofer');
      formData.set('phone', '(248) 555-0201');
      formData.set('trades', 'Roofing');

      const result = await createSubcontractorAction({ status: 'idle' }, formData);

      expect(result).toEqual({
        status: 'error',
        message: 'Confirm that this subcontractor gave permission to receive text messages.',
      });
      expect(mockRecordCrewSmsConsent).not.toHaveBeenCalled();
      expect(mockSendCrewWelcomeSms).not.toHaveBeenCalled();
    });

    it('rejects subcontractor add when disclosure version is invalid', async () => {
      const formData = new FormData();
      formData.set('name', 'Dave Roofer');
      formData.set('phone', '(248) 555-0201');
      formData.set('trades', 'Roofing');
      formData.set('crewSmsConsent', 'on');
      formData.set('crewSmsDisclosureVersion', 'bad-version');

      const result = await createSubcontractorAction({ status: 'idle' }, formData);

      expect(result).toEqual({
        status: 'error',
        message: 'The SMS consent wording has changed. Review it and try again.',
      });
      expect(mockRecordCrewSmsConsent).not.toHaveBeenCalled();
    });
  });

  describe('Variant 7: Subcontractor phone change with consent re-verification', () => {
    it('re-verifies consent and sends welcome SMS when phone changes', async () => {
      mockExistingPhone = '(248) 555-0000';

      const formData = new FormData();
      formData.set('name', 'Dave Roofer');
      formData.set('phone', '(248) 555-7777');
      formData.set('trades', 'Roofing');
      formData.set('crewSmsConsent', 'on');
      formData.set('crewSmsDisclosureVersion', CREW_SMS_DISCLOSURE_VERSION);

      await expect(updateSubcontractorAction('sub-id-1', formData)).resolves.not.toThrow();

      expect(mockRecordCrewSmsConsent).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: '(248) 555-7777',
          crewId: 'sub-id-1',
          disclosureVersion: CREW_SMS_DISCLOSURE_VERSION,
        }),
      );
      expect(mockSendCrewWelcomeSms).toHaveBeenCalled();
    });

    it('rejects subcontractor phone change if consent is omitted', async () => {
      mockExistingPhone = '(248) 555-0000';

      const formData = new FormData();
      formData.set('name', 'Dave Roofer');
      formData.set('phone', '(248) 555-7777');
      formData.set('trades', 'Roofing');

      await expect(updateSubcontractorAction('sub-id-1', formData)).rejects.toThrow(
        'Confirm that this subcontractor gave permission to receive text messages.',
      );
      expect(mockRecordCrewSmsConsent).not.toHaveBeenCalled();
    });

    it('bypasses consent re-verification when subcontractor phone is unchanged', async () => {
      mockExistingPhone = '+12485550000';

      const formData = new FormData();
      formData.set('name', 'Dave Roofer');
      formData.set('phone', '(248) 555-0000');
      formData.set('trades', 'Roofing');

      await expect(updateSubcontractorAction('sub-id-1', formData)).resolves.not.toThrow();

      expect(mockRecordCrewSmsConsent).not.toHaveBeenCalled();
      expect(mockSendCrewWelcomeSms).not.toHaveBeenCalled();
    });
  });

  describe('Variant 8: Suppressed consent & fail-closed security handling', () => {
    it('suppresses welcome SMS when recipient has a prior STOP opt-out on file for employee', async () => {
      mockRecordCrewSmsConsent.mockResolvedValue('suppressed');

      const formData = new FormData();
      formData.set('name', 'Opted Out Person');
      formData.set('phone', '(248) 555-9999');
      formData.set('crewSmsConsent', 'on');
      formData.set('crewSmsDisclosureVersion', CREW_SMS_DISCLOSURE_VERSION);

      const result = await createCrewAction({ status: 'idle' }, formData);

      expect(result.status).toBe('added');
      expect(mockRecordCrewSmsConsent).toHaveBeenCalled();
      // Welcome SMS must NOT be sent to a suppressed number
      expect(mockSendCrewWelcomeSms).not.toHaveBeenCalled();
    });

    it('suppresses welcome SMS when recipient has a prior STOP opt-out on file for subcontractor', async () => {
      mockRecordCrewSmsConsent.mockResolvedValue('suppressed');

      const formData = new FormData();
      formData.set('name', 'Opted Out Sub');
      formData.set('phone', '(248) 555-9999');
      formData.set('trades', 'Drywall');
      formData.set('crewSmsConsent', 'on');
      formData.set('crewSmsDisclosureVersion', CREW_SMS_DISCLOSURE_VERSION);

      const result = await createSubcontractorAction({ status: 'idle' }, formData);

      expect(result.status).toBe('added');
      expect(mockRecordCrewSmsConsent).toHaveBeenCalled();
      expect(mockSendCrewWelcomeSms).not.toHaveBeenCalled();
    });

    it('fails closed and errors out when consent recording fails in employee add', async () => {
      mockRecordCrewSmsConsent.mockResolvedValue('failed');

      const formData = new FormData();
      formData.set('name', 'Fail Person');
      formData.set('phone', '(248) 555-0999');
      formData.set('crewSmsConsent', 'on');
      formData.set('crewSmsDisclosureVersion', CREW_SMS_DISCLOSURE_VERSION);

      const result = await createCrewAction({ status: 'idle' }, formData);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.message).toBe('Could not record SMS consent evidence. SMS sending is not authorized.');
      }
      expect(mockSendCrewWelcomeSms).not.toHaveBeenCalled();
    });

    it('fails closed and errors out when consent recording fails in subcontractor add', async () => {
      mockRecordCrewSmsConsent.mockResolvedValue('failed');

      const formData = new FormData();
      formData.set('name', 'Fail Sub');
      formData.set('phone', '(248) 555-0999');
      formData.set('trades', 'Painting');
      formData.set('crewSmsConsent', 'on');
      formData.set('crewSmsDisclosureVersion', CREW_SMS_DISCLOSURE_VERSION);

      const result = await createSubcontractorAction({ status: 'idle' }, formData);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.message).toBe('Could not record SMS consent evidence. SMS sending is not authorized.');
      }
      expect(mockSendCrewWelcomeSms).not.toHaveBeenCalled();
    });
  });
});
