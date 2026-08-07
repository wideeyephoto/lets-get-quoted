'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth';
import { changeStaffAccess } from '@/lib/staff-directory';
import { isStaffRole } from '@/lib/staff';

function back(query: string): never {
  redirect(`/admin/staff?${query}`);
}

export async function changeStaffAccessAction(staffId: string, formData: FormData) {
  const ctx = await requirePermission('staff.manage');

  const roleRaw = String(formData.get('role') ?? '').trim();
  const activeRaw = String(formData.get('active') ?? '').trim();
  // A reason is required here and nowhere else in the console. Every other
  // action leaves a trail of WHAT; this one is the trail of who was allowed to
  // do it, and "why did this person get refund access" has no other answer.
  const reason = String(formData.get('reason') ?? '').trim();
  if (!reason) back('error=reason');

  // Never falls back to a role: an unrecognised value means the form sent
  // something unexpected, and quietly assigning read_only would look like the
  // change succeeded while silently removing somebody's access.
  if (roleRaw && !isStaffRole(roleRaw)) back('error=role');

  const result = await changeStaffAccess(ctx.admin, ctx, {
    staffId,
    role: roleRaw ? (isStaffRole(roleRaw) ? roleRaw : undefined) : undefined,
    active: activeRaw === '' ? undefined : activeRaw === 'true',
    reason,
  });

  if (!result.ok) back(`error=${result.error}`);

  revalidatePath('/admin/staff');
  back('done=changed');
}
