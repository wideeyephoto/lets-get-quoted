// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
const mocks=vi.hoisted(()=>({submit:vi.fn()}));
vi.mock('@/app/client/jobs/[token]/actions',()=>({submitJobFeedbackAction:mocks.submit}));
import ClientReviewCard from '@/app/client/jobs/[token]/ClientReviewCard';

let container: HTMLDivElement;
let root: Root;
beforeEach(()=>{
  vi.clearAllMocks();
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const button=(text:RegExp)=>Array.from(container.querySelectorAll('button')).find(b=>text.test(b.textContent??''))!;
const click=async(text:RegExp)=>act(async()=>button(text).click());
const submit=async()=>act(async()=>{container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
it('keeps the form content and request ID after an uncertain response, and uses a fresh ID after reopening',async()=>{
  mocks.submit.mockRejectedValueOnce(new Error('Response lost')).mockResolvedValue({ok:false,message:'Retry this form'});
  await act(async()=>root.render(<ClientReviewCard token="token" businessName="Builder" googleUrl={null} isComplete={true}/>));
  await click(/Send private note to owner/i);
  container.querySelector('textarea')!.value='Please check the repaired tap';
  await submit();
  expect(container.textContent).toContain('Could not confirm submission. Retry this form.');
  expect(container.querySelector('textarea')!.value).toBe('Please check the repaired tap');
  await submit();
  expect(mocks.submit).toHaveBeenCalledTimes(2);
  const first=mocks.submit.mock.calls[0][1] as FormData;
  const second=mocks.submit.mock.calls[1][1] as FormData;
  expect(first.get('request_id')).toMatch(/^[0-9a-f-]{36}$/);
  expect(second.get('request_id')).toBe(first.get('request_id'));
  expect(second.get('feedback')).toBe(first.get('feedback'));
  expect(container.textContent).toContain('Retry this form');
  await click(/cancel/i);
  await click(/Send private note to owner/i);
  container.querySelector('textarea')!.value='A new request';
  await submit();
  expect(mocks.submit).toHaveBeenCalledTimes(3);
  expect((mocks.submit.mock.calls[2][1] as FormData).get('request_id')).not.toBe(first.get('request_id'));
});
