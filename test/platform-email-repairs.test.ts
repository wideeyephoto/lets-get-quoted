import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendDurablePlatformEmail } from '@/lib/platform-transactional-email';
const lookup = vi.fn(), prepare = vi.fn(), fetchRequest = vi.fn();
const admin = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: lookup }) }) }) } as unknown as SupabaseClient;
const client = { key: 'test-key', fetchRequest };
const payload = { from: "Let's Get Quoted <hello@letsgetquoted.com>", to: 'owner@example.test', subject: 'Sign in', html: '<p>Link</p>', tags: [{name:'kind',value:'auth_link'}] };
beforeEach(() => { vi.resetAllMocks(); lookup.mockResolvedValue({ data:null,error:null }); fetchRequest.mockResolvedValue({data:{id:'provider'}}); });
it('persists the scoped message and rechecks suppression before a bounded, idempotent submission', async () => {
  await sendDurablePlatformEmail(admin, client, payload, 'saved-key', prepare);
  expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey:'saved-key', providerFingerprint:expect.stringMatching(/^[a-f0-9]{64}$/),
    payload:expect.objectContaining({tags:expect.arrayContaining([{name:'delivery_scope',value:'platform_transactional'}])}) }));
  expect(lookup).toHaveBeenCalledTimes(2);
  expect(prepare.mock.invocationCallOrder[0]).toBeLessThan(lookup.mock.invocationCallOrder[1]);
  expect(lookup.mock.invocationCallOrder[1]).toBeLessThan(fetchRequest.mock.invocationCallOrder[0]);
  expect(fetchRequest.mock.calls[0][1].headers['Idempotency-Key']).toBe('saved-key');
  expect(fetchRequest.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
});
it('retains a prepared message without submitting when a recipient becomes blocked', async () => {
  lookup.mockResolvedValueOnce({data:null,error:null}).mockResolvedValue({data:{email:payload.to,reason:'complaint'},error:null});
  await expect(sendDurablePlatformEmail(admin, client, payload, 'saved-key', prepare)).rejects.toThrow('blocked');
  expect(prepare).toHaveBeenCalledOnce(); expect(fetchRequest).not.toHaveBeenCalled();
});
