'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { staffCan } from '@/lib/staff';
import { dispatchOnCallTestDrill } from '@/lib/on-call-paging';

export async function dispatchTestPageAction(): Promise<{ success: boolean; message: string }> {
  try {
    const { staff } = await requireAdmin();
    if (!staffCan(staff, 'ops.manage')) {
      return { success: false, message: 'Forbidden: Insufficient permissions to dispatch on-call alerts.' };
    }

    const event = await dispatchOnCallTestDrill(staff.email);
    revalidatePath('/admin/health');
    return {
      success: true,
      message: `Test page successfully dispatched (ID: ${event.id}) via ${event.dispatchedChannels.join(', ')}.`,
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to dispatch test page: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
