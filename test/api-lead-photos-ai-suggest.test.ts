import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '@/app/api/lead-photos/ai-suggest/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  getCurrentMembership: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/photo-proxy-guard', () => ({
  fetchProxyImage: vi.fn(),
}));

const mockGenerateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent }
  })),
  Type: { OBJECT: 'object', ARRAY: 'array', BOOLEAN: 'boolean', STRING: 'string', INTEGER: 'integer' }
}));

describe('Lead Photos AI Suggest Route', () => {
  let getCurrentMembershipMock: any;
  let createSupabaseServerClientMock: any;
  let fetchProxyImageMock: any;
  let getUserMock: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    process.env.GEMINI_API_KEY = 'fake_key';

    getUserMock = vi.fn().mockResolvedValue({ data: { user: { id: 'user_1' } } });
    createSupabaseServerClientMock = (await import('@/lib/supabase-server')).createSupabaseServerClient;
    createSupabaseServerClientMock.mockResolvedValue({
      auth: { getUser: getUserMock }
    });

    getCurrentMembershipMock = (await import('@/lib/auth')).getCurrentMembership;
    getCurrentMembershipMock.mockResolvedValue({ accountId: 'acct_1' });

    fetchProxyImageMock = (await import('@/lib/photo-proxy-guard')).fetchProxyImage;
    fetchProxyImageMock.mockResolvedValue({ ok: true, buffer: Buffer.from('img'), contentType: 'image/png' });

    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        defectsFound: true,
        summary: 'Found something',
        defects: [
          {
            label: 'Crack',
            severity: 'critical',
            box2d: [100, 200, 300, 400],
            recommendation: 'Fix it'
          }
        ]
      })
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('fails if no user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const req = new NextRequest('http://localhost/api/lead-photos/ai-suggest', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('fails if no accountId', async () => {
    getCurrentMembershipMock.mockResolvedValue({ accountId: null });
    const req = new NextRequest('http://localhost/api/lead-photos/ai-suggest', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('fails if no photoUrl', async () => {
    const req = new NextRequest('http://localhost/api/lead-photos/ai-suggest', { method: 'POST', body: JSON.stringify({}) });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('handles base64 url directly', async () => {
    const req = new NextRequest('http://localhost/api/lead-photos/ai-suggest', {
      method: 'POST',
      body: JSON.stringify({ photoUrl: 'data:image/jpeg;base64,YWJj' }) // abc
    });
    
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(fetchProxyImageMock).not.toHaveBeenCalled();
    expect(mockGenerateContent).toHaveBeenCalled();
    expect(data.success).toBe(true);
    expect(data.suggestions.length).toBeGreaterThan(0);
  });

  it('fetches remote url via proxy', async () => {
    const req = new NextRequest('http://localhost/api/lead-photos/ai-suggest', {
      method: 'POST',
      body: JSON.stringify({ photoUrl: 'https://example.com/img.jpg', scope: 'roof' })
    });
    
    const res = await POST(req);
    expect(res.status).toBe(200);
    
    expect(fetchProxyImageMock).toHaveBeenCalledWith(new URL('https://example.com/img.jpg'));
    expect(mockGenerateContent).toHaveBeenCalled();
  });

  it('returns empty if no defects found', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ defectsFound: false, summary: 'All good', defects: [] })
    });
    
    const req = new NextRequest('http://localhost/api/lead-photos/ai-suggest', {
      method: 'POST',
      body: JSON.stringify({ photoUrl: 'https://example.com/img.jpg' })
    });
    
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(data.suggestions).toEqual([]);
    expect(data.summary).toBe('All good');
  });

  it('handles proxy fetch failure', async () => {
    fetchProxyImageMock.mockResolvedValue({ ok: false, status: 404, error: 'Not found' });
    
    const req = new NextRequest('http://localhost/api/lead-photos/ai-suggest', {
      method: 'POST',
      body: JSON.stringify({ photoUrl: 'https://example.com/img.jpg' })
    });
    
    const res = await POST(req);
    expect(res.status).toBe(404);
  });
});
