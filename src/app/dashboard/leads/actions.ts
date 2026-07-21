'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import { createClientJobAccessToken, createJobFeedEvent } from '@/lib/job-feed';
import { formatJobQuoteSummary } from '@/lib/jobs';
import { clearLeadQuoteVisit, convertLeadToJob, createLead, getLead, scheduleLeadQuoteVisit, unconvertLeadFromJob, updateLeadDetails, updateLeadStatus, type LeadStatus } from '@/lib/leads';
import { uploadLeadPhoto } from '@/lib/lead-photo-storage';
import { normalizeUsPhone } from '@/lib/phone';
import { createAndSendScheduleRequest, createScheduleRequest, formatScheduleOption, type ScheduleOption } from '@/lib/scheduling';
import { recordSmsConsent, sendClientJobDashboardSms, sendLeadQuoteVisitOptionsSms, sendLeadQuoteVisitSms } from '@/lib/sms';
import { sendClientQuoteEmail } from '@/lib/email';

function optionalText(value: FormDataEntryValue | null): string | null {
  const text = (value ?? '').toString().trim();
  return text.length > 0 ? text : null;
}

function optionalAmount(value: FormDataEntryValue | null): number | null {
  const text = (value ?? '').toString().trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function requiredText(value: FormDataEntryValue | null, label: string): string {
  const text = (value ?? '').toString().trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function scheduleOptionsFromForm(formData: FormData): { hasInput: boolean; options: ScheduleOption[] } {
  const options: ScheduleOption[] = [1, 2, 3].map((index) => ({
    date: (formData.get(`quoteScheduleDate${index}`) ?? '').toString(),
    time: optionalText(formData.get(`quoteScheduleTime${index}`)),
  }));
  const hasInput = options.some((option) => option.date.trim() || option.time);
  return { hasInput, options };
}

function quoteVisitOptionsFromForm(formData: FormData): ScheduleOption[] {
  return [1, 2, 3]
    .map((index) => ({
      date: (formData.get(`quoteVisitOptionDate${index}`) ?? '').toString().trim(),
      time: optionalText(formData.get(`quoteVisitOptionTime${index}`)),
    }))
    .filter((option) => option.date)
    .slice(0, 3);
}

export async function createLeadAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const photoFiles = formData.getAll('photos').filter((item): item is File => item instanceof File && item.size > 0);
  const photoPaths: string[] = [];
  for (const file of photoFiles) {
    photoPaths.push(await uploadLeadPhoto(accountId, file));
  }

  await createLead(supabase, accountId, {
    source: 'manual',
    name: (formData.get('name') ?? '').toString().trim(),
    phone: optionalText(formData.get('phone')),
    email: optionalText(formData.get('email')),
    address: optionalText(formData.get('address')),
    projectType: optionalText(formData.get('projectType')),
    estimatedHours: optionalAmount(formData.get('estimatedHours')),
    message: optionalText(formData.get('message')),
    photoPaths,
  });

  revalidatePath('/dashboard/leads');
}

export async function updateLeadStatusAction(leadId: string, status: LeadStatus) {
  const { supabase, accountId } = await requireOwnerContext();
  await updateLeadStatus(supabase, accountId, leadId, status);
  revalidatePath(`/dashboard/leads/${leadId}`);
  revalidatePath('/dashboard/leads');
}

export async function updateLeadDetailsAction(leadId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  await updateLeadDetails(supabase, accountId, leadId, {
    name: requiredText(formData.get('name'), 'Client name'),
    phone: optionalText(formData.get('phone')),
    email: optionalText(formData.get('email')),
    address: optionalText(formData.get('address')),
    projectType: optionalText(formData.get('projectType')),
    estimatedHours: optionalAmount(formData.get('estimatedHours')),
    message: optionalText(formData.get('message')),
  });
  revalidatePath(`/dashboard/leads/${leadId}`);
  revalidatePath('/dashboard/leads');
}

export async function scheduleLeadQuoteVisitAction(leadId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const lead = await getLead(supabase, accountId, leadId);
  if (!lead) throw new Error('Lead not found.');

  const scheduledFor = requiredText(formData.get('quoteVisitDate'), 'Visit date');
  const scheduledTime = requiredText(formData.get('quoteVisitTime'), 'Visit time');
  const durationMinutes = Number(formData.get('quoteVisitDuration')) || 60;
  const normalizedPhone = normalizeUsPhone(lead.phone ?? '');
  let confirmationTextSentAt: string | null = null;

  if (formData.get('quoteVisitSmsConsent') === 'on') {
    if (!normalizedPhone) throw new Error('Add a valid client mobile number before sending a confirmation text.');
    const [{ data: account }, { data: site }] = await Promise.all([
      supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
      supabase.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
    ]);
    await recordSmsConsent(accountId, normalizedPhone, 'lead_quote_visit');
    await sendLeadQuoteVisitSms({
      phone: normalizedPhone,
      businessName: site?.company_name || account?.business_name || "Let's Get Quoted contractor",
      leadName: lead.name || 'there',
      address: lead.address,
      scheduledFor,
      scheduledTime,
    });
    confirmationTextSentAt = new Date().toISOString();
  }

  await scheduleLeadQuoteVisit(supabase, accountId, leadId, {
    scheduledFor,
    scheduledTime,
    durationMinutes: Math.min(240, Math.max(15, durationMinutes)),
    notes: optionalText(formData.get('quoteVisitNotes')),
    confirmationTextSentAt,
  });

  revalidatePath(`/dashboard/leads/${leadId}`);
  revalidatePath('/dashboard/leads');
}

export async function clearLeadQuoteVisitAction(leadId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  await clearLeadQuoteVisit(supabase, accountId, leadId);
  revalidatePath(`/dashboard/leads/${leadId}`);
  revalidatePath('/dashboard/leads');
}

export async function sendLeadQuoteVisitOptionsAction(leadId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const lead = await getLead(supabase, accountId, leadId);
  if (!lead) throw new Error('Lead not found.');

  const clientPhone = normalizeUsPhone(requiredText(formData.get('quoteVisitClientPhone'), 'Client mobile'));
  if (!clientPhone) throw new Error('Enter a valid client mobile number before sending quote visit options.');
  if (formData.get('quoteVisitOptionsSmsConsent') !== 'on') throw new Error('Confirm the client agreed to receive scheduling texts.');

  const options = quoteVisitOptionsFromForm(formData);
  if (options.length === 0) throw new Error('Add at least 1 quote visit option before texting the client.');

  const [{ data: account }, { data: site }] = await Promise.all([
    supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
  ]);

  await recordSmsConsent(accountId, clientPhone, 'lead_quote_visit_options');
  await sendLeadQuoteVisitOptionsSms({
    phone: clientPhone,
    businessName: site?.company_name || account?.business_name || "Let's Get Quoted contractor",
    leadName: lead.name || 'there',
    address: lead.address,
    options,
  });

  if (lead.status === 'new') await updateLeadStatus(supabase, accountId, leadId, 'contacted');
  revalidatePath(`/dashboard/leads/${leadId}`);
  revalidatePath('/dashboard/leads');
}

export async function convertLeadAction(leadId: string, formData: FormData) {
  const amount = Number(formData.get('quotedAmount'));
  if (!Number.isFinite(amount) || amount < 1) {
    throw new Error('Enter a quoted amount of at least $1 before sending the quote.');
  }
  const quotedAmount = amount;
  const estimatedHours = optionalAmount(formData.get('estimatedHours'));
  const sendClientText = formData.get('sendClientText') === 'on';
  const { supabase, accountId } = await requireOwnerContext();
  const lead = await getLead(supabase, accountId, leadId);
  if (!lead) throw new Error('Lead not found.');
  const clientPhone = sendClientText ? normalizeUsPhone(lead.phone ?? '') : null;
  const clientEmail = sendClientText ? (lead.email?.trim() || null) : null;

  const job = await convertLeadToJob(supabase, accountId, leadId, quotedAmount, estimatedHours);
  await createJobFeedEvent(supabase, accountId, job.id, {
    kind: 'job_created',
    title: `${job.ref} created`,
    body: formatJobQuoteSummary(job),
    visibility: 'client',
    sourceTable: 'jobs',
    sourceId: job.id,
  });
  const token = await createClientJobAccessToken(supabase, accountId, job.id, { clientPhone: job.client_phone, clientEmail: job.client_email });
  const quickBooking = scheduleOptionsFromForm(formData);

  // Prefer SMS, fall back to email, and if neither can reach the client, say so
  // plainly instead of redirecting as though it sent.
  const willText = Boolean(sendClientText && clientPhone);
  const willEmail = Boolean(sendClientText && !clientPhone && clientEmail);
  const willDeliver = willText || willEmail;

  let businessName = "Let's Get Quoted contractor";
  if (sendClientText) {
    const { data: account } = await supabase.from('accounts').select('business_name').eq('id', accountId).single();
    businessName = account?.business_name || businessName;
  }

  if (quickBooking.hasInput && willDeliver) {
    const { request } = await createScheduleRequest(supabase, accountId, job.id, { clientPhone: clientPhone ?? job.client_phone ?? null, options: quickBooking.options });
    const optionSummary = request.options.map((option, index) => `${index + 1}. ${formatScheduleOption(option)}`).join(' ');

    await createJobFeedEvent(supabase, accountId, job.id, {
      kind: 'job_scheduled',
      title: 'Start date options added to quote',
      body: `The client can choose a start date on their quote page: ${optionSummary}`,
      visibility: 'client',
      meta: { schedule_request_id: request.id, options: request.options },
    });
  }

  // Best-effort delivery: a provider failure here must not error-page the owner
  // after the job already exists, and we only claim "sent" when it truly sent.
  let delivery: 'sms' | 'email' | 'no_contact' | 'failed' | null = sendClientText ? 'no_contact' : null;
  if (clientPhone) {
    try {
      await recordSmsConsent(accountId, clientPhone, 'client_job_dashboard');
      await sendClientJobDashboardSms({
        phone: clientPhone,
        businessName,
        jobRef: job.ref,
        token,
        includesScheduleOptions: quickBooking.hasInput,
      });
      delivery = 'sms';
    } catch (err) {
      console.error(`Quote SMS failed for job ${job.id}:`, err);
      delivery = 'failed';
    }
  } else if (clientEmail) {
    try {
      const origin = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');
      await sendClientQuoteEmail({
        recipientEmail: clientEmail,
        businessName,
        clientName: job.client_name,
        jobRef: job.ref,
        quotedAmount,
        quoteUrl: `${origin}/client/jobs/${token}`,
        includesScheduleOptions: quickBooking.hasInput,
      });
      delivery = 'email';
    } catch (err) {
      console.error(`Quote email failed for job ${job.id}:`, err);
      delivery = 'failed';
    }
  }

  if (delivery === 'sms' || delivery === 'email') {
    await createJobFeedEvent(supabase, accountId, job.id, {
      kind: 'job_update',
      title: delivery === 'sms' ? 'Quote texted to client' : 'Quote emailed to client',
      body: delivery === 'sms'
        ? `The quote and sign-off link were texted to ${job.client_name}.`
        : `The quote and sign-off link were emailed to ${clientEmail}.`,
      visibility: 'client',
    });
  }

  if (quickBooking.hasInput && !sendClientText) {
    const clientPhone = normalizeUsPhone(job.client_phone ?? '');
    if (!clientPhone) throw new Error('Enter a valid client mobile number before sending quick booking options.');
    if (formData.get('quoteScheduleSmsConsent') !== 'on') throw new Error('Confirm the client agreed to receive scheduling texts.');

    const request = await createAndSendScheduleRequest(supabase, accountId, job.id, { clientPhone, options: quickBooking.options });
    const optionSummary = request.options.map((option, index) => `${index + 1}. ${formatScheduleOption(option)}`).join(' ');

    await createJobFeedEvent(supabase, accountId, job.id, {
      kind: 'job_scheduled',
      title: 'Quick booking options sent',
      body: `Three service options were texted with the initial quote: ${optionSummary}`,
      visibility: 'client',
      meta: { schedule_request_id: request.id, options: request.options },
    });
  }
  revalidatePath('/dashboard/leads');
  revalidatePath('/dashboard/jobs');
  const deliveryParam = delivery ? `&delivery=${delivery}` : '';
  redirect(`/dashboard/jobs/${job.id}?tab=feed&clientToken=${token}${deliveryParam}`);
}

export async function undoConvertLeadAction(leadId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  await unconvertLeadFromJob(supabase, accountId, leadId);
  revalidatePath(`/dashboard/leads/${leadId}`);
  revalidatePath('/dashboard/leads');
  revalidatePath('/dashboard/jobs');
}

