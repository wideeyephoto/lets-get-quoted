'use server';

import { createAdminClient } from '@/lib/auth';
import { resolvePortalAccess } from '@/lib/client-portal';
import { submitPortalMessage } from '@/lib/client-portal-data';
import { getAccountOwnerEmail, sendContractorAlertEmail } from '@/lib/email';
import { createJobFeedEvent } from '@/lib/job-feed';
import { setRecurringPlanActive } from '@/lib/recurring';
import { checkRateLimit, checkRateLimitStrict } from '@/lib/rate-limit';
import { revalidatePath } from 'next/cache';

export async function sendPortalMessageAction(
  token: string,
  formData: FormData,
): Promise<{ ok: boolean; message?: string }> {
  const body = String(formData.get('message') ?? '').trim();
  const jobId = (formData.get('jobId') as string | null) || null;

  if (!body) {
    return { ok: false, message: 'Please write a message before sending.' };
  }

  const admin = createAdminClient();
  const access = await resolvePortalAccess(admin, token);
  if (!access) {
    return { ok: false, message: 'Your link has expired. Please request a fresh one.' };
  }

  // 10 messages per hour per portal link
  if (!(await checkRateLimit(admin, `portal-msg:${token}-hr`, 10, 3600))) {
    return { ok: false, message: 'You have sent too many messages recently. Please try again later.' };
  }

  const result = await submitPortalMessage(admin, {
    accountId: access.accountId,
    clientId: access.clientId,
    body,
    jobId,
  });

  if (result.ok) {
    revalidatePath(`/portal/view/${token}`);
  }

  return result;
}

