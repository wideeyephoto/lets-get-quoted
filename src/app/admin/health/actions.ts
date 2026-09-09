'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, requireMfaPermission } from '@/lib/auth';
import { staffCan } from '@/lib/staff';
import { dispatchOnCallTestDrill } from '@/lib/on-call-paging';
import { cronJob } from '@/lib/cron-jobs';

export async function dispatchTestPageAction(): Promise<{ success: boolean; message: string }> {
  const { staff } = await requireAdmin();
  if (!staffCan(staff, 'ops.manage')) {
    return { success: false, message: 'Forbidden: Insufficient permissions to dispatch on-call alerts.' };
  }

  try {
    const event = await dispatchOnCallTestDrill(staff.email);
    revalidatePath('/admin/health');
    const accepted = event.dispatchedChannels.filter(channel => channel !== 'console_log_fallback');
    if (accepted.length === 0) {
      return { success: false, message: 'No notification provider accepted the test page. Check channel configuration and provider errors.' };
    }
    return {
      success: true,
      message: `Test page accepted by ${accepted.join(', ')} (ID: ${event.id}). Mailbox delivery is a separate check.`,
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to dispatch test page: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function runCronJobNowAction(jobSlug: string, confirmation?: string): Promise<{ success: boolean; message: string }> {
  const spec = cronJob(jobSlug);
  if (!spec) {
    return { success: false, message: `Unknown cron job: '${jobSlug}'.` };
  }

  const isMoney = spec.importance === 'money';
  const ctx = isMoney
    ? await requireMfaPermission('ops.manage')
    : await requireAdmin();

  if (!isMoney && !staffCan(ctx.staff, 'ops.manage')) {
    return { success: false, message: 'Forbidden: Insufficient permissions to trigger cron jobs (requires ops.manage).' };
  }

  if (isMoney && confirmation !== jobSlug) {
    return {
      success: false,
      message: `Typed confirmation required: to manually trigger money-moving worker '${jobSlug}', confirmation matching '${jobSlug}' must be provided.`,
    };
  }

  try {

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

