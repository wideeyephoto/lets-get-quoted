import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({auth:vi.fn(),load:vi.fn(),review:vi.fn(),dispatch:vi.fn(),audit:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireMfaPermission:mocks.auth}));
vi.mock('@/lib/admin',()=>({logAdminAction:mocks.audit}));
vi.mock('@/lib/owner-event-notices',()=>({dispatchMessagingOwnerNotices:mocks.dispatch}));
vi.mock('@/lib/messaging-number-provisioning',()=>({loadAdminMessagingRegistrationApplication:mocks.load,reviewMessagingRegistrationApplication:mocks.review}));
vi.mock('@/lib/messaging-registration-action-failure',()=>({logMessagingRegistrationActionFailure:()=> 'correlation'}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('next/navigation',()=>({redirect:(url:string)=>{throw new Error(url);}}));
import { reviewMessagingApplicationAction } from '@/app/admin/messaging/registrations/actions';
const id='11111111-1111-4111-8111-111111111111';const admin={rpc:vi.fn()};
beforeEach(()=>{
  vi.clearAllMocks();mocks.auth.mockResolvedValue({admin,adminEmail:'operator@example.test'});
  mocks.load.mockResolvedValue({id,accountId:'account-1',status:'submitted'});
  mocks.review.mockResolvedValue(undefined);mocks.audit.mockResolvedValue(undefined);mocks.dispatch.mockResolvedValue(undefined);
});
function form(){const f=new FormData();f.set('applicationId',id);f.set('decision','action_required');f.set('detail','Please correct the business address');return f;}
it('dispatches saved notices only after an authorized review has committed',async()=>{
  await expect(reviewMessagingApplicationAction(form())).rejects.toThrow('done=1');
  expect(mocks.auth).toHaveBeenCalledWith('ops.manage');
  expect(mocks.dispatch).toHaveBeenCalledWith(admin,'account-1',id);
  expect(mocks.review.mock.invocationCallOrder[0]).toBeLessThan(mocks.dispatch.mock.invocationCallOrder[0]);
});
it('preserves successful review when immediate notification pickup fails',async()=>{
  mocks.dispatch.mockRejectedValueOnce(new Error('queue read unavailable'));
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  try {await expect(reviewMessagingApplicationAction(form())).rejects.toThrow('done=1');} finally {log.mockRestore();}
  expect(mocks.review).toHaveBeenCalledTimes(1);
});
it('does not dispatch after failed review or denied permission',async()=>{
  mocks.review.mockRejectedValueOnce(new Error('database unavailable'));
  await expect(reviewMessagingApplicationAction(form())).rejects.toThrow('error=1');
  expect(mocks.dispatch).not.toHaveBeenCalled();
  mocks.auth.mockRejectedValueOnce(new Error('permission denied'));
  await expect(reviewMessagingApplicationAction(form())).rejects.toThrow('permission denied');
  expect(mocks.dispatch).not.toHaveBeenCalled();
});
