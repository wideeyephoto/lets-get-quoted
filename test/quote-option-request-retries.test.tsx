import React from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({admin:vi.fn(),access:vi.fn(),notice:vi.fn()}));
vi.mock('@/lib/auth',()=>({createAdminClient:mocks.admin}));
vi.mock('@/lib/change-order-client',()=>({resolveJobAccess:mocks.access}));
vi.mock('@/lib/owner-event-notices',()=>({runOwnerEventNotices:mocks.notice}));
vi.mock('@/app/client/jobs/[token]/QuoteDeck',()=>({QUOTE_FORM_ID:'quote-approve',LiveTotal:()=>null,useQuoteDeck:()=>({hasOptionChanges:true,committedTotal:100,total:150,addons:[{id:'extra',label:'Gate',selected:false,amount:50}],selected:{extra:true}})}));
import {QuoteOptionsUpdate} from '@/app/client/jobs/[token]/QuoteAcceptance';
import {quoteOptionRequestHash,quoteOptionRevision} from '@/lib/quote-option-requests';
import {updateClientQuoteOptions} from '@/lib/quote-options-data';
const items=[{id:'base',label:'Work',amount:100,kind:'base',selected:true},{id:'extra',label:'Gate',amount:50,kind:'addon',selected:false}];
const request={requestId:'10000000-0000-4000-8000-000000000099',revision:quoteOptionRevision(items,100)};
beforeEach(()=>{vi.clearAllMocks();mocks.access.mockResolvedValue({accountId:'account-1',jobId:'job-1'});mocks.notice.mockResolvedValue({});});
it('binds requests to the displayed quote, job and choices while ignoring choice order and duplicates',()=>{
  expect(quoteOptionRequestHash('job-1',['b','a','a'],request)).toBe(quoteOptionRequestHash('job-1',['a','b'],request));
  expect(quoteOptionRequestHash('job-1',['a'],request)).not.toBe(quoteOptionRequestHash('job-2',['a'],request));
  expect(quoteOptionRevision(items,100)).not.toBe(quoteOptionRevision(items,101));
  expect(quoteOptionRevision(items,100)).not.toBe(quoteOptionRevision(items.map(i=>({...i,label:'Changed'})),100));
});
it('returns a saved result before reading a later quote and never saves it again',async()=>{
  const rpc=vi.fn();const from=vi.fn(()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{payload_hash:quoteOptionRequestHash('job-1',['extra'],request),total:150,event_id:'saved-event'},error:null})};return q;});
  const admin={from,rpc};mocks.admin.mockReturnValue(admin);
  expect(await updateClientQuoteOptions('token',['extra'],request)).toEqual({ok:true,total:150});
  expect(from).toHaveBeenCalledTimes(1);expect(from).toHaveBeenCalledWith('quote_option_request_receipts');expect(rpc).not.toHaveBeenCalled();
  expect(mocks.notice).toHaveBeenCalledWith(admin,{sourceId:'saved-event',accountId:'account-1'});
});
it.each(['stale','changed-request','read-error','missing-id'])('rejects %s before writes or notices',async mode=>{
  const rpc=vi.fn();const from=vi.fn((table:string)=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='jobs'?{quote_items:items,quoted_amount:999}:mode==='changed-request'?{payload_hash:'b'.repeat(64)}:null,error:mode==='read-error'?{}:null})};return q;});
  mocks.admin.mockReturnValue({from,rpc});
  expect((await updateClientQuoteOptions('token',['extra'],mode==='missing-id'?{...request,requestId:''}:request)).ok).toBe(false);
  expect(rpc).not.toHaveBeenCalled();expect(mocks.notice).not.toHaveBeenCalled();
});
it('retains the request and displayed revision after a lost response, then creates a new request after success',async()=>{
  const received:FormData[]=[];const action=vi.fn(async(data:FormData)=>{received.push(data);if(received.length===1)throw new Error('lost response');return {ok:true as const,total:150};});
  let tree!:ReactTestRenderer;
  await act(async()=>{tree=create(<QuoteOptionsUpdate updateAction={action} revision="old-revision" businessName="Builder" until={null}/>);});
  expect(action).not.toHaveBeenCalled();expect(tree.root.findByType('form').props.id).toBe('quote-approve');
  const send=async()=>{const form=new FormData();form.append('addon','extra');await act(async()=>{await tree.root.findByType('form').props.action(form);});};
  await send();expect(JSON.stringify(tree.toJSON())).toContain('Retry the same choices');
  await act(async()=>{tree.update(<QuoteOptionsUpdate updateAction={action} revision="new-revision" businessName="Builder" until={null}/>);});
  await send();expect(received[1].get('request_id')).toBe(received[0].get('request_id'));expect(received[1].get('quote_revision')).toBe('old-revision');
  expect(JSON.stringify(tree.toJSON())).toContain('Your option change was saved');
  await send();expect(received[2].get('request_id')).not.toBe(received[1].get('request_id'));expect(received[2].get('quote_revision')).toBe('new-revision');
  tree.unmount();
});
