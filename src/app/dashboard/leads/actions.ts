'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import { createClientJobAccessToken, createJobFeedEvent, createPaymentFeedEvent } from '@/lib/job-feed';
import { addInvoiceItem, createInvoice, listInvoices, selectPrimaryInvoice } from '@/lib/invoices';
import { computeQuoteTotal, formatJobQuoteSummary, parseQuoteItems, saveQuoteItems, type QuoteItem } from '@/lib/jobs';
import { createDepositRequest } from '@/lib/payments';
import { createPaymentPlan } from '@/lib/payment-plans';
import { clearLeadQuoteVisit, convertLeadToJob, createLead, getLead, getLeadTriage, LEAD_DECLINE_REASONS, LEAD_LAYOUT_COOKIE, scheduleLeadQuoteVisit, unconvertLeadFromJob, updateLeadDetails, updateLeadStatus, type LeadStatus, type LeadTriage } from '@/lib/leads';
import { uploadLeadPhoto } from '@/lib/lead-photo-storage';
import { normalizeUsPhone } from '@/lib/phone';
import { createAndSendScheduleRequest, createScheduleRequest, formatScheduleOption, type ScheduleOption } from '@/lib/scheduling';
import { isPhoneOptedOut, recordSmsConsent, sendClientJobDashboardSms, sendLeadDeclineSms, sendLeadQuoteVisitOptionsSms, sendLeadQuoteVisitSms } from '@/lib/sms';
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
      accountId,
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
    accountId,
  });

  if (lead.status === 'new') await updateLeadStatus(supabase, accountId, leadId, 'contacted');
  revalidatePath(`/dashboard/leads/${leadId}`);
  revalidatePath('/dashboard/leads');
}

