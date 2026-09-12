import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/demo-tour/events/route';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
  clientIpFrom: vi.fn(() => '1.2.3.4'),
}));

vi.mock('@/lib/product-tour/events', () => ({
  sanitizeTourEventPayload: vi.fn(),
}));

describe('Demo Tour Events API Route', () => {
  let createAdminClientMock: any;
  let checkRateLimitMock: any;
  let sanitizeTourEventPayloadMock: any;
  let insertMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    insertMock = vi.fn().mockResolvedValue({ error: null });
    const fromMock = vi.fn().mockReturnValue({ insert: insertMock });
    
    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    createAdminClientMock.mockReturnValue({ from: fromMock });

    checkRateLimitMock = (await import('@/lib/rate-limit')).checkRateLimit;
    checkRateLimitMock.mockResolvedValue(true);

    sanitizeTourEventPayloadMock = (await import('@/lib/product-tour/events')).sanitizeTourEventPayload;
    sanitizeTourEventPayloadMock.mockReturnValue({
      valid: true,
      sanitized: {
        client_event_id: 'evt_123',
        tour_key: 'welcome',
        tour_version: 1,
        event_type: 'start',
      },
      error: null,
    });
  });

  const createRequest = (body: any) => {
    return new NextRequest('http://localhost/api/demo-tour/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
      body: body ? JSON.stringify(body) : null,
    });
  };

  it('inserts valid event successfully', async () => {
    const req = createRequest({ tour_key: 'welcome' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    
    const data = await res.json();
    expect(data.ok).toBe(true);
    
    expect(checkRateLimitMock).toHaveBeenCalledWith(
      expect.any(Object),
      'demo_tour_events:1.2.3.4',
      60,
      60
    );
    
    expect(insertMock).toHaveBeenCalledWith({
      client_event_id: 'evt_123',
      tour_key: 'welcome',
      tour_version: 1,
      event_type: 'start',
      step_id: null,
      anonymous_session_id: null,
      source: 'demo_public',
      pathname: null,
      metadata: {},
    });
  });

  it('returns 429 when rate limited', async () => {
    checkRateLimitMock.mockResolvedValue(false);
    
    const req = createRequest({ tour_key: 'welcome' });
    const res = await POST(req);
    expect(res.status).toBe(429);
    
    const data = await res.json();
    expect(data.error).toBe('Rate limit exceeded');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON', async () => {
    const req = new NextRequest('http://localhost/api/demo-tour/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ bad json }',
    });
    
    const res = await POST(req);
    expect(res.status).toBe(400);
    
    const data = await res.json();
    expect(data.error).toBe('Invalid JSON body');
  });

  it('returns 400 when sanitization fails', async () => {
    sanitizeTourEventPayloadMock.mockReturnValue({
      valid: false,
      sanitized: null,
      error: 'Missing required fields',
    });
    
    const req = createRequest({ missing: 'everything' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    
    const data = await res.json();
    expect(data.error).toBe('Missing required fields');
  });

  it('returns 200 even if database insert fails', async () => {
    insertMock.mockResolvedValue({ error: new Error('DB Error') });
    
    const req = createRequest({ tour_key: 'welcome' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it('returns 500 on unexpected errors', async () => {
    createAdminClientMock.mockImplementation(() => {
      throw new Error('Connection failed');
    });
    
    const req = createRequest({ tour_key: 'welcome' });
    const res = await POST(req);
    expect(res.status).toBe(500);
    
    const data = await res.json();
    expect(data.error).toBe('Internal error');
  });
});
