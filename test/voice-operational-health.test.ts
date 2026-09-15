import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ scope: vi.fn(), admin: vi.fn() }));
vi.mock('@/lib/auth', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/voice/auth', () => ({ signalWireVoiceScope: mocks.scope }));
import { recordVoiceOperationalHealth } from '@/lib/voice/operational-health';

beforeEach(() => { mocks.scope.mockReturnValue({ projectId: 'project', spaceId: 'space' }); });
describe('voice operational health', () => {
  it('uses configured provider scope and retains active exceptions for cron health', async () => {
    const rpc=vi.fn().mockResolvedValue({data:{failed:2,active:2,opened:1},error:null});
    await expect(recordVoiceOperationalHealth({rpc} as unknown as SupabaseClient)).resolves.toMatchObject({failed:2});
    expect(rpc).toHaveBeenCalledWith('record_voice_operational_health',{p_project_id:'project',p_space_id:'space'});
  });
  it('does not report a failed database query as a healthy empty result', async () => {
    const rpc=vi.fn().mockResolvedValue({data:null,error:{code:'42501',message:'private caller text'}});
    await expect(recordVoiceOperationalHealth({rpc} as unknown as SupabaseClient)).rejects.toThrow('Voice health check failed (42501).');
  });
  it.each([null,{}, {failed:-1},{failed:0.5},{failed:'0'}])('rejects malformed results %j',async data=>{
    const rpc=vi.fn().mockResolvedValue({data,error:null});
    await expect(recordVoiceOperationalHealth({rpc} as unknown as SupabaseClient)).rejects.toThrow('invalid result');
  });
  it('does not inspect another scope when configuration is absent',async()=>{
    mocks.scope.mockReturnValue(null);
    const rpc=vi.fn();
    await expect(recordVoiceOperationalHealth({rpc} as unknown as SupabaseClient)).rejects.toThrow('not configured');
    expect(rpc).not.toHaveBeenCalled();
  });
});
