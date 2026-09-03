'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient, requireOfficeContext, requireOwnerContext } from '@/lib/auth';
import { BUSINESS_NAME_FALLBACK, loadBusinessName } from '@/lib/business-name';
import { applyQuoteAcceptance, createClientJobAccessToken, createJobFeedEvent, createPaymentFeedEvent } from '@/lib/job-feed';
import { addInvoiceItem, createInvoice, listInvoices, selectPrimaryInvoice } from '@/lib/invoices';
import { computeQuoteTotal, formatJobQuoteSummary, parseQuoteItems, saveQuoteItems, type QuoteItem } from '@/lib/jobs';
import { createDepositRequest } from '@/lib/payments';
import { createPaymentPlan } from '@/lib/payment-plans';
import { clearLeadQuoteVisit, convertLeadToJob, createLead, getLead, getLeadTriage, LEAD_DECLINE_REASONS, LEAD_LAYOUT_COOKIE, LEADS_VIEW_COOKIE, normalizeLeadLostAfterDays, normalizeLeadsView, scheduleLeadQuoteVisit, unconvertLeadFromJob, updateLeadDetails, updateLeadStatus, type LeadQuoteDraft, type LeadsView, type LeadStatus, type LeadTriage } from '@/lib/leads';
import { syncLeadWonConversion, triggerWonLeadOfflineConversion } from '@/lib/google-ads-conversion-outbox';
import { normalizeClientChannelPreference, resolveClientChannel, smsFailureFallback } from '@/lib/client-channel';
import { deleteLeadPhotos, uploadLeadPhoto } from '@/lib/lead-photo-storage';
import { normalizeUsPhone } from '@/lib/phone';
import { createAndSendScheduleRequest, createScheduleRequest, formatScheduleOption, type ScheduleOption } from '@/lib/scheduling';
import { isPhoneOptedOut, recordSmsConsent, sendClientJobDashboardSms, sendLeadDeclineSms, sendLeadQuoteVisitOptionsSms, sendLeadQuoteVisitSms } from '@/lib/sms';
import { sendClientQuoteEmail, sendQuoteSentConfirmationEmail } from '@/lib/email';
import { wantsConfirmation } from '@/lib/confirmation-prefs';
import { GoogleLsaApiError, buildGoogleLsaFeedbackBody, provideGoogleLsaFeedback } from '@/lib/google-lsa/api';
import { activeGoogleLsaConnection } from '@/lib/google-lsa/connection';
import type { GoogleLsaFeedback } from '@/lib/google-lsa/types';
import { softDeleteEntity } from '@/lib/recoverable-deletions';

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

/**
 * Log a lead that came in by phone, in person, or referral.
 *
 * ENDS ON THE LEAD, not back on the form. This discarded the row it created and
 * returned to a page where the only thing that changed was a count — the form
 * still open, still holding every word the owner had typed, with no statement
 * that anything had been saved. Re-pressing it is the obvious next move and it
 * makes a duplicate.
 *
 * Landing on the new lead is the receipt. It is the record itself, which is
 * stronger than a toast: the name, the number and the notes are on screen, and
 * the next step ("book the estimate") is the page you arrived at. The form is
 * reset by virtue of being gone.
 */
