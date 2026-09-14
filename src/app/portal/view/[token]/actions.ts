'use server';

import { createAdminClient } from '@/lib/auth';
import { resolvePortalAccess } from '@/lib/client-portal';
import { findPortalMessageReceipt } from '@/lib/portal-message-requests';
import { submitPortalMessage } from '@/lib/client-portal-data';
import { createJobFeedEvent } from '@/lib/job-feed';
import { setRecurringPlanActive } from '@/lib/recurring';
import { checkRateLimit, checkRateLimitStrict } from '@/lib/rate-limit';
import { revalidatePath } from 'next/cache';
import { updateEquipmentOnPassport, addEquipmentToPassport } from '@/lib/property-passport-data';


export async function sendPortalMessageAction(
  token: string,
  formData: FormData,
): Promise<{ ok: boolean; message?: string; messageId?: string }> {
  const body = String(formData.get('message') ?? '').trim();
  const requestId = String(formData.get('requestId') ?? '');
  const jobId = (formData.get('jobId') as string | null) || null;

  if (!body) {
    return { ok: false, message: 'Please write a message before sending.' };
  }

  const admin = createAdminClient();
  const access = await resolvePortalAccess(admin, token);
  if (!access) {
    return { ok: false, message: 'Your link has expired. Please request a fresh one.' };
  }

  try {
    const saved=await findPortalMessageReceipt(admin,{accountId:access.accountId,clientId:access.clientId,requestId,body,jobId});
    if(saved) {
      const result=await submitPortalMessage(admin,{accountId:access.accountId,clientId:access.clientId,requestId,body,jobId});
      revalidatePath(`/portal/view/${token}`);return result;
    }
  } catch(error) { return {ok:false,message:error instanceof Error?error.message:'Could not check your message.'}; }

  // 10 new messages per hour per portal link; accepted retries do not consume quota.
  if (!(await checkRateLimit(admin, `portal-msg:${token}-hr`, 10, 3600))) {
    return { ok: false, message: 'You have sent too many messages recently. Please try again later.' };
  }

  const result = await submitPortalMessage(admin, {
    accountId: access.accountId,
    clientId: access.clientId,
    requestId,
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
        kind: 'customer_plan_change',
        title: active ? `Recurring plan resumed by ${clientName}: ${plan.title}` : `Recurring plan paused by ${clientName}: ${plan.title}`,
        body: `${clientName} has ${active ? 'resumed' : 'paused'} their recurring maintenance plan "${plan.title}".\n\n${active ? 'Future service visits have been restored to your schedule.' : 'Future scheduled visits for this plan have been removed from your calendar.'}${client?.phone ? `\nCustomer phone: ${client.phone}` : ''}${client?.email ? `\nCustomer email: ${client.email}` : ''}`,
        visibility: 'internal',
        author: clientName,
        meta: { owner_email_notice: 'v1' },
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
        kind: 'customer_plan_change',
        title: active ? `Recurring plan resumed by ${clientName}: ${plan.title}` : `Recurring plan paused by ${clientName}: ${plan.title}`,
        body: `${clientName} has ${active ? 'resumed' : 'paused'} their recurring maintenance plan "${plan.title}".\n\n${active ? 'Future service visits have been restored to your schedule.' : 'Future scheduled visits for this plan have been removed from your calendar.'}${client?.phone ? `\nCustomer phone: ${client.phone}` : ''}${client?.email ? `\nCustomer email: ${client.email}` : ''}`,
        author: clientName,
        meta: { owner_email_notice: 'v1' },
      });
    } catch (feedErr) {}
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

  const [{data:portalRows,error:portalError},{ data: smsRows }, { data: feedRows }] = await Promise.all([
    admin.from('portal_message_requests').select('id,body,created_at,job_id').eq('account_id',access.accountId).eq('client_id',access.clientId).lt('created_at',cursorDate).order('created_at',{ascending:false}).limit(15),
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

  if(portalError) throw new Error('Could not load portal message history');
  const messages: any[] = (portalRows ?? []).map(row=>({id:row.id,body:row.body,createdAt:row.created_at,jobId:row.job_id,direction:'inbound',sender:'You',channel:'portal_note',mediaUrls:[]}));
  if (smsRows) {
    for (const r of smsRows) {
      if(messages.some(message=>message.id===r.id)) continue;
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
      if(messages.some(message=>message.id===r.id)) continue;
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

export async function setupPortalPlanAutopayAction(token: string, planId: string) {
  console.log('Setup autopay for plan', planId);
}
export async function payPortalOutstandingAction(token: string) {
  console.log('Pay all open invoices for token', token);
}

export async function requestPlanRescheduleAction(token: string, planId: string, details: any) {
  console.log('Reschedule plan', planId, details);
}


export async function updatePassportEquipmentAction(
  token: string,
  equipmentId: string,
  fields: { name?: string; brand?: string; modelNumber?: string; serialNumber?: string; notes?: string },
): Promise<{ ok: boolean; message?: string }> {
  'use server';
  const access = await resolvePortalAccess(createAdminClient(), token);
  if (!access) return { ok: false, message: 'Invalid or expired link.' };
  const admin = createAdminClient();
  const result = await updateEquipmentOnPassport(admin, access.accountId, equipmentId, fields);
  if (result.ok) revalidatePath(`/portal/view/${token}`);
  return result;
}

export async function addPassportEquipmentAction(
  token: string,
  passportId: string,
  fields: { name: string; brand?: string; modelNumber?: string; serialNumber?: string; category?: string; notes?: string },
): Promise<{ ok: boolean; message?: string }> {
  'use server';
  const access = await resolvePortalAccess(createAdminClient(), token);
  if (!access) return { ok: false, message: 'Invalid or expired link.' };
  const admin = createAdminClient();
  try {
    await addEquipmentToPassport(admin, access.accountId, passportId, {
      category: (fields.category as any) || 'other',
      name: fields.name,
      brand: fields.brand || '',
      modelNumber: fields.modelNumber || '',
      serialNumber: fields.serialNumber || '',
      installedOn: new Date().toISOString().slice(0, 10),
      notes: fields.notes || '',
    });
    revalidatePath(`/portal/view/${token}`);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Could not add equipment.' };
  }
}
