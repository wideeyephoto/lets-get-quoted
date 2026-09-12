import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/dashboard/ai-assistant/route';

vi.mock('@/lib/auth', () => ({
  requireDashboardShellContext: vi.fn(),
}));

vi.mock('@/lib/business-name', () => ({
  loadBusinessName: vi.fn(),
}));

vi.mock('@/lib/ai-assistant/engine', () => ({
  runAssistantConversation: vi.fn(),
}));

describe('AI Assistant API Route', () => {
  let requireDashboardShellContextMock: any;
  let loadBusinessNameMock: any;
  let runAssistantConversationMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    requireDashboardShellContextMock = (await import('@/lib/auth')).requireDashboardShellContext;
    requireDashboardShellContextMock.mockResolvedValue({
      supabase: {},
      userId: 'user_123',
      accountId: 'acct_123',
      role: 'admin',
      capabilities: new Set(['send_message']),
    });

    loadBusinessNameMock = (await import('@/lib/business-name')).loadBusinessName;
    loadBusinessNameMock.mockResolvedValue('Acme Corp');

    runAssistantConversationMock = (await import('@/lib/ai-assistant/engine')).runAssistantConversation;
    runAssistantConversationMock.mockResolvedValue({
      message: 'Hello, how can I help?',
      actionCards: [],
    });
  });

  const createRequest = (body: any) => {
    return new NextRequest('http://localhost/api/dashboard/ai-assistant', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  it('requires messages array', async () => {
    const req = createRequest({ messages: [] });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Messages array is required');
  });

  it('runs conversation successfully', async () => {
    const req = createRequest({
      messages: [{ role: 'user', content: 'Hi' }],
      currentPath: '/dashboard',
    });
    
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.message).toBe('Hello, how can I help?');
    
    expect(runAssistantConversationMock).toHaveBeenCalledWith(
      [{ role: 'user', content: 'Hi' }],
      expect.objectContaining({
        userId: 'user_123',
        accountId: 'acct_123',
        role: 'admin',
        businessName: 'Acme Corp',
        currentPath: '/dashboard',
        capabilities: ['send_message'],
      }),
      expect.objectContaining({
        accountId: 'acct_123',
        userId: 'user_123',
        role: 'admin',
      })
    );
  });

  it('appends file and image to the last user message', async () => {
    const req = createRequest({
      messages: [{ role: 'user', content: 'Hi' }],
      file: { name: 'test.pdf', url: 'http://test' },
      image: { url: 'http://test.jpg' },
    });
    
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    
    expect(runAssistantConversationMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          role: 'user',
          file: { name: 'test.pdf', url: 'http://test' },
          image: { url: 'http://test.jpg' },
        }),
      ],
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('returns 500 on unexpected errors', async () => {
    runAssistantConversationMock.mockRejectedValue(new Error('Engine failed'));
    
    const req = createRequest({ messages: [{ role: 'user', content: 'Hi' }] });
    const res = await POST(req as any);
    expect(res.status).toBe(500);
    
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe('Engine failed');
  });

  it('returns 401 on Unauthorized errors', async () => {
    requireDashboardShellContextMock.mockRejectedValue(new Error('Unauthorized'));
    
    const req = createRequest({ messages: [{ role: 'user', content: 'Hi' }] });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });
});