export async function createLeadAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const photoFiles = formData.getAll('photos').filter((item): item is File => item instanceof File && item.size > 0);
  const photoPaths: string[] = [];
  for (const file of photoFiles) {
    photoPaths.push(await uploadLeadPhoto(accountId, file, 'workspace'));
  }

  const lead = await createLead(supabase, accountId, {
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
  // Outside any try/catch above it — redirect() signals by throwing.
  redirect(`/dashboard/leads/${lead.id}?added=1`);
}

/**
 * Move a lead along the pipeline.
 *
 * WON IS NOT JUST A LEAD STATUS. This wrote one row — the lead — and stopped,
 * which is why marking a lead won left its job reading "Awaiting approval". That
 * looked like a stale render, but nothing had been written: the job was still at
 * the quote stage and would stay there until some unrelated event moved it.
 *
 * "Mark won" IS the record of a verbal acceptance — somebody rang up and said
 * yes — so it now means what every other acceptance path means, through the one
 * function that defines it. The job leaves the quote stage, the feed records the
 * approval, and the contractor's conversion rate counts it.
 *
 * Only forwards. Marking a lead won never drags an in-progress or finished job
 * anywhere, and the other statuses do not touch the job at all: a lead moved
 * back to 'contacted' by mistake must not un-approve work already underway.
 */
export async function updateLeadStatusAction(leadId: string, status: LeadStatus) {
  /**
   * THE GUARD FOLLOWS THE STATUS, because the blast radius does.
   *
   * Every status but `won` is one UPDATE on `leads` through the session
   * client, which office_can() governs on its own account -- ordinary work
   * for whoever is answering the phone. `won` is different in kind: the
   * branch below hands the SERVICE ROLE to applyQuoteAcceptance, which writes
   * job_feed and moves the job. RLS covers three tables and job_feed is not
   * one of them, so nothing but this line would stop it.
   *
   * An office user passing 'won' therefore meets requireOwnerContext and is
   * turned away, which is the failure direction to have.
   */
  const { supabase, accountId } = status === 'won'
    ? await requireOwnerContext()
    : await requireOfficeContext('leads.read', 'leads.write');
  const lead = await getLead(supabase, accountId, leadId);
  await updateLeadStatus(supabase, accountId, leadId, status);

  const jobId = lead?.converted_job as string | null | undefined;
  if (status === 'won' && lead) {
    const triage = getLeadTriage(lead);
    const attr = triage?.attribution;
    const isGoogleClick = attr?.clickId && (attr.clickIdType === 'gclid' || attr.clickIdType === 'gbraid' || attr.clickIdType === 'wbraid');

    if (isGoogleClick || lead.email || lead.phone) {
      const wonValue = triage?.estimate?.max || 0;
      try {
        await triggerWonLeadOfflineConversion(createAdminClient(), accountId, lead, wonValue);
      } catch (err) {
        console.warn('Offline conversion sync on mark won logged warning:', err);
      }
    }
  }

  if (status === 'won' && jobId) {
    // Best-effort: the lead move is what the owner pressed, and it must not be
    // undone because a downstream write failed. A failure here leaves exactly
    // the state that used to be the norm, and the next acceptance completes it.
    try {
      await applyQuoteAcceptance(createAdminClient(), accountId, jobId, { source: 'owner_verbal' });
    } catch (error) {
      console.error(`Quote acceptance from Mark won failed for job ${jobId}:`, error instanceof Error ? error.message : error);
    }
    revalidatePath(`/dashboard/jobs/${jobId}`);
    revalidatePath('/dashboard/jobs');
  }

  revalidatePath(`/dashboard/leads/${leadId}`);
  revalidatePath('/dashboard/leads');
}

// Reopen a lost/declined lead: set it back to 'contacted' AND clear the
// set-aside flags (archived / snoozed / declined). Without clearing archived, a
// declined lead (which decline marks archived) would drop into "Set aside"
// instead of returning to the active board — so it looks lost.
export async function reopenLeadAction(leadId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const lead = await getLead(supabase, accountId, leadId);
  if (!lead) throw new Error('Lead not found.');
  const triage = { ...getLeadTriage(lead), archived: false, snoozedUntil: null, declinedReason: null };
  const { error } = await supabase
    .from('leads')
    .update({ status: 'contacted', triage, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', leadId);
  if (error) throw error;
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

export async function updateLeadAddressAction(leadId: string, address: string | null) {
  const { supabase, accountId } = await requireOwnerContext();
  const normalizedAddress = address ? address.trim() || null : null;
  const { error } = await supabase
    .from('leads')
    .update({ address: normalizedAddress, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', leadId);

  if (error) throw error;
  revalidatePath(`/dashboard/leads/${leadId}`);
  revalidatePath('/dashboard/leads');
}

export async function updateLeadContactAction(leadId: string, phone: string | null, email: string | null) {
  const { supabase, accountId } = await requireOwnerContext();
  const normalizedPhone = phone ? phone.trim() || null : null;
  const normalizedEmail = email ? email.trim().toLowerCase() || null : null;
  const { error } = await supabase
    .from('leads')
    .update({
      phone: normalizedPhone,
      email: normalizedEmail,
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId)
    .eq('id', leadId);

  if (error) throw error;
  revalidatePath(`/dashboard/leads/${leadId}`);
  revalidatePath('/dashboard/leads');
}

export async function updateLeadNameAction(leadId: string, name: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error('Lead name cannot be blank.');
  const { error } = await supabase
    .from('leads')
    .update({
      name: normalizedName,
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId)
    .eq('id', leadId);

  if (error) throw error;
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

  /**
   * WHERE THE VAN IS GOING, confirmed before the visit exists.
   *
   * This action used to book a site visit without ever consulting an address,
   * so a lead whose form was abandoned halfway got a confirmed appointment at
   * "Not provided" — and the confirmation text that could go with it named the
   * same nothing. The review step (see BookingReview) asks; this saves the
   * answer back to the lead, because a booking is the moment somebody finally
   * has it and a separate edit form is how it stays blank.
   *
   * Falls back to what the lead already has rather than refusing: every caller
   * before the review step existed sent no address field at all, and a booking
   * for a lead that has one on file is not the failure this is guarding.
   */
  const submittedAddress = optionalText(formData.get('quoteVisitAddress'));
  const visitAddress = submittedAddress ?? lead.address ?? null;
  if (!visitAddress) throw new Error('Add the project address before booking the visit.');
  if (submittedAddress && submittedAddress !== lead.address) {
    // One column, deliberately. updateLeadDetails writes the WHOLE record from
    // its input and nulls anything absent — calling it with a name and an
    // address would silently wipe the phone, email, project type, hours and
    // message off a lead in the middle of booking a visit to it.
    const { error } = await supabase
      .from('leads')
      .update({ address: submittedAddress, updated_at: new Date().toISOString() })
      .eq('account_id', accountId)
      .eq('id', leadId);
    if (error) throw error;
  }

  if (formData.get('quoteVisitSmsConsent') === 'on') {
    if (!normalizedPhone) throw new Error('Add a valid client mobile number before sending a confirmation text.');
    const businessName = await loadBusinessName(supabase, accountId);
    await recordSmsConsent(accountId, normalizedPhone, 'lead_quote_visit');
    await sendLeadQuoteVisitSms({
      phone: normalizedPhone,
      businessName,
      leadName: lead.name || 'there',
      address: visitAddress,
      scheduledFor,
      scheduledTime,
      accountId,
      idempotencyKey: `lead-quote-visit:${leadId}:${scheduledFor}:${scheduledTime}`,
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

  const businessName = await loadBusinessName(supabase, accountId);

  await recordSmsConsent(accountId, clientPhone, 'lead_quote_visit_options');
  await sendLeadQuoteVisitOptionsSms({
    phone: clientPhone,
    businessName,
    leadName: lead.name || 'there',
    address: lead.address,
    options,
    accountId,
    idempotencyKey: `lead-quote-options:${leadId}:${options.map((option) => `${option.date}.${option.time ?? 'any'}`).join('/')}`,
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
  // Recurring plans are deliberately outside the one-off total (they bill on
  // their own cadence), which meant a quote made ONLY of a plan — "$99/mo
  // maintenance, no upfront work" — computed to $0 and was rejected as empty.
  // A plan is a real thing to quote, so it satisfies the "something to bill for"
  // check on its own; the job's one-off amount is genuinely $0 in that case.
  const recurringTotal = quoteItems.reduce(
    (sum, item) => (item.kind === 'subscription' ? sum + (Number(item.amount) || 0) : sum),
    0,
  );
  if (!Number.isFinite(amount) || (amount < 1 && recurringTotal < 1)) {
    throw new Error('Add at least one line item or recurring plan worth $1 or more before sending the quote.');
  }
  const quotedAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const estimatedHours = optionalAmount(formData.get('estimatedHours'));
  const showHoursToClient = formData.get('showHoursToClient') === 'on';
  const sendClientText = formData.get('sendClientText') === 'on';
  // What the owner chose, as a stored preference rather than a per-request
  // whim. The fallback keeps older forms (and anything posting this action
  // directly) working: a ticked box has always meant "reach them however you
  // can", an unticked one "don't".
  const rawChannel = formData.get('messageChannel');
  const messageChannel = rawChannel
    ? normalizeClientChannelPreference(rawChannel.toString())
    : (sendClientText ? 'auto' : 'off');

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

  // ONE DECISION, MADE ONCE, SHOWN BEFORE IT IS MADE.
  //
  // The lead page renders this exact resolution next to the checkbox, so the
  // sentence the owner read is the send that happens. It used to be three
  // booleans here and a hardcoded paragraph there, and the paragraph was wrong
  // whenever the box was unticked.
  //
  // kind: 'requested' — this is the quote they asked for. A STOP reply moves it
  // to email rather than cancelling it; see ClientMessageKind.
  const leadPhone = normalizeUsPhone(lead.phone ?? '');
  const leadEmail = lead.email?.trim() || null;
  const optedOut = leadPhone ? await isPhoneOptedOut(accountId, leadPhone) : false;
  const route = resolveClientChannel({
    phone: leadPhone,
    email: leadEmail,
    preference: messageChannel,
    optedOut,
    kind: 'requested',
  });
  const clientPhone = route.channel === 'sms' ? leadPhone : null;
  const clientEmail = route.channel === 'email' ? leadEmail : null;

  /* Stored on the lead before the job exists, so convertLeadToJob can hand the
     channel over — and so both survive even if everything after this throws.

     THE DRAFT IS WRITTEN HERE AND NOWHERE ELSE, because this is the only place
     the form's own fields exist. The line items and hours end up on the job and
     can be read back from it; the payment terms, the deposit percentage, the
     installment schedule and the show-hours choice are turned into payment rows
     and never stored as the answers the owner gave. Undoing a quote used to
     lose all of them. Unconditional — unlike the channel write above, a draft
     that matches the last one still has to be re-stamped, because what changed
     may be the quote rather than the preference. */
  const quoteDraft: LeadQuoteDraft = {
    items: quoteItems,
    estimatedHours: estimatedHours ?? null,
    showHoursToClient,
    paymentTerms,
    depositValue: Number.isFinite(depositValueRaw) && depositValueRaw > 0 ? depositValueRaw : null,
    depositUnit,
    depositTiming,
    planDepositPercent: optionalAmount(formData.get('planDepositPercent')) ?? null,
    planInstallments: optionalAmount(formData.get('planInstallments')) ?? null,
    planFrequency: ((): 'weekly' | 'biweekly' | 'monthly' => {
      const raw = formData.get('planFrequency');
      return raw === 'weekly' || raw === 'biweekly' ? raw : 'monthly';
    })(),
    planFirstDate: /^\d{4}-\d{2}-\d{2}$/.test((formData.get('planFirstDate') ?? '').toString())
      ? (formData.get('planFirstDate') ?? '').toString()
      : null,
    planAllowPayInFull: formData.get('planAllowPayInFull') !== null,
    sentAt: new Date().toISOString(),
  };
  const nextTriage = { ...getLeadTriage(lead), messageChannel, quoteDraft };
  await supabase
    .from('leads')
    .update({ triage: nextTriage, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', leadId);
  lead.triage = nextTriage;

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
      smsConsent: Boolean(clientPhone),
      invoiceId: invoice.id,
      // Ticked by default in the form. An unchecked box posts nothing at all,
      // so absence has to mean "off" — which is why this reads the value rather
      // than defaulting a missing key to true.
      allowPayInFull: formData.get('planAllowPayInFull') === 'on',
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
      smsConsent: Boolean(clientPhone),
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

  // Already decided, above, by the same call the owner saw rendered. If nothing
  // can reach the client we say so plainly rather than redirecting as though it
  // sent — see QuoteDeliveryBanner.
  const willDeliver = route.channel !== 'none';

  let businessName = BUSINESS_NAME_FALLBACK;
  if (willDeliver) {
    businessName = await loadBusinessName(supabase, accountId);
  }

  // THE DATES GO ON THE QUOTE PAGE EITHER WAY.
  //
  // This was gated on willDeliver, so an owner who could not reach the client
  // automatically — no mobile, no email, or a client they had switched off — had
  // the three start dates they had just picked silently thrown away, on a page
  // whose whole purpose is a link they are about to hand over by other means.
  // Recorded regardless now; the options are waiting on the client's page for
  // whenever the link gets there.
  if (quickBooking.hasInput) {
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
  //
  // The resting value is the ROUTE'S OWN REASON, not a flat "no_contact". There
  // are now five ways for a quote not to go out and the banner used to give one
  // explanation for all of them — telling an owner whose client is set to
  // email-only, with a mobile on file, that "this lead has no mobile number or
  // email", which sends them looking for a missing detail that is not missing.
  let delivery: string | null = willDeliver ? 'no_contact' : route.reason;
  /** Whose address it landed at, for the banner and the feed row. */
  let emailedTo: string | null = null;

  const emailTheQuote = async (recipientEmail: string) => {
    const origin = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');
    await sendClientQuoteEmail({
      recipientEmail,
      businessName,
      clientName: job.client_name,
      jobRef: job.ref,
      quotedAmount,
      quoteUrl: `${origin}/client/jobs/${token}`,
      includesScheduleOptions: quickBooking.hasInput,
      accountId,
    });
    emailedTo = recipientEmail;
  };

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
        idempotencyKey: `client-job-dashboard:${job.id}:lead-conversion`,
      });
      delivery = 'sms';
    } catch (err) {
      console.error(`Quote SMS failed for job ${job.id}:`, err);
      delivery = 'failed';
      /* A DEAD NUMBER USED TO MEAN A DEAD QUOTE.
         The channel is chosen once, up front, so a carrier rejection after
         that point left the send recorded as "failed" with a perfectly good
         email address sitting unused on the same row. The customer never
         learned a quote existed, and the only signal was a banner the
         contractor had to notice and act on.

         Fires once, only after a real attempt failed, and only when the
         contractor left email switched on — somebody set to text-only said
         never email this customer, and a failure is not permission. See
         smsFailureFallback. */
      const second = smsFailureFallback({ phone: leadPhone, email: leadEmail, preference: messageChannel, optedOut, kind: 'requested' });
      if (second) {
        try {
          await emailTheQuote(second.to);
          delivery = 'sms_failed_emailed';
        } catch (emailErr) {
          console.error(`Quote email fallback failed for job ${job.id}:`, emailErr);
        }
      }
    }
  } else if (clientEmail) {
    try {
      await emailTheQuote(clientEmail);
      delivery = 'email';
    } catch (err) {
      console.error(`Quote email failed for job ${job.id}:`, err);
      delivery = 'failed';
    }
  }

  if (delivery === 'sms' || delivery === 'email' || delivery === 'sms_failed_emailed') {
    await createJobFeedEvent(supabase, accountId, job.id, {
      kind: 'job_update',
      title: delivery === 'sms' ? 'Quote texted to client' : 'Quote emailed to client',
      // The recipient is deliberately NOT named on the emailed branches. This
      // row is client-visible and the client-side scrubber removes email
      // addresses, so "emailed to dana@x.com" reached the homeowner's own page
      // as "emailed to ." — see lib/client-feed.
      body: delivery === 'sms'
        ? `The quote and sign-off link were texted to ${job.client_name}.`
        : 'Your quote and sign-off link were emailed to you.',
      visibility: 'client',
    });
  }

  // Receipt to the contractor: the quote left their hands, here's where it went.
  // Opt-out via Settings → Automations; a quote goes out on every won lead, so
  // some contractors will want the confirmation and some will find it noise.
  // Defensive read — a pre-migration row has no column and defaults to on.
  try {
    const wanted = await wantsConfirmation(supabase, accountId, 'quote_confirmation_email');
    const { data: { user } } = await supabase.auth.getUser();
    if (wanted && user?.email) {
      const origin = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');
      await sendQuoteSentConfirmationEmail({
        accountId,
        recipientEmail: user.email,
        businessName,
        clientName: job.client_name,
        jobRef: job.ref,
        quotedAmount,
        channel: delivery === 'sms' ? 'sms' : emailedTo ? 'email' : 'none',
        sentTo: delivery === 'sms' ? job.client_phone : emailedTo,
        jobUrl: `${origin}/dashboard/jobs/${job.id}`,
      });
    }
  } catch (err) {
    // A confirmation must never break sending the quote itself.
    console.error(`Quote confirmation email failed for job ${job.id}:`, err);
  }

  /**
   * Texting the start dates on their own.
   *
   * Only reachable when the quote itself is not going by text — which is exactly
   * when QuoteStartDateCalendar shows its own scheduling-consent box — so the
   * options still reach a client whose quote is being handed over by hand.
   *
   * The trigger is that box being TICKED, not the quote checkbox being unticked.
   * Those are not the same question, and reading one as the other is what made
   * this branch fire on a client the owner had just switched off. An explicit
   * tick is an explicit instruction and it is honoured; a STOP reply is not
   * something the owner can tick past, and it is checked here as everywhere.
   */
  if (quickBooking.hasInput && route.channel !== 'sms' && formData.get('quoteScheduleSmsConsent') === 'on') {
    const schedulePhone = normalizeUsPhone(job.client_phone ?? '');
    if (!schedulePhone) throw new Error('Enter a valid client mobile number before sending quick booking options.');
    if (optedOut) throw new Error(`${job.client_name} replied STOP to a previous text, so scheduling options can’t be sent to that number.`);

    const request = await createAndSendScheduleRequest(supabase, accountId, job.id, { clientPhone: schedulePhone, options: quickBooking.options });
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
//
// OPEN TO OFFICE USERS, and this one guard opens EXACTLY THREE actions,
// because it is the entire body of snoozeLeadAction, unsnoozeLeadAction and
// archiveLeadAction and has no other caller. Deliberate, not incidental: all
// three were reviewed separately and all three are the same change -- one
// reversible triage field, on one leads row, through the session client,
// scoped by account_id, with nothing outbound. A FOURTH caller added here
// would inherit the grant without anyone looking at it, so give that one its
// own guard rather than reusing this.
//
// The contrast worth keeping: declineLeadAction ALSO sets archived, and texts
// the homeowner to say so. It stays owner-only. Archiving is the one triage
// action with nothing leaving the building.
async function patchLeadTriage(leadId: string, patch: Partial<LeadTriage>) {
  const { supabase, accountId } = await requireOfficeContext('leads.read', 'leads.write');
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
  (await cookies()).set(LEAD_LAYOUT_COOKIE, layout === 'primary' ? 'primary' : 'guided', {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
}

// Remember which Leads board view (board / inbox / table / split) the owner
// last used, so the page opens in it next time. Cookie, not a DB column.
export async function setLeadsViewAction(view: LeadsView) {
  // A per-browser display preference. It touches no table at all -- one
  // cookie, allowlisted to three layout names -- so leads.read is the whole
  // requirement: it names the page this belongs to rather than claiming a
  // permission it never uses.
  await requireOfficeContext('leads.read');
  (await cookies()).set(LEADS_VIEW_COOKIE, normalizeLeadsView(view), {
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

/**
 * Delete a lead for good.
 *
 * Set aside was a one-way street: archive and snooze both hide a lead and both
 * keep it forever, so a list of junk — test submissions, bots that got past the
 * honeypot, the same person three times — only ever grew. This is the way out,
 * and it lives only in that drawer because that is the one place a lead has
 * already been judged not worth keeping.
 *
 * Refuses a lead that became a job. Nothing in the Set aside drawer can be one
 * (it filters won and lost out), but the action is callable on its own and a
 * deleted lead would silently strip a job of where it came from.
 *
 * Photos go with it. They are the only thing a lead owns outside its row, and
 * leaving them behind is billed storage nobody can reach.
 */
export async function deleteLeadAction(leadId: string) {
  const { supabase, accountId, userId, userEmail } = await requireOwnerContext();
  const lead = await getLead(supabase, accountId, leadId);
  if (!lead) throw new Error('Lead not found.');
  if (lead.converted_job) throw new Error('This lead became a job — open the job to delete it instead.');

  await softDeleteEntity({
    accountId,
    entityType: 'lead',
    entityId: leadId,
    actor: { userId, role: 'owner', email: userEmail ?? undefined },
    reason: 'Owner moved lead to trash bin',
  });

  revalidatePath('/dashboard/leads');
  revalidatePath('/dashboard/trash');
  revalidatePath('/dashboard/activity');
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
      const businessName = await loadBusinessName(supabase, accountId);
      await recordSmsConsent(accountId, clientPhone, 'lead_decline');
      await sendLeadDeclineSms({
        phone: clientPhone,
        businessName,
        leadName: lead.name || 'there',
        reason,
        accountId,
        idempotencyKey: `lead-decline:${leadId}:${reasonKey}`,
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


export type SendQuoteState = { error: string } | null;

// useActionState wrapper around convertLeadAction.
//
// Every validation message in convertLeadAction is written to be useful ("Add at
// least one line item…", "Connect Stripe before sending…") and none of them ever
// reached the owner: a thrown Error in a server action renders as "Application
// error: a server-side exception has occurred" with a digest, so an ordinary
// mistake — a $0 line item, a plan-only quote — looked like the app had crashed.
// Returning the message instead puts it back on screen next to the button.
//
// redirect() and notFound() signal by THROWING a tagged error, so those are
// rethrown untouched; swallowing them would strand the owner on the lead page
// after the job was already created.
export async function sendQuoteAction(
  leadId: string,
  _previous: SendQuoteState,
  formData: FormData,
): Promise<SendQuoteState> {
  try {
    await convertLeadAction(leadId, formData);
    return null;
  } catch (error) {
    const digest = (error as { digest?: unknown } | null)?.digest;
    if (typeof digest === 'string' && (digest.startsWith('NEXT_REDIRECT') || digest === 'NEXT_NOT_FOUND')) throw error;
    return { error: error instanceof Error ? error.message : 'Could not send the quote.' };
  }
}

/**
 * How long a lead sits before the app marks it lost.
 *
 * Saved on the Leads page rather than buried in Settings, because the number
 * only means anything next to the queue it is quietly emptying — and until now
 * it was a constant nobody could see at all.
 */
export async function setLeadLostAfterDaysAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const days = normalizeLeadLostAfterDays(formData.get('days'));

  const { error } = await supabase
    .from('accounts')
    .update({ lead_lost_after_days: days })
    .eq('id', accountId);
  if (error) throw new Error(error.message);

  // Every page that shows a lead status runs expireStaleLeads on load, so a
  // longer window does not un-lose anything already closed — it only stops the
  // next one. Said plainly on the page rather than implied here.
  revalidatePath('/dashboard/leads');
  revalidatePath('/dashboard');
}

/**
 * Send lead-quality feedback to Google and keep the exact submitted payload.
 * Google's read model later exposes only a boolean, so without this local fact
 * the owner could not audit which answer or reason was sent.
 */
export async function submitGoogleLsaFeedbackAction(leadId: string, formData: FormData) {
  const { accountId, userId } = await requireOwnerContext();
  const admin = createAdminClient();
  const { data: providerLead, error } = await admin
    .from('google_lsa_leads')
    .select('customer_id, google_lead_id, resource_name, crm_lead_id, feedback_submitted')
    .eq('account_id', accountId)
    .eq('crm_lead_id', leadId)
    .maybeSingle();
  if (error || !providerLead) throw new Error('This CRM lead is not linked to a Google Local Services lead.');
  if (providerLead.feedback_submitted) throw new Error('Lead feedback has already been submitted to Google.');

  const connection = await activeGoogleLsaConnection(accountId);
  if (!connection || connection.customerId !== providerLead.customer_id) {
    throw new Error('Reconnect Google Local Services before sending lead feedback.');
  }

  const outcome = String(formData.get('outcome') ?? '').trim();
  const [outcomeAnswer, outcomeReason] = outcome.split(':');
  const surveyAnswer = outcomeAnswer === 'very_satisfied'
    ? 'VERY_SATISFIED'
    : outcomeAnswer === 'satisfied'
      ? 'SATISFIED'
      : outcomeAnswer === 'neutral'
        ? 'NEUTRAL'
        : outcomeAnswer === 'very_dissatisfied'
          ? 'VERY_DISSATISFIED'
          : outcomeAnswer === 'dissatisfied'
            ? 'DISSATISFIED'
            : String(formData.get('surveyAnswer') ?? '').trim() as GoogleLsaFeedback['surveyAnswer'];
  const reason = outcomeReason || String(formData.get('reason') ?? '').trim() || undefined;
  const otherReasonComment = String(formData.get('comment') ?? '').trim() || undefined;
  const feedback = {
    surveyAnswer,
    ...(reason ? { reason: reason as GoogleLsaFeedback['reason'] } : {}),
    ...(otherReasonComment ? { otherReasonComment } : {}),
  } satisfies GoogleLsaFeedback;

  // Validate the oneof reason/comment rules before taking the local claim.
  buildGoogleLsaFeedbackBody(feedback);

  const now = new Date().toISOString();
  const claim = {
    account_id: accountId,
    customer_id: String(providerLead.customer_id),
    google_lead_id: String(providerLead.google_lead_id),
    crm_lead_id: leadId,
    answer: feedback.surveyAnswer,
    reason: feedback.reason ?? null,
    comment: feedback.otherReasonComment ?? null,
    credit_issuance_decision: null,
    submission_status: 'pending',
    last_error: null,
    submitted_by: userId,
    submitted_at: now,
  };
  const { error: claimError } = await admin.from('google_lsa_feedback').insert(claim);
  if (claimError) {
    if (claimError.code !== '23505') throw new Error(claimError.message);
    const { data: reclaimed, error: reclaimError } = await admin
      .from('google_lsa_feedback')
      .update(claim)
      .eq('account_id', accountId)
      .eq('customer_id', String(providerLead.customer_id))
      .eq('google_lead_id', String(providerLead.google_lead_id))
      .eq('submission_status', 'failed')
      .select('id')
      .maybeSingle();
    if (reclaimError) throw new Error(reclaimError.message);
    if (!reclaimed) throw new Error('Lead feedback is already submitted or currently being sent.');
  }

  let response;
  try {
    response = await provideGoogleLsaFeedback({
      accessToken: connection.accessToken,
      customerId: connection.customerId,
      loginCustomerId: connection.loginCustomerId,
      resourceName: String(providerLead.resource_name),
      feedback,
    });
  } catch (providerError) {
    const detail = providerError instanceof Error ? providerError.message : 'Google feedback request failed.';
    const definiteFailure = providerError instanceof GoogleLsaApiError
      && providerError.status >= 400
      && providerError.status < 500
      && ![408, 409, 429].includes(providerError.status);
    const { error: failureWriteError } = await admin
      .from('google_lsa_feedback')
      .update({
        submission_status: definiteFailure ? 'failed' : 'pending',
        last_error: (definiteFailure
          ? detail
          : `${detail} Submission outcome is not confirmed and will not be retried automatically.`).slice(0, 500),
      })
      .eq('account_id', accountId)
      .eq('customer_id', String(providerLead.customer_id))
      .eq('google_lead_id', String(providerLead.google_lead_id))
      .eq('submission_status', 'pending');
    if (failureWriteError) {
      throw new Error(`${detail} The retry state could not be saved: ${failureWriteError.message}`);
    }
    throw providerError;
  }
  const { data: completed, error: writeError } = await admin
    .from('google_lsa_feedback')
    .update({
      credit_issuance_decision: response.creditIssuanceDecision,
      submission_status: 'succeeded',
      last_error: null,
      submitted_at: new Date().toISOString(),
    })
    .eq('account_id', accountId)
    .eq('customer_id', String(providerLead.customer_id))
    .eq('google_lead_id', String(providerLead.google_lead_id))
    .eq('submission_status', 'pending')
    .select('id')
    .maybeSingle();
  if (writeError) throw new Error(writeError.message);
  if (!completed) throw new Error('Lead feedback claim changed before it could be completed.');
  const { error: leadWriteError } = await admin
    .from('google_lsa_leads')
    .update({ feedback_submitted: true, last_synced_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('customer_id', String(providerLead.customer_id))
    .eq('google_lead_id', String(providerLead.google_lead_id));
  if (leadWriteError) throw new Error(leadWriteError.message);
  revalidatePath(`/dashboard/leads/${leadId}`);
  revalidatePath('/dashboard/marketing/performance');
}
