import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sendCrewMagicLink,
  stampCrewInvite,
  revokeCrewAccess,
  linkCrewUserByEmail,
  linkCrewUserByPhone,
  loadCrewContext,
  requireCrewContext,
  listFieldBusinesses,
} from '@/lib/crew-auth';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url) => {
    throw new Error(`Redirected to ${url}`);
  }),
}));

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn(async () => ({ data: {}, error: null })) },
  })),
}));

vi.mock('@/lib/app-origin', () => ({ APP_ORIGIN: 'http://localhost:3000' }));
vi.mock('@/lib/business-name', () => ({ pickBusinessName: vi.fn(() => 'Test Biz') }));
vi.mock('@/lib/field-account', () => ({ readFieldAccount: vi.fn(() => null) }));
vi.mock('@/lib/phone', () => ({ normalizeUsPhone: vi.fn((p) => (p ? '+12345678901' : null)) }));
vi.mock('@/lib/time-clock', () => ({ normalizeTimeClockMode: vi.fn(() => 'optional') }));
vi.mock('@/lib/crew', () => ({ listCrewForUser: vi.fn() }));

let mockAdmin: any;
let mockSupabase: any;

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => mockAdmin,
}));

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: async () => mockSupabase,
}));

describe('crew-auth coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 're_test123';
    
    mockAdmin = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: function (resolve: any) {
        return Promise.resolve({ data: null, error: null }).then(resolve);
      },
      auth: {
        admin: {
          generateLink: vi.fn().mockResolvedValue({ data: { properties: { hashed_token: 'hash' } }, error: null }),
        },
      },
    };

    mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u_123' } }, error: null }),
      },
    };
  });

  describe('sendCrewMagicLink', () => {
    it('throws if RESEND_API_KEY is missing', async () => {
      delete process.env.RESEND_API_KEY;
      await expect(sendCrewMagicLink('t@t.com', 'Biz')).rejects.toThrow('Email provider is not configured.');
    });

    it('throws if account is suspended', async () => {
      mockAdmin.maybeSingle.mockResolvedValueOnce({ data: { suspended_at: 'yes' }, error: null });
      await expect(sendCrewMagicLink('t@t.com', 'Biz', 'acc_1')).rejects.toThrow('Account is suspended.');
    });

    it('throws if link generation fails', async () => {
      mockAdmin.auth.admin.generateLink.mockResolvedValueOnce({ data: null, error: { message: 'Failed' } });
      await expect(sendCrewMagicLink('t@t.com', 'Biz')).rejects.toThrow('Failed');
    });

    it('succeeds without accountId', async () => {
      await sendCrewMagicLink('t@t.com', 'Biz');
      expect(mockAdmin.auth.admin.generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 't@t.com' });
    });
  });

  describe('stampCrewInvite', () => {
    it('handles update failure gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const customAdmin = {
        from: () => ({
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
          update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: { message: 'Oops' } }) }) }),
        }),
      };
      await stampCrewInvite(customAdmin as any, 'acc_1', 'crw_1');
      expect(consoleSpy).toHaveBeenCalledWith('Crew invite stamp failed:', 'Oops');
    });
  });

  describe('revokeCrewAccess', () => {
    it('deletes membership if no other active crew row', async () => {
      mockAdmin.maybeSingle.mockResolvedValueOnce({ data: { user_id: 'u_1' } });
      // no others found -> returns []
      mockAdmin.is.mockResolvedValueOnce({ data: [] });
      await revokeCrewAccess(mockAdmin, 'acc_1', 'crw_1');
      expect(mockAdmin.delete).toHaveBeenCalled();
    });

    it('does not delete membership if another active crew row exists', async () => {
      mockAdmin.maybeSingle.mockResolvedValueOnce({ data: { user_id: 'u_1' } });
      // others found
      mockAdmin.is.mockResolvedValueOnce({ data: [{ id: 'other' }] });
      await revokeCrewAccess(mockAdmin, 'acc_1', 'crw_1');
      expect(mockAdmin.delete).not.toHaveBeenCalled();
    });
  });

  describe('linkCrewUserByEmail', () => {
    it('returns empty if no active rows', async () => {
      mockAdmin.eq.mockResolvedValueOnce({ data: [] });
      const res = await linkCrewUserByEmail('u_1', 't@t.com');
      expect(res).toEqual([]);
    });

    it('skips suspended accounts', async () => {
      mockAdmin.eq.mockResolvedValueOnce({ data: [{ id: '1', account_id: 'a_1' }] });
      mockAdmin.in.mockResolvedValueOnce({ data: [{ id: 'a_1', suspended_at: 'yes' }] });
      const res = await linkCrewUserByEmail('u_1', 't@t.com');
      expect(res).toEqual([]);
    });

    it('updates and upserts memberships', async () => {
      mockAdmin.eq.mockResolvedValueOnce({ data: [{ id: '1', account_id: 'a_1' }] });
      mockAdmin.in.mockResolvedValueOnce({ data: [{ id: 'a_1', suspended_at: null }] });
      const res = await linkCrewUserByEmail('u_1', 't@t.com');
      expect(res).toEqual(['a_1']);
      expect(mockAdmin.update).toHaveBeenCalled();
      expect(mockAdmin.upsert).toHaveBeenCalled();
    });
  });

  describe('linkCrewUserByPhone', () => {
    it('returns empty for invalid phone', async () => {
      const phoneLib = await import('@/lib/phone');
      vi.mocked(phoneLib.normalizeUsPhone).mockReturnValueOnce(null);
      expect(await linkCrewUserByPhone('u_1', 'bad')).toEqual([]);
    });

    it('links phone accounts and ignores suspended', async () => {
      mockAdmin.eq.mockResolvedValueOnce({ data: [{ id: '1', account_id: 'a_1', phone: '123' }, { id: '2', account_id: 'a_2', phone: '123' }] });
      mockAdmin.in.mockResolvedValueOnce({ data: [{ id: 'a_1', suspended_at: 'yes' }, { id: 'a_2', suspended_at: null }] });
      
      const res = await linkCrewUserByPhone('u_1', '1234567890');
      expect(res).toEqual(['a_2']);
    });
  });

  describe('requireCrewContext / loadCrewContext', () => {
    it('redirects to /field/login if no user', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
      await expect(requireCrewContext()).rejects.toThrow('Redirected to /field/login');
    });

    it('redirects if suspended', async () => {
      const crewLib = await import('@/lib/crew');
      vi.mocked(crewLib.listCrewForUser).mockResolvedValueOnce([{ id: '1', account_id: 'a_1' }] as any);
      mockAdmin.maybeSingle
        .mockResolvedValueOnce({ data: null }) // sites
        .mockResolvedValueOnce({ data: { suspended_at: 'yes' } }); // loadFieldAccountRow

      await expect(requireCrewContext()).rejects.toThrow('Redirected to /account-suspended');
    });

    it('redirects to /field/choose if multiple accounts but none chosen', async () => {
      const crewLib = await import('@/lib/crew');
      vi.mocked(crewLib.listCrewForUser).mockResolvedValueOnce([{ id: '1', account_id: 'a_1' }, { id: '2', account_id: 'a_2' }] as any);
      
      await expect(requireCrewContext()).rejects.toThrow('Redirected to /field/choose');
    });
  });

  describe('listFieldBusinesses', () => {
    it('returns empty list if suspended', async () => {
      const crewLib = await import('@/lib/crew');
      vi.mocked(crewLib.listCrewForUser).mockResolvedValueOnce([{ id: '1', account_id: 'a_1' }] as any);
      mockAdmin.in.mockResolvedValueOnce({ data: [{ id: 'a_1', suspended_at: 'yes' }] });
      
      const res = await listFieldBusinesses();
      expect(res?.businesses).toEqual([]);
    });

    it('returns businesses mapping', async () => {
      const crewLib = await import('@/lib/crew');
      vi.mocked(crewLib.listCrewForUser).mockResolvedValueOnce([{ id: '1', account_id: 'a_1' }] as any);
      mockAdmin.in
        .mockResolvedValueOnce({ data: [{ id: 'a_1', suspended_at: null }] }) // accounts suspended check
        .mockResolvedValueOnce({ data: [{ account_id: 'a_1', company_name: 'Site Name' }] }) // sites names
        .mockResolvedValueOnce({ data: [{ id: 'a_1', business_name: 'Biz Name' }] }); // accounts names
      
      const res = await listFieldBusinesses();
      expect(res?.businesses[0].name).toBe('Test Biz');
    });
  });
});
