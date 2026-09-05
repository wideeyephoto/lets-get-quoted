import { describe, expect, it, vi } from 'vitest';
import { authorizeVoiceToolInvocation } from '@/lib/voice/tool-admission';

describe('voice tool admission', () => {
  it('binds the call, account and signed caller to the atomic authorization check', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    expect(await authorizeVoiceToolInvocation({ rpc } as never, 'account', 'call', '+15551234567')).toBe(true);
    expect(rpc).toHaveBeenCalledWith('authorize_voice_tool_invocation', {
      p_account_id: 'account', p_call_id: 'call', p_caller: '+15551234567',
    });
  });
  it.each([false, null, undefined])('rejects missing or revoked admission (%s)', async (data) => {
    expect(await authorizeVoiceToolInvocation({ rpc: async () => ({ data, error: null }) } as never, 'a','c',null)).toBe(false);
  });
  it('fails closed on database errors and thrown transport failures', async () => {
    expect(await authorizeVoiceToolInvocation({ rpc: async () => ({ data: true, error: {} }) } as never,'a','c',null)).toBe(false);
    expect(await authorizeVoiceToolInvocation({ rpc: async () => { throw new Error('offline'); } } as never,'a','c',null)).toBe(false);
  });
});
