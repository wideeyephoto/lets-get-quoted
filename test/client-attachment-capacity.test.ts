import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  capacity: vi.fn(), upload: vi.fn(), access: vi.fn(), feed: vi.fn(), claim: vi.fn(),
}));
vi.mock('@/lib/billing/storage-usage', () => ({ assertStorageCapacity: mocks.capacity }));
vi.mock('@/lib/auth', () => ({ createAdminClient: () => ({
  storage: { from: () => ({ upload: mocks.upload }) },
  from: () => ({ select: () => ({ eq: () => ({ eq: () => ({
    maybeSingle: async () => ({ data: { ref: 'J-1', client_name: 'Client' } }),
  }) }) }) }),
}) }));
vi.mock('@/lib/change-order-client', () => ({ resolveJobAccess: mocks.access }));
vi.mock('@/lib/job-feed', () => ({ createJobFeedEvent: mocks.feed }));
vi.mock('@/lib/warranties-data', () => ({ raiseClaim: mocks.claim }));
vi.mock('@/lib/email', () => ({ getAccountOwnerEmail: async () => null, sendContractorAlertEmail: vi.fn() }));
vi.mock('@/lib/business-name', () => ({ loadBusinessName: async () => 'Business' }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => true, clientIpFrom: () => '127.0.0.1' }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { requestJobFollowup } from '@/lib/client-followup-request';
import { raiseWarrantyClaimAction } from '@/app/client/jobs/[token]/warranty-actions';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ accountId: 'account-a', jobId: 'job-a' });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.claim.mockResolvedValue({ ok: true, claim: { id: 'claim-a', description: 'Help', inWarrantyAtClaim: true } });
});

const photo = (bytes: number) => new File([new Uint8Array(bytes)], 'photo.jpg', { type: 'image/jpeg' });
const submit = {
  followup: (files: File[]) => requestJobFollowup('token', { description: 'Help', files }),
  warranty: (files: File[]) => {
    const form = new FormData();
    form.set('description', 'Help');
    files.forEach((file) => form.append('photos', file));
    return raiseWarrantyClaimAction('token', 'warranty-a', form);
  },
};

describe.each(['followup', 'warranty'] as const)('%s attachment capacity', (kind) => {
  it('checks the combined batch against the token workspace before writing any file', async () => {
    expect(await submit[kind]([photo(4), photo(6)])).toEqual({ ok: true });
    expect(mocks.capacity).toHaveBeenCalledWith(expect.anything(), 'account-a', 10);
    expect(mocks.capacity.mock.invocationCallOrder[0]).toBeLessThan(mocks.upload.mock.invocationCallOrder[0]);
    expect(mocks.upload).toHaveBeenCalledTimes(2);
  });

  it('refuses the whole batch without uploading or recording a partial request', async () => {
    mocks.capacity.mockRejectedValue(new Error('Private workspace billing details'));
    const result = await submit[kind]([photo(4), photo(6)]);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).toContain('without');
    expect(JSON.stringify(result)).not.toContain('Private');
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.feed).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it('still accepts a text-only request when storage is full', async () => {
    mocks.capacity.mockRejectedValue(new Error('Full'));
    expect(await submit[kind]([])).toEqual({ ok: true });
    expect(mocks.capacity).not.toHaveBeenCalled();
  });

  it('does not inspect capacity or upload for an invalid access token', async () => {
    mocks.access.mockResolvedValue(null);
    expect((await submit[kind]([photo(4)])).ok).toBe(false);
    expect(mocks.capacity).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
