import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/voice/receipt/route';

import { createAdminClient } from '@/lib/auth';
import { logWebhookFailure } from '@/lib/webhook-failures';
import { verifyVoiceReceiptAuthorization, signalWireVoiceScope } from '@/lib/voice/auth';
import { signalwireVoiceProvider, minimizeSignalWireVoiceReceiptPayload } from '@/lib/voice/signalwire';
import { ingestVoiceEvent, processVoiceReceipt, VoiceReceiptProcessingRpcError } from '@/lib/voice/receipt-processing';
import { sanitizeVoiceReceipt } from '@/lib/voice/receipt-redaction';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/webhook-failures', () => ({
  logWebhookFailure: vi.fn(),
}));

vi.mock('@/lib/voice/auth', () => ({
  verifyVoiceReceiptAuthorization: vi.fn(),
  signalWireVoiceScope: vi.fn(),
  VOICE_RECEIPT_BASIC_ENV: 'TEST_ENV',
}));

vi.mock('@/lib/voice/signalwire', () => ({
  signalwireVoiceProvider: {
    parseReceipt: vi.fn(),
  },
  minimizeSignalWireVoiceReceiptPayload: vi.fn(),
}));

vi.mock('@/lib/voice/receipt-processing', () => ({
  ingestVoiceEvent: vi.fn(),
  processVoiceReceipt: vi.fn(),
  VoiceReceiptProcessingRpcError: class extends Error {
    rpcCode: string;
    constructor(message: string, rpcCode: string) {
      super(message);
      this.rpcCode = rpcCode;
    }
  },
}));

vi.mock('@/lib/voice/receipt-redaction', () => ({
  sanitizeVoiceReceipt: vi.fn((x) => x),
}));

vi.mock('@/lib/voice/provider-timing', () => ({
  signalWireTimingSummary: vi.fn(() => ({ timing: true })),
}));

