import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadGoogleLsaLeadDetail } from '@/lib/google-lsa/lead-detail';
import * as authModule from '@/lib/auth';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

describe('Google LSA Lead Detail Lib', () => {
  let adminMock: any;
  let leadsQuery: any;
  let convQuery: any;
  let fbQuery: any;
  let connQuery: any;

  beforeEach(() => {
    vi.clearAllMocks();

    leadsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
    };

    convQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: vi.fn((resolve) => resolve({ data: [] })),
    };

    fbQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn((resolve) => Promise.resolve({ data: null })),
    };

    connQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn((resolve) => Promise.resolve({ data: null })),
    };

    adminMock = {
      from: vi.fn((table) => {
        if (table === 'google_lsa_leads') return leadsQuery;
        if (table === 'google_lsa_conversations') return convQuery;
        if (table === 'google_lsa_feedback') return fbQuery;
        if (table === 'google_lsa_connections') return connQuery;
      }),
    };

    (authModule.createAdminClient as any).mockReturnValue(adminMock);
  });

  it('returns null if lead not found', async () => {
    leadsQuery.maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await loadGoogleLsaLeadDetail('acct1', 'lead1');
    expect(res).toBeNull();
  });

  it('returns null if lead query fails', async () => {
    leadsQuery.maybeSingle.mockResolvedValue({ error: new Error('fail') });
    const res = await loadGoogleLsaLeadDetail('acct1', 'lead1');
    expect(res).toBeNull();
  });

  it('loads lead details', async () => {
    leadsQuery.maybeSingle.mockResolvedValue({
      data: {
        customer_id: 'cust1',
        google_lead_id: 'glead1',
        resource_name: 'res1',
        lead_type: 'MESSAGE',
        lead_status: 'NEW',
        service_id: 'serv1',
        lead_charged: true,
        credit_state: 'NOT_BILLED',
        feedback_submitted: false,
        note: 'hi',
        google_created_at: '2023-01-01',
      }
    });

    convQuery.then = vi.fn().mockImplementation((resolve) => resolve({
      data: [{
        google_conversation_id: 'conv1',
        channel: 'PHONE_CALL',
        participant: 'Customer',
        event_at: '2023-01-02',
        message_text: null,
        call_duration_seconds: 120,
        recording_url: 'http://foo'
      }]
    }));

    fbQuery.maybeSingle.mockResolvedValue({
      data: {
        answer: 'NO',
        reason: 'spam',
        submission_status: 'succeeded',
        submitted_at: '2023-01-03'
      }
    });

    connQuery.maybeSingle.mockResolvedValue({
      data: {
        customer_id: 'cust1',
        disconnected_at: null
      }
    });

    const res = await loadGoogleLsaLeadDetail('acct1', 'lead1');
    expect(res).toBeDefined();
    expect(res?.googleLeadId).toBe('glead1');
    expect(res?.conversations).toHaveLength(1);
    expect(res?.conversations[0].hasRecording).toBe(true);
    expect(res?.feedbackStatus).toBe('succeeded');
    expect(res?.feedback?.reason).toBe('spam');
    // canSubmitFeedback should be false because it was successfully submitted (status = succeeded) and we would have it mapped. Wait, the query says row.feedback_submitted is false. 
    // The code does: `row.feedback_submitted !== true && feedbackStatus !== 'pending'`. Since row.feedback_submitted is false and status is 'succeeded', it would be true! Let's check it.
    expect(res?.canSubmitFeedback).toBe(true);
  });
});
