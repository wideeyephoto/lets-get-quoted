import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc:vi.fn(), receipt:vi.fn(), getJob:vi.fn() }));
vi.mock('@/lib/auth', () => ({ createAdminClient: () => ({ rpc:mocks.rpc, from:(table:string) => {
  const query = { select:()=>query, eq:()=>query, maybeSingle:()=>table==='client_job_access'
    ? Promise.resolve({data:{account_id:'account',job_id:'job'},error:null}) : mocks.receipt() };
  return query;
} }) }));
vi.mock('@/lib/jobs', async original => ({...await original<typeof import('@/lib/jobs')>(),getJob:mocks.getJob}));
import { approveClientJobQuote } from '@/lib/job-feed';
beforeEach(() => { vi.resetAllMocks(); mocks.receipt.mockResolvedValue({data:null,error:null}); mocks.getJob.mockResolvedValue({id:'job',quote_items:[],quoted_amount:200}); });
it('rejects a quote revision different from the one shown before saving approval or creating a deposit', async () => {
  await expect(approveClientJobQuote('token',[],'Client',null,{requestId:'10000000-0000-4000-8000-000000000001',revision:'a'.repeat(64)})).rejects.toThrow('Quote changed');
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('stops when replay evidence cannot be read', async () => {
  mocks.receipt.mockResolvedValue({data:null,error:{message:'unavailable'}});
  await expect(approveClientJobQuote('token',[],'Client',null,{requestId:'10000000-0000-4000-8000-000000000001',revision:'a'.repeat(64)})).rejects.toThrow('Could not check saved approval');
  expect(mocks.rpc).not.toHaveBeenCalled();
});

