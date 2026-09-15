import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Content } from '@google/genai';

const mocks = vi.hoisted(() => ({
  generate: vi.fn(), execute: vi.fn(), pending: vi.fn(), flush: vi.fn(), briefing: vi.fn(),
}));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class { models = { generateContent: mocks.generate }; },
}));
vi.mock('@/lib/ai-operator/tools', () => ({ OPERATOR_TOOLS_DECLARATION: [], executeOperatorTool: mocks.execute }));
vi.mock('@/lib/ai-operator/audit', () => ({
  flushOperatorWrites: mocks.flush, listPendingHitlActionsAsync: mocks.pending,
}));
vi.mock('@/lib/ai-operator/briefing', () => ({ generateExecutiveBriefing: mocks.briefing }));
vi.mock('@/lib/ai-operator/revops', () => ({}));
vi.mock('@/lib/payments', () => ({}));
vi.mock('@/lib/contractor-lifecycle-emails', () => ({}));
vi.mock('@/lib/ai-operator/churn-detector', () => ({}));
vi.mock('@/lib/ai-operator/financial-forecasting', () => ({}));

import { askAiOperator } from '@/lib/ai-operator/engine';
import type { OperatorExecutionContext } from '@/lib/ai-operator/types';

const ctx = { supabase: {}, source: 'admin_dashboard' } as OperatorExecutionContext;

describe('Operator Gemini tool response history', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key');
    mocks.pending.mockResolvedValue([]);
    mocks.flush.mockResolvedValue(undefined);
    mocks.execute.mockResolvedValue({ data: { count: 0, actions: [] } });
    mocks.briefing.mockResolvedValue({ markdownSummary: 'Fallback briefing' });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('preserves signed parts, parallel call IDs and every previous tool turn', async () => {
    const first: Content = {
      role: 'model', parts: [
        { text: 'Checking approvals.', thought: true, thoughtSignature: 'text-signature' },
        { functionCall: { id: 'call-1', name: 'list_pending_action_requests', args: {} }, thoughtSignature: 'call-signature' },
        { functionCall: { id: 'call-2', name: 'list_pending_action_requests', args: {} } },
      ],
    };
    const second: Content = {
      role: 'model', parts: [
        { functionCall: { id: 'call-3', name: 'get_system_health', args: {} }, thoughtSignature: 'next-signature' },
      ],
    };
    const originals = structuredClone([first, second]);
    const sent: Content[][] = [];
    mocks.generate.mockImplementation(async ({ contents }) => {
      sent.push(structuredClone(contents));
      const content = [first, second][sent.length - 1];
      return content ? {
        candidates: [{ content }], functionCalls: content.parts!.flatMap((p) => p.functionCall ? [p.functionCall] : []),
      } : { text: 'No pending approvals. Platform healthy.' };
    });

    const result = await askAiOperator('Check approvals and health', ctx);

    expect(result.answer).toBe('No pending approvals. Platform healthy.');
    expect(sent[1][1]).toEqual(originals[0]);
    expect(sent[2][1]).toEqual(originals[0]);
    expect(sent[2][3]).toEqual(originals[1]);
    expect(sent[1][2].parts?.map((p) => p.functionResponse?.id)).toEqual(['call-1', 'call-2']);
    expect(sent[2][4].parts?.[0].functionResponse?.id).toBe('call-3');
    expect([first, second]).toEqual(originals);
    expect(mocks.execute).toHaveBeenCalledTimes(3);
    expect(result.toolCallsExecuted).toHaveLength(3);
  });

  it('does not execute a tool when its original model content is missing', async () => {
    mocks.generate.mockResolvedValue({ functionCalls: [{ name: 'create_hitl_action_request', args: {} }] });
    const result = await askAiOperator('Check approvals', ctx);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(result.answer).toContain('without their original response content');
    expect(mocks.flush).toHaveBeenCalled();
    expect(mocks.pending).toHaveBeenCalledWith(expect.any(Date), ctx.supabase);
  });

  it('returns tool failures with the signed response so Gemini can explain them', async () => {
    const content: Content = { role: 'model', parts: [{
      functionCall: { id: 'failed-call', name: 'get_system_health', args: {} }, thoughtSignature: 'signature',
    }] };
    mocks.execute.mockRejectedValue(new Error('Health unavailable'));
    mocks.generate.mockResolvedValueOnce({ candidates: [{ content }], functionCalls: [content.parts![0].functionCall] });
    mocks.generate.mockImplementationOnce(async ({ contents }) => {
      expect(contents[1]).toEqual(content);
      expect(contents[2].parts[0].functionResponse).toMatchObject({ id: 'failed-call', response: { result: { error: 'Health unavailable' } } });
      return { text: 'Health inspection is currently unavailable.' };
    });
    expect((await askAiOperator('Check health', ctx)).answer).toContain('currently unavailable');
  });

  it('preserves executed tool history and reads durable approvals after an API failure', async () => {
    const call = { id: 'already-ran', name: 'list_pending_action_requests', args: {} };
    mocks.generate.mockResolvedValueOnce({ candidates: [{ content: { role: 'model', parts: [{ functionCall: call, thoughtSignature: 'signed' }] } }], functionCalls: [call] });
    mocks.generate.mockRejectedValueOnce(new Error('Upstream unavailable'));
    const result = await askAiOperator('Check approvals', ctx);
    expect(result.toolCallsExecuted).toEqual(['list_pending_action_requests', 'fallback_briefing']);
    expect(mocks.flush).toHaveBeenCalled();
    expect(mocks.pending).toHaveBeenCalledWith(expect.any(Date), ctx.supabase);
  });
});
