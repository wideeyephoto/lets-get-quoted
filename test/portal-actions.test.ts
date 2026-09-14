vi.mock('@/lib/portal-message-requests',()=>({findPortalMessageReceipt:vi.fn().mockResolvedValue(null)}));
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendPortalMessageAction } from '../src/app/portal/view/[token]/actions';
import { checkRateLimit } from '../src/lib/rate-limit';
import * as clientPortalData from '../src/lib/client-portal-data';
import * as clientPortal from '../src/lib/client-portal';
import * as auth from '../src/lib/auth';
import { findPortalMessageReceipt } from '@/lib/portal-message-requests';
import { revalidatePath } from 'next/cache';

vi.mock('../src/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
  checkRateLimitStrict: vi.fn(),
}));
vi.mock('../src/lib/client-portal-data', () => ({
  submitPortalMessage: vi.fn(),
}));
vi.mock('../src/lib/client-portal', () => ({
  resolvePortalAccess: vi.fn(),
}));
vi.mock('../src/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('Portal Actions Rate Limits', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(findPortalMessageReceipt).mockResolvedValue(null);
  });

  it('recovers an accepted request even when the new-message quota is exhausted', async () => {
    vi.mocked(auth.createAdminClient).mockReturnValue({} as any);
    vi.mocked(clientPortal.resolvePortalAccess).mockResolvedValue({
      accountId: 'acc1', clientId: 'client1',
    } as any);
    vi.mocked(checkRateLimit).mockResolvedValue(false);
    vi.mocked(findPortalMessageReceipt).mockResolvedValue({id:'saved-message',payload_hash:'saved-hash',job_id:null});
    vi.mocked(clientPortalData.submitPortalMessage).mockResolvedValue({ok:true,messageId:'saved-message'});
    const formData = new FormData();
    formData.set('requestId','10000000-0000-4000-8000-000000000099');
    formData.set('message','Hello!');
    expect(await sendPortalMessageAction('fake-token',formData)).toEqual({ok:true,messageId:'saved-message'});
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(clientPortalData.submitPortalMessage).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({accountId:'acc1',clientId:'client1',body:'Hello!'}));
    expect(revalidatePath).toHaveBeenCalledWith('/portal/view/fake-token');
  });

  it('rejects the 11th message in an hour and asserts no insert', async () => {
    // Mock access to bypass link expiration
    vi.mocked(clientPortal.resolvePortalAccess).mockResolvedValue({
      accountId: 'acc1',
      clientId: 'client1',
    } as any);

    // Mock rate limit to return false (limit exceeded)
    vi.mocked(checkRateLimit).mockResolvedValue(false);

    const formData = new FormData();
    formData.append('requestId','10000000-0000-4000-8000-000000000099');
    formData.append('message', 'Hello!');
    
    const result = await sendPortalMessageAction('fake-token', formData);
    
    expect(result.ok).toBe(false);
    expect(result.message).toContain('too many messages');
    expect(clientPortalData.submitPortalMessage).not.toHaveBeenCalled();
  });
});
