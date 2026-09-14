import { beforeEach,expect,it,vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
const mocks=vi.hoisted(()=>({get:vi.fn(),refund:vi.fn(),notify:vi.fn(),sms:vi.fn(),event:vi.fn()}));
vi.mock('@/lib/payments',()=>({refundPayment:mocks.refund}));
vi.mock('@/lib/quick-stop-requests',()=>({getQuickStopRequest:mocks.get,logQuickStopEvent:mocks.event}));
vi.mock('@/lib/owner-event-notices',()=>({runOwnerEventNotices:mocks.notify}));
vi.mock('@/lib/sms',()=>({sendQuickStopStatusSms:mocks.sms}));
vi.mock('@/lib/admin',()=>({logAdminAction:vi.fn(),systemActor:()=>({})}));
import { resolveQuickStopCancellation } from '@/lib/quick-stop-refunds';
const query={select:vi.fn(),eq:vi.fn(),update:vi.fn(),maybeSingle:vi.fn()};
const from=vi.fn(()=>query);const admin={from} as unknown as SupabaseClient;
beforeEach(()=>{
  vi.clearAllMocks();query.select.mockReturnValue(query);query.eq.mockReturnValue(query);query.update.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({data:{id:'request-1'},error:null});
  mocks.get.mockResolvedValue({id:'request-1',status:'confirmed',account_id:'account-1',client_name:'Customer',paid_at:null});
});
it.each(['customer_canceled','contractor_canceled','no_show_confirmed','refunded','completed'])('does not reopen a %s refund or notify again',async status=>{
  mocks.get.mockResolvedValueOnce({status,refund_cents:7500});
  await resolveQuickStopCancellation(admin,'account-1','request-1',{kind:'customer_cancel'});
  expect(from).not.toHaveBeenCalled();expect(mocks.refund).not.toHaveBeenCalled();expect(mocks.notify).not.toHaveBeenCalled();
});
it('dispatches only the saved cancellation event',async()=>{
  await resolveQuickStopCancellation(admin,'account-1','request-1',{kind:'customer_cancel'});
  expect(mocks.notify).toHaveBeenCalledWith(admin,{sourceId:'request-1',accountId:'account-1'});
});
it('does not notify or refund when another cancellation already won',async()=>{
  query.maybeSingle.mockResolvedValueOnce({data:{},error:null}).mockResolvedValueOnce({data:null,error:null});
  await resolveQuickStopCancellation(admin,'account-1','request-1',{kind:'customer_cancel'});
  expect(mocks.refund).not.toHaveBeenCalled();expect(mocks.notify).not.toHaveBeenCalled();
});
