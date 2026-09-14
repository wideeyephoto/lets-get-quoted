// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
const mocks=vi.hoisted(()=>({submit:vi.fn()}));
vi.mock('@/app/book/[subdomain]/actions',()=>({submitQuickStopRequestAction:mocks.submit}));
import QuickStopFlow from '@/app/book/[subdomain]/QuickStopFlow';
let container:HTMLDivElement,root:Root;
beforeEach(()=>{vi.clearAllMocks();(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);vi.stubGlobal('fetch',vi.fn().mockResolvedValue({json:async()=>({eligible:true})}));});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
const click=async(text:RegExp)=>act(async()=>{Array.from(container.querySelectorAll('button')).find(b=>text.test(b.textContent??''))!.click();});
const fill=async(id:string,value:string)=>act(async()=>{const el=container.querySelector('#'+id)!;Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});
it('retains the same submission ID and customer content after a lost response',async()=>{
  mocks.submit.mockRejectedValueOnce(new Error('Response lost')).mockResolvedValueOnce({ok:true});
  await act(async()=>root.render(<QuickStopFlow subdomain="builder" siteId="site" businessName="Builder" days={[]} referralCode={null} startOpen/>));
  await fill('es-issue','Leaking tap');await click(/Check if this qualifies/);
  await fill('es-name','Alex');await fill('es-phone','5552223333');await fill('es-address','1 Main');
  await click(/Send the request/);expect(container.textContent).toContain('Please try again');
  expect((container.querySelector('#es-address') as HTMLInputElement).value).toBe('1 Main');
  await click(/Send the request/);expect(mocks.submit).toHaveBeenCalledTimes(2);
  const first=mocks.submit.mock.calls[0][0] as FormData,second=mocks.submit.mock.calls[1][0] as FormData;
  expect(first.get('request_id')).toMatch(/^[0-9a-f-]{36}$/);expect(second.get('request_id')).toBe(first.get('request_id'));
  expect(second.get('issue')).toBe('Leaking tap');expect(container.textContent).toContain('Request sent');
});
