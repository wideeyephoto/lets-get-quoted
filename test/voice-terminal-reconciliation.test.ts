import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { reconcileVoiceTerminalAdmission } from '@/lib/voice/terminal-reconciliation';

const id = '7a06250f-7de7-47ac-bbd4-7ceedf7f4157';
const candidate = { provider_call_id: id, dialed_number: '+18103202687', caller_number: '+18103042061' };
const env = { SIGNALWIRE_SPACE_URL: 'https://fixture.signalwire.com', SIGNALWIRE_PROJECT_ID: 'fixture-project', SIGNALWIRE_API_TOKEN: 'fixture-token' };
const terminal = { id, status: 'ended', to: candidate.dialed_number, from: candidate.caller_number, parent_id: null };

function fixture(payload: unknown = terminal, status = 200) {
  const rpc = vi.fn().mockResolvedValue({ data: [{ close_status: 'closed', account_id: 'account' }], error: null });
  const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status }));
  return { rpc, fetchImpl, admin: { rpc } as unknown as SupabaseClient };
}

describe('provider-verified terminal admission recovery', () => {
  it('closes an exact ended call through the canonical gate without inventing billing', async () => {
    const f = fixture();
    expect(await reconcileVoiceTerminalAdmission(f.admin, 'account', candidate, { env, fetchImpl: f.fetchImpl })).toBe(true);
    expect(f.fetchImpl).toHaveBeenCalledWith(`https://fixture.signalwire.com/api/voice/logs/${id}`, expect.objectContaining({ method: 'GET', redirect: 'error', signal: expect.any(AbortSignal) }));
    expect(f.rpc).toHaveBeenCalledOnce();
    expect(f.rpc).toHaveBeenCalledWith('close_voice_staff_step_up_from_provider_status', { p_provider_call_id: id, p_call_status: 'completed' });
  });

  it.each([
    { ...terminal, status: 'answered' },
    { ...terminal, id: 'different-call' },
    { ...terminal, to: '+18103202688' },
    { ...terminal, from: '+18103042062' },
    { ...terminal, parent_id: 'different-parent' },
    { ...terminal, project_id: 'different-project' },
    null,
  ])('preserves capacity when provider facts do not prove the exact ended inbound call: %j', async (payload) => {
    const f = fixture(payload);
    expect(await reconcileVoiceTerminalAdmission(f.admin, 'account', candidate, { env, fetchImpl: f.fetchImpl })).toBe(false);
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it.each([404, 500])('does not treat provider HTTP %s as proof of termination', async (status) => {
    const f = fixture({}, status);
    expect(await reconcileVoiceTerminalAdmission(f.admin, 'account', candidate, { env, fetchImpl: f.fetchImpl })).toBe(false);
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it('preserves capacity when the provider times out or the database rejects closure', async () => {
    const f = fixture();
    f.fetchImpl.mockRejectedValueOnce(new Error('timeout'));
    expect(await reconcileVoiceTerminalAdmission(f.admin, 'account', candidate, { env, fetchImpl: f.fetchImpl })).toBe(false);
    f.rpc.mockResolvedValueOnce({ data: null, error: { code: 'failure' } } as never);
    expect(await reconcileVoiceTerminalAdmission(f.admin, 'account', candidate, { env, fetchImpl: f.fetchImpl })).toBe(false);
  });

  it('does not send provider credentials to an invalid configured origin', async () => {
    const f = fixture();
    expect(await reconcileVoiceTerminalAdmission(f.admin, 'account', candidate, { env: { ...env, SIGNALWIRE_SPACE_URL: 'https://evil.example' }, fetchImpl: f.fetchImpl })).toBe(false);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });

  it('requires confirmed account-scoped closure', async () => {
    const f = fixture();
    f.rpc.mockResolvedValueOnce({ data: [{ close_status: 'closed', account_id: 'other-account' }], error: null });
    expect(await reconcileVoiceTerminalAdmission(f.admin, 'account', candidate, { env, fetchImpl: f.fetchImpl })).toBe(false);
  });
});
