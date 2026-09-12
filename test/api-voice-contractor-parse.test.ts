import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/voice/contractor-parse/route';

vi.mock('@/lib/auth', () => ({
  getCurrentMembership: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/leads', () => ({
  getLead: vi.fn(),
}));

vi.mock('@/lib/jobs', () => ({
  getJob: vi.fn(),
  parseQuoteItems: vi.fn((x) => x),
}));

vi.mock('@/lib/contractor-voice-ai', () => ({
  parseContractorVoicePrompt: vi.fn(),
}));

describe('Voice Contractor Parse Route', () => {
  let createSupabaseServerClientMock: any;
  let getUserMock: any;
  let getCurrentMembershipMock: any;
  let getLeadMock: any;
  let getJobMock: any;
  let parseContractorVoicePromptMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    getUserMock = vi.fn().mockResolvedValue({ data: { user: { id: 'user_1' } } });
    createSupabaseServerClientMock = (await import('@/lib/supabase-server')).createSupabaseServerClient;
    createSupabaseServerClientMock.mockResolvedValue({
      auth: { getUser: getUserMock }
    });

    getCurrentMembershipMock = (await import('@/lib/auth')).getCurrentMembership;
    getCurrentMembershipMock.mockResolvedValue({ accountId: 'acct_1' });

    getLeadMock = (await import('@/lib/leads')).getLead;
    getLeadMock.mockResolvedValue({ id: 'L1', name: 'Lead 1' });

    getJobMock = (await import('@/lib/jobs')).getJob;
    getJobMock.mockResolvedValue({ id: 'J1', ref: 'Ref 1' });

    parseContractorVoicePromptMock = (await import('@/lib/contractor-voice-ai')).parseContractorVoicePrompt;
    parseContractorVoicePromptMock.mockResolvedValue({ intent: 'update_lead' });
  });

  const makeReq = (body: any) => new Request('http://localhost/api/voice/contractor-parse', { method: 'POST', body: JSON.stringify(body) });

  it('handles missing user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeReq({}));
    expect(res.status).toBe(401);
  });

  it('handles missing workspace', async () => {
    getCurrentMembershipMock.mockResolvedValue({ accountId: null });
    const res = await POST(makeReq({}));
    expect(res.status).toBe(403);
  });

  it('handles invalid json', async () => {
    const req = new Request('http://localhost/api/voice/contractor-parse', { method: 'POST', body: '{bad' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('handles missing transcript', async () => {
    const res = await POST(makeReq({ transcript: '   ' }));
    expect(res.status).toBe(400);
  });

  it('parses lead with id', async () => {
    const res = await POST(makeReq({ transcript: 'Hello', targetType: 'lead', targetId: '12345678-1234-1234-1234-123456789012' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result.intent).toBe('update_lead');
    expect(getLeadMock).toHaveBeenCalled();
  });

  it('parses job with id', async () => {
    const res = await POST(makeReq({ transcript: 'Hello', targetType: 'job', targetId: '12345678-1234-1234-1234-123456789012' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result.intent).toBe('update_lead');
    expect(getJobMock).toHaveBeenCalled();
  });

  it('handles getLead failure gracefully', async () => {
    getLeadMock.mockRejectedValue(new Error('fail'));
    const res = await POST(makeReq({ transcript: 'Hello', targetType: 'lead', targetId: '12345678-1234-1234-1234-123456789012' }));
    expect(res.status).toBe(200);
  });

  it('handles parse failure', async () => {
    parseContractorVoicePromptMock.mockRejectedValue(new Error('fail'));
    const res = await POST(makeReq({ transcript: 'Hello' }));
    expect(res.status).toBe(500);
  });
});
