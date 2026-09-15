import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncGoogleLsaAccount, syncAllGoogleLsaAccounts } from '@/lib/google-lsa/sync';
import * as apiModule from '@/lib/google-lsa/api';
import * as connectionModule from '@/lib/google-lsa/connection';
import * as authModule from '@/lib/auth';
import * as leadsModule from '@/lib/leads';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/leads', () => ({
  createLead: vi.fn(),
}));

vi.mock('@/lib/google-lsa/api', () => ({
  fetchLegacyLsaAccountReport: vi.fn(),
  fetchPmaxLsaDailySpend: vi.fn(),
  discoverGoogleLsaCustomers: vi.fn(),
  listGoogleLsaConversations: vi.fn(),
  listGoogleLsaLeads: vi.fn(),
}));

vi.mock('@/lib/google-lsa/connection', () => ({
  activeGoogleLsaConnection: vi.fn(),
  claimGoogleLsaSync: vi.fn(),
  completeGoogleLsaSync: vi.fn(),
  listGoogleLsaConnectedAccountIds: vi.fn(),
  reconcileGoogleLsaCandidates: vi.fn(),
}));

describe('Google LSA Sync Lib', () => {
  let adminMock: any;
  let queryMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    queryMock = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      then: vi.fn((resolve) => resolve({ data: [], error: null }))
    };

    adminMock = {
      from: vi.fn(() => queryMock),
    };

    (authModule.createAdminClient as any).mockReturnValue(adminMock);
  });

  describe('syncGoogleLsaAccount', () => {
    it('returns busy if lease not acquired', async () => {
      (connectionModule.claimGoogleLsaSync as any).mockResolvedValue(null);
      const res = await syncGoogleLsaAccount('acct1');
      expect(res.busy).toBe(true);
      expect(res.ok).toBe(false);
    });

    it('returns error if connection fails', async () => {
      (connectionModule.claimGoogleLsaSync as any).mockResolvedValue('now');
      (connectionModule.activeGoogleLsaConnection as any).mockResolvedValue(null);
      
      const res = await syncGoogleLsaAccount('acct1');
      expect(res.ok).toBe(false);
      expect(res.message).toContain('needs to be renewed');
      expect(connectionModule.completeGoogleLsaSync).toHaveBeenCalled();
    });

    it('syncs correctly for a full run', async () => {
      (connectionModule.claimGoogleLsaSync as any).mockResolvedValue('now');
      (connectionModule.activeGoogleLsaConnection as any).mockResolvedValue({
        accessToken: 'token',
        customerId: 'cust1',
        customerTimeZone: 'America/New_York',
        campaignMode: 'pmax',
        campaignId: 'camp1'
      });

      (apiModule.discoverGoogleLsaCustomers as any).mockResolvedValue([
        { customerId: 'cust1', descriptiveName: 'Cust', timeZone: 'America/New_York', loginCustomerId: 'login1', campaign: { id: 'camp1' }, campaignKind: 'pmax' }
      ]);
      (connectionModule.reconcileGoogleLsaCandidates as any).mockResolvedValue({
        customerName: 'Cust', timeZone: 'America/New_York', loginCustomerId: 'login1', campaignId: 'camp1', campaignMode: 'pmax'
      });

      (apiModule.listGoogleLsaLeads as any).mockResolvedValue([
        { 
          resourceName: 'customers/cust1/localServicesLeads/lead1', 
          id: 'lead1', 
          categoryId: '1',
          serviceId: '1',
          leadType: 'MESSAGE',
          leadStatus: 'NEW',
          creationDateTime: '2023-01-01 00:00:00',
          locale: 'en',
          leadCharged: true,
          creditState: 'PENDING',
          creditStateLastUpdateDateTime: null,
          leadFeedbackSubmitted: false,
          noteDescription: null,
          noteEditDateTime: null,
          contactDetails: { phoneNumber: '5551234567' } 
        }
      ]);
      (apiModule.listGoogleLsaConversations as any).mockResolvedValue([
        { 
          resourceName: 'customers/cust1/localServicesLeadConversations/conv1',
          id: 'conv1',
          leadResourceName: 'customers/cust1/localServicesLeads/lead1', 
          conversationChannel: 'MESSAGE',
          participantType: 'CONSUMER',
          eventDateTime: '2023-01-01 00:00:00',
          callDurationMillis: null,
          callRecordingUrl: null,
          messageText: null,
          attachmentUrls: []
        }
      ]);
      (apiModule.fetchPmaxLsaDailySpend as any).mockResolvedValue([
        { campaignId: 'camp1', date: '2023-01-01', costMicros: 1000000 }
      ]);

      (leadsModule.createLead as any).mockResolvedValue({ id: 'crm_lead_1' });

      // Mock known leads query
      queryMock.then = vi.fn().mockImplementation((resolve) => resolve({
        data: [{ google_lead_id: 'lead1' }], error: null
      }));

      const res = await syncGoogleLsaAccount('acct1');
      if (!res.ok) console.log(res);
      expect(res.ok).toBe(true);
      expect(res.leadsSeen).toBe(1);
      expect(res.leadsLinked).toBe(1);
      expect(res.conversations).toBe(1);
      expect(res.spendRows).toBe(1);
    });
  });

  describe('syncAllGoogleLsaAccounts', () => {
    it('processes all accounts', async () => {
      (connectionModule.listGoogleLsaConnectedAccountIds as any).mockResolvedValue(['a1', 'a2']);
      (connectionModule.claimGoogleLsaSync as any).mockResolvedValue('now');
      (connectionModule.activeGoogleLsaConnection as any)
        .mockResolvedValueOnce({ accessToken: 't1', customerId: 'c1' })
        .mockResolvedValueOnce({ accessToken: 't2', customerId: 'c2' });
      
      (apiModule.listGoogleLsaLeads as any).mockResolvedValue([]);
      (apiModule.listGoogleLsaConversations as any).mockResolvedValue([]);
      (apiModule.fetchPmaxLsaDailySpend as any).mockResolvedValue([]);
      (apiModule.fetchLegacyLsaAccountReport as any).mockResolvedValue([]);

      const res = await syncAllGoogleLsaAccounts();
      expect(res.processed).toBe(2);
    });
  });
});
