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

export async function runCronJobNowAction(jobSlug: string): Promise<{ success: boolean; message: string }> {
  try {
    const ctx = await requireAdmin();
    if (!staffCan(ctx.staff, 'ops.manage')) {
      return { success: false, message: 'Forbidden: Insufficient permissions to trigger cron jobs (requires ops.manage).' };
    }

    const { cronJob } = await import('@/lib/cron-jobs');
    const spec = cronJob(jobSlug);
    if (!spec) {
      return { success: false, message: `Unknown cron job: '${jobSlug}'.` };
    }

    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return { success: false, message: 'Server configuration error: CRON_SECRET is not configured.' };
    }

    const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3010')).replace(/\/$/, '');
    const endpoint = `${appOrigin}/api/cron/${encodeURIComponent(jobSlug)}`;

    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${secret}`,
        'x-staff-invoker': ctx.staff.email,
        'cache-control': 'no-cache',
      },
      cache: 'no-store',
    });

    const body = await res.json().catch(() => null);

    const { logAdminAction } = await import('@/lib/admin');
    await logAdminAction(ctx.admin, {
      adminEmail: ctx.staff.email,
      staff: ctx.staff,
      permission: 'ops.manage',
    }, {
      action: 'cron_run_now',
      targetType: 'cron_job',
      targetId: jobSlug,
      reason: `Manual execution triggered via /admin/health by ${ctx.staff.email}`,
      meta: {
        job: jobSlug,
        statusCode: res.status,
        summary: body,
      },
    });

    revalidatePath('/admin/health');
    revalidatePath(`/admin/health/${encodeURIComponent(jobSlug)}`);

    if (!res.ok) {
      const errorMsg = body?.error || body?.message || `HTTP status ${res.status}`;
      return {
        success: false,
        message: `Cron job '${spec.label}' returned error: ${errorMsg}`,
      };
    }

    return {
      success: true,
      message: `Cron job '${spec.label}' ran successfully.`,
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to trigger cron job: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

