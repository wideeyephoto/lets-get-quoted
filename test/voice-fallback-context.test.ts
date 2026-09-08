import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { recordFallbackVoiceCall } from '@/lib/voice/fallback-context';

const call = { providerCallId: 'fallback-context-call', fromNumber: '+18105550199', toNumber: '+18105550100' };

describe('durable fallback call context', () => {
  it('inserts voicemail attribution without creating an AI hold or replacing an existing call', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ upsert });
    await recordFallbackVoiceCall({ from } as unknown as SupabaseClient, 'workspace-1', call, 'voicemail');
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('voice_calls');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      account_id: 'workspace-1', provider: 'signalwire', provider_call_id: call.providerCallId,
      caller_number: call.fromNumber, outcome: 'voicemail', settlement: 'unmetered', is_provisional: false,
    }), { onConflict: 'provider,provider_call_id', ignoreDuplicates: true });
  });

  it('records a forwarding attempt without claiming the destination answered', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    await recordFallbackVoiceCall({ from: () => ({ upsert }) } as unknown as SupabaseClient, 'workspace-1', call, 'forward');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'transfer_attempted' }), expect.anything());
  });

  it('fails before recovery instructions can be emitted when context cannot persist', async () => {
    const admin = { from: () => ({ upsert: async () => ({ error: { code: '08006' } }) }) } as unknown as SupabaseClient;
    await expect(recordFallbackVoiceCall(admin, 'workspace-1', call, 'voicemail'))
      .rejects.toThrow('Fallback call context persistence failed');
  });
});