export async function convertLeadAction(leadId: string, formData: FormData) {
  // The lead form sends an itemized quote (base line items + optional upsells)
  // as JSON. Fall back to the legacy single quotedAmount if none were provided.
  const rawItems = formData.get('quoteItems');
  let quoteItems: QuoteItem[] = [];
  if (typeof rawItems === 'string' && rawItems.trim()) {
    try {
      quoteItems = parseQuoteItems(JSON.parse(rawItems));
    } catch {
      quoteItems = [];
    }
  }
  const amount = quoteItems.length ? computeQuoteTotal(quoteItems) : Number(formData.get('quotedAmount'));
  if (!Number.isFinite(amount) || amount < 1) {
    throw new Error('Add at least one line item totaling $1 or more before sending the quote.');
  }
  const quotedAmount = amount;
  const estimatedHours = optionalAmount(formData.get('estimatedHours'));
  const showHoursToClient = formData.get('showHoursToClient') === 'on';
  const sendClientText = formData.get('sendClientText') === 'on';

  // Payment terms: 'full' (no deposit), 'deposit' (deposit + remaining balance),
  // or 'plan' (deposit + fixed installments that split the SAME total). Legacy
  // forms that only send requireDeposit map to 'deposit'.
  const paymentTerms = ((formData.get('paymentTerms') as string) || (formData.get('requireDeposit') === 'on' ? 'deposit' : 'full')) as 'full' | 'deposit' | 'plan';

  // 'deposit' terms — "Collect now": we create the payment request so it's ready
  // to pay; the timing (before scheduling / before work) is recorded in the label
  // and enforced later.
  const depositUnit = formData.get('depositUnit') === 'fixed' ? 'fixed' : 'percent';
  const depositTiming = formData.get('depositTiming') === 'before_work' ? 'before_work' : 'before_schedule';
  const depositValueRaw = Number(formData.get('depositValue'));
  let depositAmount = 0;
  if (paymentTerms === 'deposit' && Number.isFinite(depositValueRaw) && depositValueRaw > 0) {
    depositAmount = depositUnit === 'percent'
      ? Math.round(quotedAmount * Math.min(100, depositValueRaw)) / 100
      : depositValueRaw;
    depositAmount = Math.round(Math.min(depositAmount, quotedAmount) * 100) / 100;
  }
  const { supabase, accountId } = await requireOwnerContext();
  const lead = await getLead(supabase, accountId, leadId);
  if (!lead) throw new Error('Lead not found.');

  // Quotes collect payment through Stripe — never send one before onboarding is
  // finished, or the client would get a quote they can't pay.
  const { data: stripeAccount } = await supabase.from('accounts').select('stripe_connect_id, connect_onboarded').eq('id', accountId).single();
  if (!stripeAccount?.stripe_connect_id || !stripeAccount.connect_onboarded) {
    throw new Error('Connect Stripe before sending a quote so you can collect payment.');
  }

  const clientPhone = sendClientText ? normalizeUsPhone(lead.phone ?? '') : null;
  const clientEmail = sendClientText ? (lead.email?.trim() || null) : null;

  const job = await convertLeadToJob(supabase, accountId, leadId, quotedAmount, estimatedHours);
  // Persist the itemized quote (and let it recompute quoted_amount) now that the
  // job exists — convertLeadToJob/createJob can't carry items.
  if (quoteItems.length) {
    await saveQuoteItems(supabase, accountId, job.id, quoteItems);
  }

  // Payment Plan: create the plan header + its deposit request. The deposit is a
  // normal Stripe Connect payment (so scheduling gates on it); paying it saves
  // the card that drives the installments, which are scheduled once the webhook
  // confirms the deposit paid. Splits the SAME quote total — never more.
  if (paymentTerms === 'plan') {
    const planDepositPercent = Math.min(99, Math.max(1, Math.round(Number(formData.get('planDepositPercent')) || 50)));
    const planInstallments = Math.min(24, Math.max(1, Math.floor(Number(formData.get('planInstallments')) || 4)));
    const planFrequency = ((): 'weekly' | 'biweekly' | 'monthly' => {
      const raw = formData.get('planFrequency');
      return raw === 'weekly' || raw === 'biweekly' ? raw : 'monthly';
    })();
    const rawFirst = (formData.get('planFirstDate') ?? '').toString();
    const firstInstallmentDate = /^\d{4}-\d{2}-\d{2}$/.test(rawFirst)
      ? rawFirst
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const invoices = await listInvoices(supabase, accountId, job.id);
    const invoice = selectPrimaryInvoice(invoices) ?? (await createInvoice(supabase, accountId, job.id, 'draft'));
    if (Number(invoice.total) <= 0 && quotedAmount > 0) {
      await addInvoiceItem(supabase, accountId, invoice.id, { description: 'Quoted job total', amount: quotedAmount });
    }
    const { depositPaymentId } = await createPaymentPlan(supabase, accountId, job.id, {
      totalCents: Math.round(quotedAmount * 100),
      depositPercent: planDepositPercent,
      installmentCount: planInstallments,
      frequency: planFrequency,
      firstInstallmentDate,
      clientPhone,
      smsConsent: Boolean(sendClientText && clientPhone),
      invoiceId: invoice.id,
    });
    await createPaymentFeedEvent(supabase, depositPaymentId, 'payment_requested');
    // A plan deposit always gates scheduling until it's paid.
    await supabase.from('jobs').update({ deposit_gate: 'before_schedule' }).eq('account_id', accountId).eq('id', job.id);
  } else if (depositAmount > 0) {
    // Create the deposit request now so the client can pay it the moment they open
    // the quote. Reuses the same invoice + payment path as the job-page deposit UI.
    const invoices = await listInvoices(supabase, accountId, job.id);
    const invoice = selectPrimaryInvoice(invoices) ?? (await createInvoice(supabase, accountId, job.id, 'draft'));
    if (Number(invoice.total) <= 0 && quotedAmount > 0) {
      await addInvoiceItem(supabase, accountId, invoice.id, { description: 'Quoted job total', amount: quotedAmount });
    }
    const timingLabel = depositTiming === 'before_work' ? 'due before work starts' : 'due before scheduling';
    const depositLabel = depositUnit === 'percent' ? `${depositValueRaw}% deposit — ${timingLabel}` : `Deposit — ${timingLabel}`;
    const depositPayment = await createDepositRequest(supabase, accountId, job.id, {
      label: depositLabel,
      amount: depositAmount,
      kind: 'deposit',
      invoiceId: invoice.id,
      homeownerPhone: clientPhone,
      smsConsent: Boolean(sendClientText && clientPhone),
    });
    await createPaymentFeedEvent(supabase, depositPayment.id, 'payment_requested');
    // Record the gate on the job so scheduling can enforce a before-schedule deposit.
    await supabase.from('jobs').update({ deposit_gate: depositTiming }).eq('account_id', accountId).eq('id', job.id);
  }

  await createJobFeedEvent(supabase, accountId, job.id, {
    kind: 'job_created',
    title: `${job.ref} created`,
    body: formatJobQuoteSummary(job, { includeHours: showHoursToClient }),
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
        accountId,
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

// Merge a patch into the lead's triage record (creating one if absent).
async function patchLeadTriage(leadId: string, patch: Partial<LeadTriage>) {
  const { supabase, accountId } = await requireOwnerContext();
  const lead = await getLead(supabase, accountId, leadId);
  if (!lead) throw new Error('Lead not found.');
  const triage = { ...getLeadTriage(lead), ...patch };
  const { error } = await supabase
    .from('leads')
    .update({ triage, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', leadId);
  if (error) throw error;
  revalidatePath(`/dashboard/leads/${leadId}`);
  revalidatePath('/dashboard/leads');
}

// Remember the user's chosen Lead Details action layout so every lead opens
// in the same one. Stored in a year-long cookie (per browser) rather than a
// DB column — no migration, and it survives sessions.
export async function setLeadLayoutAction(layout: 'guided' | 'primary') {
  await requireOwnerContext();
  cookies().set(LEAD_LAYOUT_COOKIE, layout === 'primary' ? 'primary' : 'guided', {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
}

// Log a touchpoint with the homeowner (spoke / texted / left VM…) plus an
// optional note. Appends to triage.contactLog and, for a brand-new lead,
// advances it to 'contacted' so logging first contact still moves the stage.
export async function logLeadContactAction(leadId: string, label: string, note?: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const lead = await getLead(supabase, accountId, leadId);
  if (!lead) throw new Error('Lead not found.');

  const cleanLabel = label.trim();
  if (!cleanLabel) throw new Error('Pick what happened.');
  const cleanNote = note?.trim();

  const triage = getLeadTriage(lead);
  const entry = { at: new Date().toISOString(), label: cleanLabel, ...(cleanNote ? { note: cleanNote } : {}) };
  const contactLog = [...(triage.contactLog ?? []), entry];
  const nextStatus: LeadStatus = lead.status === 'new' ? 'contacted' : lead.status;

  const { error } = await supabase
    .from('leads')
    .update({ triage: { ...triage, contactLog }, status: nextStatus, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', leadId);
  if (error) throw error;
  revalidatePath(`/dashboard/leads/${leadId}`);
  revalidatePath('/dashboard/leads');
}

export async function snoozeLeadAction(leadId: string, days: number) {
  const clamped = Math.min(30, Math.max(1, Math.round(days) || 3));
  await patchLeadTriage(leadId, { snoozedUntil: new Date(Date.now() + clamped * 24 * 60 * 60 * 1000).toISOString() });
}

export async function unsnoozeLeadAction(leadId: string) {
  await patchLeadTriage(leadId, { snoozedUntil: null });
}

export async function archiveLeadAction(leadId: string, archived: boolean) {
  await patchLeadTriage(leadId, { archived });
}

// Decline: mark the lead lost + archived. When notify is true and the lead
// left a phone that hasn't opted out, text a polite templated close-out so the
// homeowner isn't ghosted. notify is chosen by the owner in the decline popup;
// SMS failure never blocks the decline.
export async function declineLeadAction(leadId: string, reasonKey: string, notify: boolean = true) {
  const { supabase, accountId } = await requireOwnerContext();
  const lead = await getLead(supabase, accountId, leadId);
  if (!lead) throw new Error('Lead not found.');
  const reason = LEAD_DECLINE_REASONS[reasonKey];
  if (!reason) throw new Error('Pick a decline reason.');

  let texted = false;
  const clientPhone = normalizeUsPhone(lead.phone ?? '');
  if (notify && clientPhone && !(await isPhoneOptedOut(accountId, clientPhone))) {
    try {
      const [{ data: account }, { data: site }] = await Promise.all([
        supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
        supabase.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
      ]);
      await recordSmsConsent(accountId, clientPhone, 'lead_decline');
      await sendLeadDeclineSms({
        phone: clientPhone,
        businessName: site?.company_name || account?.business_name || "Let's Get Quoted contractor",
        leadName: lead.name || 'there',
        reason,
        accountId,
      });
      texted = true;
    } catch (error) {
      console.error(`Decline SMS failed for lead ${leadId}:`, error);
    }
  }

  const triage = { ...getLeadTriage(lead), archived: true, declinedReason: reasonKey };
  const { error } = await supabase
    .from('leads')
    .update({ status: 'lost', triage, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', leadId);
  if (error) throw error;
  revalidatePath(`/dashboard/leads/${leadId}`);
  revalidatePath('/dashboard/leads');
  return { texted };
}

// Block this lead's phone + email from creating future website leads, and
// archive the lead. Blocked submissions are silently dropped at intake.
export async function blockLeadContactAction(leadId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const lead = await getLead(supabase, accountId, leadId);
  if (!lead) throw new Error('Lead not found.');
  const phone = normalizeUsPhone(lead.phone ?? '');
  const email = lead.email?.trim().toLowerCase() || null;
  if (!phone && !email) throw new Error('This lead has no phone or email to block.');

  const { error } = await supabase.from('lead_blocklist').insert({
    account_id: accountId,
    phone: phone || null,
    email,
    reason: `Blocked from lead ${leadId}`,
  });
  if (error) throw error;

  const triage = { ...getLeadTriage(lead), archived: true };
  await supabase
    .from('leads')
    .update({ status: 'lost', triage, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', leadId);
  revalidatePath(`/dashboard/leads/${leadId}`);
  revalidatePath('/dashboard/leads');
}

export async function undoConvertLeadAction(leadId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  await unconvertLeadFromJob(supabase, accountId, leadId);
  revalidatePath(`/dashboard/leads/${leadId}`);
  revalidatePath('/dashboard/leads');
  revalidatePath('/dashboard/jobs');
}

