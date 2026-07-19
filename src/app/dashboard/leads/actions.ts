'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import { createClientJobAccessToken, createJobFeedEvent } from '@/lib/job-feed';
import { formatJobQuoteSummary } from '@/lib/jobs';
import { convertLeadToJob, createLead, getLead, scheduleLeadQuoteVisit, updateLeadDetails, updateLeadStatus, type LeadStatus } from '@/lib/leads';
import { uploadLeadPhoto } from '@/lib/lead-photo-storage';
import { normalizeUsPhone } from '@/lib/phone';
import { createAndSendScheduleRequest, formatScheduleOption, type ScheduleOption } from '@/lib/scheduling';
import { recordSmsConsent, sendLeadQuoteVisitSms } from '@/lib/sms';

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

export async function convertLeadAction(leadId: string, formData: FormData) {
  const amount = Number(formData.get('quotedAmount'));
  const quotedAmount = Number.isFinite(amount) && amount >= 0 ? amount : 0;
  const estimatedHours = optionalAmount(formData.get('estimatedHours'));
  const { supabase, accountId } = await requireOwnerContext();
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
  if (quickBooking.hasInput) {
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
  redirect(`/dashboard/jobs/${job.id}?tab=feed&clientToken=${token}`);
}
