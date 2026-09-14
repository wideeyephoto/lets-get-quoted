import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  save: vi.fn(), lookup: vi.fn(), ownerNotice: vi.fn(), capacity: vi.fn(), upload: vi.fn(), access: vi.fn(), feed: vi.fn(), claim: vi.fn(),
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
vi.mock('@/lib/client-owner-requests', async original => ({ ...await original<typeof import('@/lib/client-owner-requests')>(), saveClientRequest:mocks.save,findClientRequest:mocks.lookup }));
vi.mock('@/lib/owner-event-notices', () => ({ runOwnerEventNotices: mocks.ownerNotice }));
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
  mocks.feed.mockResolvedValue({ id: 'feed-a' });
  mocks.save.mockResolvedValue({feed_id:'feed-a',replayed:false});
  mocks.lookup.mockResolvedValue(null);
  mocks.upload.mockResolvedValue({ error: null });
  mocks.claim.mockResolvedValue({ ok: true, claim: { id: 'claim-a', description: 'Help', inWarrantyAtClaim: true } });
});

const photo = (bytes: number) => new File([new Uint8Array(bytes)], 'photo.jpg', { type: 'image/jpeg' });
const submit = {
  followup: (files: File[]) => requestJobFollowup('token', { description: 'Help', files, requestId:'11111111-1111-4111-8111-111111111111' }),
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

it.each(['followup','warranty','more_work'] as const)('saves %s metadata and dispatches only its owned event', async category => {
  expect(await requestJobFollowup('token',{ description:'Help',category,requestId:'11111111-1111-4111-8111-111111111111' })).toEqual({ok:true});
  expect(mocks.save).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({accountId:'account-a',jobId:'job-a',requestId:'11111111-1111-4111-8111-111111111111'}));
  expect(mocks.ownerNotice).toHaveBeenCalledWith(expect.anything(),{sourceId:'feed-a',accountId:'account-a'});
});

it('reuses a saved request before uploading any attachment again',async()=>{
  mocks.lookup.mockResolvedValue({payload_hash:'saved',feed_id:'feed-a'});
  expect(await submit.followup([photo(4)])).toEqual({ok:true});
  expect(mocks.upload).not.toHaveBeenCalled();expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.ownerNotice).toHaveBeenCalledWith(expect.anything(),{sourceId:'feed-a',accountId:'account-a'});
});
it('does not recreate a deleted request event',async()=>{
  mocks.lookup.mockResolvedValue({payload_hash:'saved',feed_id:null});
  expect(await submit.followup([photo(4)])).toEqual({ok:true});
  expect(mocks.upload).not.toHaveBeenCalled();expect(mocks.ownerNotice).not.toHaveBeenCalled();
});
it('retries identical attachments at the same path without overwriting files',async()=>{
  await submit.followup([photo(4)]);
  const first=mocks.upload.mock.calls[0];
  mocks.upload.mockResolvedValue({error:{statusCode:'409'}});
  expect(await submit.followup([photo(4)])).toEqual({ok:true});
  expect(mocks.upload.mock.calls[1][0]).toBe(first[0]);
  expect(first[2]).toMatchObject({upsert:false});
  expect(mocks.save.mock.calls[1][1].hash).toBe(mocks.save.mock.calls[0][1].hash);
});
it('refuses unknown attachment errors without saving a partial request',async()=>{
  mocks.upload.mockResolvedValue({error:{statusCode:'500'}});
  expect((await submit.followup([photo(4)])).ok).toBe(false);
  expect(mocks.save).not.toHaveBeenCalled();
});
it('rejects a request receipt conflict before any upload or notification',async()=>{
  mocks.lookup.mockRejectedValue(new Error('Different content'));
  expect((await submit.followup([photo(4)])).ok).toBe(false);
  expect(mocks.upload).not.toHaveBeenCalled();expect(mocks.ownerNotice).not.toHaveBeenCalled();
});