export async function customerTogglePlanAction(
  token: string,
  planId: string,
  active: boolean,
): Promise<void> {
  const admin = createAdminClient();
  const access = await resolvePortalAccess(admin, token);
  if (!access) {
    throw new Error('Your link has expired. Please request a fresh one.');
  }

  // Cooldown: 5 toggles per hour
  if (!(await checkRateLimitStrict(admin, `portal-plan-toggle:${token}`, 5, 3600))) {
    throw new Error('You have toggled your plan too many times recently. Please try again later.');
  }

  const [{ data: plan, error: planError }, { data: client }, { data: site }, { data: account }] = await Promise.all([
    admin
      .from('recurring_plans')
      .select('id, client_id, title, last_job_id')
      .eq('account_id', access.accountId)
      .eq('id', planId)
      .maybeSingle(),
    admin
      .from('clients')
      .select('name, phone, email')
      .eq('account_id', access.accountId)
      .eq('id', access.clientId)
      .maybeSingle(),
    admin
      .from('sites')
      .select('company_name')
      .eq('account_id', access.accountId)
      .maybeSingle(),
    admin
      .from('accounts')
      .select('business_name')
      .eq('id', access.accountId)
      .maybeSingle(),
  ]);

  if (planError || !plan || plan.client_id !== access.clientId) {
    throw new Error('Plan not found or unauthorized.');
  }

  await setRecurringPlanActive(admin, access.accountId, planId, active);

  const clientName = (client?.name as string) || 'Customer';
  const businessName = (site?.company_name as string) || (account?.business_name as string) || 'Contractor';

  // Find associated job for feed event
  let targetJobId: string | null = (plan.last_job_id as string | null) ?? null;
  if (!targetJobId) {
    const { data: latestJob } = await admin
      .from('jobs')
      .select('id')
      .eq('account_id', access.accountId)
      .eq('recurring_plan_id', planId)
      .order('scheduled_for', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    targetJobId = (latestJob?.id as string | null) ?? null;
  }

  if (targetJobId) {
    try {
      await createJobFeedEvent(admin, access.accountId, targetJobId, {
        kind: 'note',
        title: active ? `Recurring plan resumed by ${clientName}` : `Recurring plan paused by ${clientName}`,
        body: active
          ? `${clientName} resumed their recurring maintenance plan "${plan.title}". Future service visits have been restored to the calendar.`
          : `${clientName} paused their recurring maintenance plan "${plan.title}". Future scheduled visits were removed from the calendar.`,
        visibility: 'internal',
        author: clientName,
      });
    } catch (feedErr) {
      console.error('Failed to log job feed event for customer plan toggle:', feedErr);
    }
  } else {
    // Audit row if no job found
    try {
      await admin.from('client_feed').insert({
        account_id: access.accountId,
        client_id: access.clientId,
        kind: 'note',
        title: active ? `Recurring plan resumed by ${clientName}` : `Recurring plan paused by ${clientName}`,
        body: active
          ? `${clientName} resumed their recurring maintenance plan "${plan.title}".`
          : `${clientName} paused their recurring maintenance plan "${plan.title}".`,
        author: clientName,
      });
    } catch (feedErr) {}
  }

  // Notify contractor via alert email
  try {
    // Limit to 50 alert emails per day per account to avoid spam
    if (await checkRateLimit(admin, `portal-alert-email:${access.accountId}-day`, 50, 86400)) {
      const ownerEmail = await getAccountOwnerEmail(admin, access.accountId);
      if (ownerEmail) {
        await sendContractorAlertEmail({
          accountId: access.accountId,
          recipientEmail: ownerEmail,
          businessName,
          subject: active
            ? `Recurring plan resumed by ${clientName}: ${plan.title}`
            : `Recurring plan paused by ${clientName}: ${plan.title}`,
          heading: active ? 'Recurring Plan Resumed' : 'Recurring Plan Paused',
          bodyLines: [
            `${clientName} has ${active ? 'resumed' : 'paused'} their recurring maintenance plan "${plan.title}".`,
            ...(active
              ? ['Future service visits have been restored to your schedule.']
              : ['Future scheduled visits for this plan have been removed from your calendar.']),
            ...(client?.phone ? [`Customer phone: ${client.phone}`] : []),
            ...(client?.email ? [`Customer email: ${client.email}`] : []),
          ],
          ctaLabel: 'View Recurring Plans',
          ctaUrl: 'https://app.letsgetquoted.com/dashboard/recurring',
          tone: active ? 'info' : 'warning',
        });
      }
    }
  } catch (emailErr) {
    console.error('Failed to notify contractor of customer plan toggle:', emailErr);
  }

  revalidatePath(`/portal/view/${token}`);
}



export async function markPortalMessagesReadAction(token: string) {
  const admin = createAdminClient();
  const access = await resolvePortalAccess(admin, token);
  if (access) {
    try {
      await admin.from('client_portal_access').update({ last_read_at: new Date().toISOString() }).eq('account_id', access.accountId).eq('client_id', access.clientId);
    } catch {}
  }
}

export async function loadMorePortalMessagesAction(token: string, cursorDate: string) {
  const admin = createAdminClient();
  const access = await resolvePortalAccess(admin, token);
  if (!access) return [];

  const [{ data: client }, { data: account }] = await Promise.all([
    admin.from('clients').select('phone').eq('account_id', access.accountId).eq('id', access.clientId).maybeSingle(),
    admin.from('accounts').select('business_name').eq('id', access.accountId).maybeSingle()
  ]);

  const { data: jobsRows } = await admin.from('jobs').select('id').eq('account_id', access.accountId).eq('client_id', access.clientId);
  const jobIds = (jobsRows || []).map((j: any) => j.id);
  const clientPhone = client?.phone || null;
  const businessName = account?.business_name || 'Contractor';

  const [{ data: smsRows }, { data: feedRows }] = await Promise.all([
    clientPhone
      ? admin
          .from('sms_messages')
          .select('id, direction, body, media_urls, created_at')
          .eq('account_id', access.accountId)
          .eq('phone_number', clientPhone)
          .lt('created_at', cursorDate)
          .order('created_at', { ascending: false })
          .limit(15)
      : Promise.resolve({ data: [] }),
    jobIds.length
      ? admin
          .from('job_feed')
          .select('id, kind, body, author, created_at, visibility, job_id')
          .eq('account_id', access.accountId)
          .in('job_id', jobIds)
          .eq('visibility', 'public')
          .lt('created_at', cursorDate)
          .order('created_at', { ascending: false })
          .limit(15)
      : Promise.resolve({ data: [] }),
  ]);

  const messages: any[] = [];
  if (smsRows) {
    for (const r of smsRows) {
      messages.push({
        id: r.id,
        body: r.body as string,
        createdAt: r.created_at as string,
        direction: r.direction as 'inbound' | 'outbound',
        sender: r.direction === 'inbound' ? 'You' : businessName,
        mediaUrls: (r.media_urls as string[]) || [],
        jobId: null,
      });
    }
  }
  if (feedRows) {
    for (const r of feedRows) {
      messages.push({
        id: r.id,
        body: r.body as string,
        createdAt: r.created_at as string,
        direction: 'outbound' as const,
        sender: (r.author as string) || businessName,
        mediaUrls: [],
        jobId: r.job_id as string,
      });
    }
  }

  messages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return messages.slice(0, 15);
}
