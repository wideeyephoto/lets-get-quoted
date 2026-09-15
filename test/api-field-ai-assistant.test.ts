import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '@/app/api/field/ai-assistant/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/crew-auth', () => ({
  loadCrewContext: vi.fn(),
}));

vi.mock('@/lib/ai-assistant/crew-engine', () => ({
  runCrewAssistantConversation: vi.fn(),
}));

describe('Field AI Assistant Route', () => {
  let loadCrewContextMock: any;
  let runCrewAssistantConversationMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    loadCrewContextMock = (await import('@/lib/crew-auth')).loadCrewContext;
    loadCrewContextMock.mockResolvedValue({
      ok: true,
      context: {
        supabase: 'fake_supabase',
        userId: 'user_1',
        accountId: 'acct_1',
        businessName: 'Acme',
        crew: {
          name: 'Bob',
          role_label: 'Foreman'
        }
      }
    });

    runCrewAssistantConversationMock = (await import('@/lib/ai-assistant/crew-engine')).runCrewAssistantConversation;
    runCrewAssistantConversationMock.mockResolvedValue({
      message: 'Hello Bob'
    });
  });

  it('fails if unauthorized', async () => {
    loadCrewContextMock.mockResolvedValue({ ok: false, reason: 'unauth' });
    const req = new NextRequest('http://localhost/api/field/ai-assistant', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('fails if messages missing or empty', async () => {
    const req = new NextRequest('http://localhost/api/field/ai-assistant', {
      method: 'POST',
      body: JSON.stringify({ messages: [] })
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('merges file and image onto last user message', async () => {
    const req = new NextRequest('http://localhost/api/field/ai-assistant', {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'What is this?' }],
        file: 'file_id',
        image: 'base64img'
      })
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(runCrewAssistantConversationMock).toHaveBeenCalled();
    const msgs = runCrewAssistantConversationMock.mock.calls[0][0];
    expect(msgs[0].file).toBe('file_id');
    expect(msgs[0].image).toBe('base64img');
  });

  it('calls engine and returns result', async () => {
    const req = new NextRequest('http://localhost/api/field/ai-assistant', {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hi' }],
        companionId: 'helper',
        activeJobId: 'job_1',
        activeJobRef: '123'
      })
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.message).toBe('Hello Bob');

    expect(runCrewAssistantConversationMock).toHaveBeenCalledWith(
      [{ role: 'user', content: 'Hi' }],
      {
        userId: 'user_1',
        accountId: 'acct_1',
        businessName: 'Acme',
        crewName: 'Bob',
        crewRole: 'Foreman',
        companionId: 'helper',
        activeJobId: 'job_1',
        activeJobRef: '123'
      },
      {
        supabase: 'fake_supabase',
        accountId: 'acct_1',
        crew: { name: 'Bob', role_label: 'Foreman' },
        businessName: 'Acme',
        activeJobId: 'job_1'
      }
    );
  });

  it('handles errors', async () => {
    runCrewAssistantConversationMock.mockRejectedValue(new Error('AI failed'));
    const req = new NextRequest('http://localhost/api/field/ai-assistant', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] })
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe('AI failed');
  });
});
