import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
vi.mock('@/lib/email', () => ({ getAccountOwnerEmail: vi.fn(), sendOwnerEventNoticeEmail: vi.fn() }));
import { dispatchMessagingOwnerNotices } from '@/lib/owner-event-notices';
it('limits pickup to pending events of the exact account and application', async () => {
  const eq=vi.fn(); const order=vi.fn(); const limit=vi.fn();
  const query={ select:vi.fn(),eq,order,limit };
  query.select.mockReturnValue(query);eq.mockReturnValue(query);order.mockReturnValue(query);
  limit.mockResolvedValue({data:[{source_id:'source-1'}],error:null});
  const reviews={select:vi.fn(),eq:vi.fn(),order:vi.fn(),limit:vi.fn()};
  reviews.select.mockReturnValue(reviews);reviews.eq.mockReturnValue(reviews);reviews.order.mockReturnValue(reviews);reviews.limit.mockResolvedValue({data:[],count:0,error:null});
  const from=vi.fn().mockReturnValueOnce(query).mockReturnValue(reviews);
  const rpc=vi.fn().mockResolvedValue({data:[],error:null});
  await dispatchMessagingOwnerNotices({from,rpc} as unknown as SupabaseClient,'account-1','application-1');
  expect(eq.mock.calls).toEqual([['account_id','account-1'],['source_type','messaging_registration_event'],['source_payload->>application_id','application-1'],['state','pending']]);
  expect(limit).toHaveBeenCalledWith(5);
  expect(rpc).toHaveBeenCalledWith('claim_owner_event_notices',{p_limit:1,p_source_id:'source-1',p_account_id:'account-1'});
});
it('does not dispatch when no pending source exists or the queue read fails', async () => {
  const query={select:vi.fn(),eq:vi.fn(),order:vi.fn(),limit:vi.fn()};
  query.select.mockReturnValue(query);query.eq.mockReturnValue(query);query.order.mockReturnValue(query);
  query.limit.mockResolvedValueOnce({data:[],error:null}).mockResolvedValueOnce({data:null,error:{message:'unavailable'}});
  const rpc=vi.fn(); const admin={from:()=>query,rpc} as unknown as SupabaseClient;
  await dispatchMessagingOwnerNotices(admin,'account-1','application-1');
  await expect(dispatchMessagingOwnerNotices(admin,'account-1','application-1')).rejects.toThrow('pending messaging');
  expect(rpc).not.toHaveBeenCalled();
});
