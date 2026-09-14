import { beforeEach,expect,it,vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
const mocks=vi.hoisted(()=>({client:vi.fn(),notify:vi.fn()}));
vi.mock('@/lib/clients',()=>({findOrCreateClientId:mocks.client}));
vi.mock('@/lib/owner-event-notices',()=>({runOwnerEventNotices:mocks.notify}));
import { createQuickStopRequest } from '@/lib/quick-stop-requests';
const q={insert:vi.fn(),select:vi.fn(),single:vi.fn()};const admin={from:vi.fn(()=>q),rpc:vi.fn(()=>q.single())} as unknown as SupabaseClient;
const input={name:'Customer',phone:'+12485550140',email:'CUSTOMER@example.test',address:'1 Main St',issue:'Leaking tap',startedWhen:null,worsening:null,propertyType:null,availability:null,photoPaths:[]};
const qualification={summary:'Leaking tap',visitMinutes:20} as Parameters<typeof createQuickStopRequest>[3];
const opts={responseDeadlineMins:30,lat:null,lng:null,businessName:'Builder',requestId:'e7390b32-9c62-4d9e-bc50-d4033aa63141',payloadHash:'a'.repeat(64)};
beforeEach(()=>{vi.clearAllMocks();mocks.client.mockResolvedValue('client-1');q.insert.mockReturnValue(q);q.select.mockReturnValue(q);q.single.mockResolvedValue({data:{quick_stop_id:'request-1',replayed:false},error:null});});
it('dispatches only the created request in the owned account',async()=>{
  await createQuickStopRequest(admin,'account-1',input,qualification,opts);
  expect(mocks.notify).toHaveBeenCalledWith(admin,{sourceId:'request-1',accountId:'account-1'});
  expect(admin.rpc).toHaveBeenCalledWith('submit_quick_stop_request',expect.objectContaining({p_request_id:opts.requestId,p_request:expect.objectContaining({client_email:'customer@example.test',status:'awaiting_contractor'})}));
});
it('does not dispatch after duplicate or failed insertion',async()=>{
  q.single.mockResolvedValueOnce({data:null,error:{message:'Active request already exists'}});
  await expect(createQuickStopRequest(admin,'account-1',input,qualification,opts)).rejects.toThrow('Active request');
  expect(mocks.notify).not.toHaveBeenCalled();
});

it('does not repeat the opening audit or inline notice pickup on a receipt replay',async()=>{
  q.single.mockResolvedValueOnce({data:{quick_stop_id:null,replayed:true},error:null});
  expect(await createQuickStopRequest(admin,'account-1',input,qualification,opts)).toEqual({quick_stop_id:null,replayed:true});
  expect(q.insert).not.toHaveBeenCalled();expect(mocks.notify).not.toHaveBeenCalled();
});
