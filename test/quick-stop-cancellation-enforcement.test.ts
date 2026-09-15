import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks=vi.hoisted(()=>({
  getRequest:vi.fn(),processRefunds:vi.fn(),logEvent:vi.fn(),logAdmin:vi.fn(),sendSms:vi.fn(),ownerEmail:vi.fn(),
}));
vi.mock('@/lib/quick-stop-requests',()=>({getQuickStopRequest:mocks.getRequest,logQuickStopEvent:mocks.logEvent}));
vi.mock('@/lib/quick-stop-refund-recovery',()=>({processQuickStopRefunds:mocks.processRefunds}));
vi.mock('@/lib/admin',()=>({logAdminAction:mocks.logAdmin,systemActor:()=>({adminEmail:'system'})}));
vi.mock('@/lib/sms',()=>({sendQuickStopStatusSms:mocks.sendSms}));
vi.mock('@/lib/email',()=>({getAccountOwnerEmail:mocks.ownerEmail,sendContractorAlertEmail:vi.fn()}));
import { resolveQuickStopCancellation } from '@/lib/quick-stop-refunds';

describe('cancellation audit uses the committed no-show enforcement',()=>{
  const request={
    id:'request-1',account_id:'account-1',status:'confirmed',payment_id:'payment-1',job_id:'job-1',
    fee_cents:10000,refund_cents:0,paid_at:'2026-09-14T17:00:00Z',arrived_at:null,
    arrival_date:'2026-09-14',arrival_start:'14:00',arrival_end:'15:00',client_name:'Customer',client_phone:null,
  };
  const outcome={tier:2,untilIso:'2026-10-14T22:30:00Z',reason:'Second no-show',priorNoShows:1,changed:true};
  function client(result: unknown=outcome,enforcementError: unknown=null){
    const accountChain={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),maybeSingle:vi.fn().mockResolvedValue({data:{timezone:'America/Los_Angeles'},error:null})};
    const enforcementChain={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),maybeSingle:vi.fn().mockResolvedValue({data:result ? {result}:null,error:enforcementError})};
    const from=vi.fn((table:string)=>table==='accounts'?accountChain:enforcementChain);
    const rpc=vi.fn().mockResolvedValue({data:true,error:null});
    return {admin:{from,rpc} as unknown as SupabaseClient,from,rpc,enforcementChain};
  }
  beforeEach(()=>{
    vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-14T22:30:00Z'));
    mocks.getRequest.mockResolvedValue({...request,status:'no_show_confirmed',refund_due_cents:10000,refund_state:'pending'})
      .mockResolvedValueOnce(request);
    mocks.ownerEmail.mockResolvedValue(null);
    mocks.processRefunds.mockResolvedValue({completed:0,pending:1,review:0});
  });
  afterEach(()=>vi.useRealTimers());

  it('attributes the database result to the staff actor before attempting a provider refund',async()=>{
    const {admin,rpc,from,enforcementChain}=client();
    const actor={adminEmail:'risk@example.test',permission:'account.enforce',staff:{id:'staff-1'}};
    await resolveQuickStopCancellation(admin,'account-1','request-1',{kind:'no_show',actor,requireReportingWindow:true});
    expect(rpc).toHaveBeenCalledWith('cancel_quick_stop_request',expect.objectContaining({p_kind:'no_show',p_require_reporting_window:true}));
    expect(from).toHaveBeenCalledWith('quick_stop_no_show_enforcements');
    expect(enforcementChain.eq).toHaveBeenCalledWith('account_id','account-1');
    expect(enforcementChain.eq).toHaveBeenCalledWith('request_id','request-1');
    expect(mocks.logAdmin).toHaveBeenCalledWith(admin,actor,expect.objectContaining({action:'extra_stop_auto_lock',meta:{tier:2,until:outcome.untilIso,reason:outcome.reason,requestId:'request-1',priorNoShows:1}}));
    expect(mocks.logAdmin.mock.invocationCallOrder[0]).toBeLessThan(mocks.processRefunds.mock.invocationCallOrder[0]);
    expect(from).not.toHaveBeenCalledWith('extra_stop_requests');
  });
  it('does not claim an enforcement change when a stronger lock was preserved',async()=>{
    const {admin}=client({...outcome,changed:false});
    await resolveQuickStopCancellation(admin,'account-1','request-1',{kind:'no_show'});
    expect(mocks.logAdmin).not.toHaveBeenCalled();
    expect(mocks.processRefunds).toHaveBeenCalled();
  });
  it('does not apply or audit enforcement again on a repeated cancellation',async()=>{
    mocks.getRequest.mockReset().mockResolvedValue({...request,status:'no_show_confirmed',refund_due_cents:10000,refund_state:'pending'});
    const {admin,rpc,from}=client();
    await resolveQuickStopCancellation(admin,'account-1','request-1',{kind:'no_show'});
    expect(rpc).not.toHaveBeenCalled(); expect(from).not.toHaveBeenCalled();
    expect(mocks.logAdmin).not.toHaveBeenCalled(); expect(mocks.processRefunds).not.toHaveBeenCalled();
  });
  it('does not duplicate audit or provider work after losing the cancellation claim',async()=>{
    const {admin,rpc,from}=client(); rpc.mockResolvedValue({data:false,error:null});
    await resolveQuickStopCancellation(admin,'account-1','request-1',{kind:'no_show'});
    expect(from).not.toHaveBeenCalledWith('quick_stop_no_show_enforcements');
    expect(mocks.logAdmin).not.toHaveBeenCalled(); expect(mocks.processRefunds).not.toHaveBeenCalled();
  });
  it('continues durable refund processing when the best-effort audit projection cannot be read',async()=>{
    const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
    try {
      const {admin}=client(null,{message:'temporarily unavailable'});
      await resolveQuickStopCancellation(admin,'account-1','request-1',{kind:'no_show'});
      expect(mocks.logAdmin).not.toHaveBeenCalled(); expect(mocks.processRefunds).toHaveBeenCalled();
      expect(spy).toHaveBeenCalledWith('Quick Stop enforcement audit result unavailable:','temporarily unavailable');
    } finally { spy.mockRestore(); }
  });
});
