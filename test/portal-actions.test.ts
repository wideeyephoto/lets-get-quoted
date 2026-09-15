import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendPortalMessageAction } from '../src/app/portal/view/[token]/actions';
import { checkRateLimit } from '../src/lib/rate-limit';
import * as clientPortalData from '../src/lib/client-portal-data';
import * as clientPortal from '../src/lib/client-portal';
import * as auth from '../src/lib/auth';

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
    formData.append('message', 'Hello!');
    
    const result = await sendPortalMessageAction('fake-token', formData);
    
    expect(result.ok).toBe(false);
    expect(result.message).toContain('too many messages');
    expect(clientPortalData.submitPortalMessage).not.toHaveBeenCalled();
  });
});