function createRequest(body?: any) {
  return new NextRequest('http://localhost/api/voice/receipt', {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('Voice Receipt Webhook', () => {
  const dummyReceipt = {
    providerCallId: 'call_123',
    eventType: 'answered',
    projectId: 'proj_123',
    spaceId: 'space_123',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(verifyVoiceReceiptAuthorization).mockReturnValue({ ok: true } as any);
    vi.mocked(signalWireVoiceScope).mockReturnValue({ projectId: 'proj_123', spaceId: 'space_123' });
    vi.mocked(signalwireVoiceProvider.parseReceipt).mockReturnValue({ ok: true, receipt: dummyReceipt } as any);
    vi.mocked(minimizeSignalWireVoiceReceiptPayload).mockReturnValue({ min: true });
    
    vi.mocked(ingestVoiceEvent).mockResolvedValue({
      inserted: true,
      admitted: true,
      voiceEventId: 'evt_123',
    } as any);

    vi.mocked(processVoiceReceipt).mockResolvedValue({
      status: 'processed',
      minutes: 5,
    } as any);
  });

  it('returns 503 if not configured', async () => {
    vi.mocked(verifyVoiceReceiptAuthorization).mockReturnValue({ ok: false, reason: 'not_configured' } as any);
    
    const req = createRequest({});
    const res = await POST(req);
    
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'not_configured' });
    expect(logWebhookFailure).toHaveBeenCalledWith(expect.objectContaining({
      errorMessage: expect.stringContaining('has no valid TEST_ENV configured')
    }));
  });

  it('returns 401 if unauthorized', async () => {
    vi.mocked(verifyVoiceReceiptAuthorization).mockReturnValue({ ok: false, reason: 'wrong_password' } as any);
    
    const req = createRequest({});
    const res = await POST(req);
    
    expect(res.status).toBe(401);
    expect(logWebhookFailure).toHaveBeenCalledWith(expect.objectContaining({
      errorMessage: expect.stringContaining('wrong_password')
    }));
  });

  it('returns 503 if provider scope is missing', async () => {
    vi.mocked(signalWireVoiceScope).mockReturnValue(null);
    
    const req = createRequest({});
    const res = await POST(req);
    
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'provider_scope_not_configured' });
  });

  it('returns 400 if payload is not valid JSON', async () => {
    const req = new NextRequest('http://localhost/api/voice/receipt', {
      method: 'POST',
      body: 'invalid-json',
    });
    
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_json' });
  });

  it('returns 400 if parsing receipt fails', async () => {
    vi.mocked(signalwireVoiceProvider.parseReceipt).mockReturnValue({ ok: false, reason: 'bad_format' } as any);
    
    const req = createRequest({ foo: 'bar' });
    const res = await POST(req);
    
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_format' });
  });

  it('returns 400 if ingestRpcError is terminal (23505)', async () => {
    const { VoiceReceiptProcessingRpcError } = await import('@/lib/voice/receipt-processing');
    vi.mocked(ingestVoiceEvent).mockRejectedValue(new VoiceReceiptProcessingRpcError('Duplicate', '23505'));
    
    const req = createRequest({ foo: 'bar' });
    const res = await POST(req);
    
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'rejected' });
  });

  it('returns 500 if ingestRpcError is transient', async () => {
    const { VoiceReceiptProcessingRpcError } = await import('@/lib/voice/receipt-processing');
    vi.mocked(ingestVoiceEvent).mockRejectedValue(new VoiceReceiptProcessingRpcError('Timeout', '50000'));
    
    const req = createRequest({ foo: 'bar' });
    const res = await POST(req);
    
    expect(res.status).toBe(500);
  });

  it('returns 200 with settled: false if call not admitted', async () => {
    vi.mocked(ingestVoiceEvent).mockResolvedValue({
      inserted: true,
      admitted: false,
      voiceEventId: 'evt_123',
    } as any);
    
    const req = createRequest({ foo: 'bar' });
    const res = await POST(req);
    
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, settled: false });
  });

  it('returns 200 on successful processing', async () => {
    const req = createRequest({ foo: 'bar' });
    const res = await POST(req);
    
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, minutes: 5 });
  });

  it('returns 200 duplicate when successfully processed but inserted is false', async () => {
    vi.mocked(ingestVoiceEvent).mockResolvedValue({
      inserted: false,
      admitted: true,
      voiceEventId: 'evt_123',
    } as any);
    
    const req = createRequest({ foo: 'bar' });
    const res = await POST(req);
    
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, minutes: 5, duplicate: true });
  });

  it('returns 200 duplicate when processing status is ignored', async () => {
    vi.mocked(processVoiceReceipt).mockResolvedValue({ status: 'ignored' } as any);
    
    const req = createRequest({ foo: 'bar' });
    const res = await POST(req);
    
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, duplicate: true });
  });

  it('returns 503 with Retry-After when processing is busy', async () => {
    vi.mocked(processVoiceReceipt).mockResolvedValue({ status: 'busy', retryAfterSeconds: 10 } as any);
    
    const req = createRequest({ foo: 'bar' });
    const res = await POST(req);
    
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('10');
    expect(await res.json()).toEqual({ error: 'processing_pending' });
  });

  it('returns 200 settled: false when exhausted', async () => {
    vi.mocked(processVoiceReceipt).mockResolvedValue({ status: 'exhausted' } as any);
    
    const req = createRequest({ foo: 'bar' });
    const res = await POST(req);
    
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, settled: false });
  });

  it('returns 500 with Retry-After for retryable_failure', async () => {
    vi.mocked(processVoiceReceipt).mockResolvedValue({ 
      status: 'retryable_failure', 
      reason: 'db error', 
      retryAfterSeconds: 15 
    } as any);
    
    const req = createRequest({ foo: 'bar' });
    const res = await POST(req);
    
    expect(res.status).toBe(500);
    expect(res.headers.get('Retry-After')).toBe('15');
    expect(await res.json()).toEqual({ error: 'processing_failed' });
  });

  it('returns 200 for terminal_failure', async () => {
    vi.mocked(processVoiceReceipt).mockResolvedValue({ 
      status: 'terminal_failure', 
      reason: 'bad data' 
    } as any);
    
    const req = createRequest({ foo: 'bar' });
    const res = await POST(req);
    
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, settled: false });
  });

  it('returns 500 when an unexpected exception is thrown', async () => {
    vi.mocked(processVoiceReceipt).mockRejectedValue(new Error('Unexpected disaster'));
    
    const req = createRequest({ foo: 'bar' });
    const res = await POST(req);
    
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal' });
  });
});
