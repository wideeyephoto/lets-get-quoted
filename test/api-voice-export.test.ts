import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/voice/export/route';

vi.mock('@/lib/auth', () => ({
  requireOfficeContext: vi.fn(),
}));

vi.mock('@/lib/voice/call-workspace', () => ({
  loadVoiceWorkspaceQueue: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  unstable_rethrow: vi.fn(),
}));

describe('Voice Export Route', () => {
  let requireOfficeContextMock: any;
  let loadVoiceWorkspaceQueueMock: any;
  let unstable_rethrowMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    requireOfficeContextMock = (await import('@/lib/auth')).requireOfficeContext;
    requireOfficeContextMock.mockResolvedValue({ supabase: {}, accountId: 'acct_1' });

    loadVoiceWorkspaceQueueMock = (await import('@/lib/voice/call-workspace')).loadVoiceWorkspaceQueue;
    loadVoiceWorkspaceQueueMock.mockResolvedValue({
      items: [
        {
          id: '1',
          startedAt: '2023-01-01',
          callerNumber: '+123',
          aiSeconds: 60,
          billedMinutes: 1,
          outcome: 'completed',
          workflow: { disposition: 'resolved', urgency: 'low' },
          leadId: 'L1',
          summary: 'A call with, commas and "quotes"'
        }
      ],
      counters: { totalCount: 1 }
    });

    unstable_rethrowMock = (await import('next/navigation')).unstable_rethrow;
    unstable_rethrowMock.mockImplementation(() => {});
  });

  const makeReq = (url: string) => new Request(url);

  it('exports csv', async () => {
    const res = await GET(makeReq('http://localhost/api/voice/export'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    const text = await res.text();
    expect(text).toContain('Call ID');
    expect(text).toContain('1');
    expect(text).toContain("'+123");
    expect(text).toContain('"A call with, commas and ""quotes"""');
  });

  it('filters by selected ids', async () => {
    const res = await GET(makeReq('http://localhost/api/voice/export?ids=2'));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("'+123");
  });

  it('handles formula injection', async () => {
    loadVoiceWorkspaceQueueMock.mockResolvedValue({
      items: [
        {
          id: '=CMD()',
          startedAt: '',
          callerNumber: '',
          aiSeconds: 0,
          billedMinutes: 0,
          outcome: '',
          workflow: { disposition: '', urgency: '' },
          leadId: '',
          summary: ''
        }
      ],
      counters: { totalCount: 1 }
    });
    const res = await GET(makeReq('http://localhost/api/voice/export'));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("'=CMD()");
  });

  it('handles large export warning', async () => {
    const items = new Array(1000).fill(null).map((_, i) => ({
      id: String(i),
      startedAt: '',
      callerNumber: '',
      aiSeconds: 0,
      billedMinutes: 0,
      outcome: '',
      workflow: { disposition: '', urgency: '' },
      leadId: '',
      summary: ''
    }));
    loadVoiceWorkspaceQueueMock.mockResolvedValue({
      items,
      counters: { totalCount: 1500 }
    });
    const res = await GET(makeReq('http://localhost/api/voice/export'));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('# Warning: Export capped at 1000 rows.');
  });

  it('handles error', async () => {
    requireOfficeContextMock.mockRejectedValue(new Error('fail'));
    const res = await GET(makeReq('http://localhost/api/voice/export'));
    expect(res.status).toBe(500);
    expect(unstable_rethrowMock).toHaveBeenCalled();
  });
});
