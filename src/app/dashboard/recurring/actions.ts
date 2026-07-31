'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient, requireOwnerContext } from '@/lib/auth';
import {
  createRecurringPlan,
  ensurePlanVisits,
  getRecurringPlan,
  setRecurringPlanActive,
  deleteRecurringPlan,
  runRecurringPlanNow,
  todayDateKey,
  type RecurringFrequency,
} from '@/lib/recurring';
import { createCardSetupSession } from '@/lib/card-on-file';
import { sendCardSetupSms } from '@/lib/sms';
import { sendCardSetupEmail } from '@/lib/email';

const FREQUENCIES: RecurringFrequency[] = ['weekly', 'biweekly', 'monthly'];
const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

export async function createRecurringPlanAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const title = String(formData.get('title') ?? '').trim();
  const scope = String(formData.get('scope') ?? '').trim();
  const clientName = String(formData.get('clientName') ?? '').trim();
  const clientPhone = String(formData.get('clientPhone') ?? '').trim();
  const clientEmail = String(formData.get('clientEmail') ?? '').trim();
  const address = String(formData.get('address') ?? '').trim();
  // Round to cents so a bypassed client (or a pasted long decimal) can't store
  // sub-cent precision the numeric(12,2) column would silently round anyway.
  const amount = Math.round(Number(formData.get('amount') ?? 0) * 100) / 100;
  const frequency = String(formData.get('frequency') ?? '') as RecurringFrequency;
  const firstVisitDate = String(formData.get('firstVisitDate') ?? '').trim();
  const autoCharge = formData.get('autoCharge') === 'on';

  if (!title) throw new Error('Give the plan a name (e.g. “Weekly lawn mowing”).');
  if (!clientName) throw new Error('Add the customer name.');
  if (!FREQUENCIES.includes(frequency)) throw new Error('Pick how often it repeats.');
  if (!firstVisitDate) throw new Error('Pick the first visit date.');
  if (firstVisitDate < todayDateKey()) throw new Error('The first visit date can’t be in the past.');
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Enter a valid amount per visit.');
  if (autoCharge && amount <= 0) throw new Error('Auto-charge needs an amount greater than $0.');
  if (autoCharge && !clientEmail && !clientPhone) throw new Error('Auto-charge needs the customer’s email or phone to send the card link.');

  const plan = await createRecurringPlan(supabase, accountId, {
    title,
    scope: scope || null,
    clientName,
    clientPhone: clientPhone || null,
    clientEmail: clientEmail || null,
    address: address || null,
    amount,
    frequency,
    firstVisitDate,
    autoCharge,
  });

  // Put the first visits on the calendar now rather than one at a time on the
  // morning of each. Jobs only — the invoice and the charge still happen on the
  // day, in the daily sweep, so nobody is billed for work weeks out.
  //
  // Best-effort: a plan that saved is a plan that saved. If this fails the sweep
  // creates each visit on its day, which is where we started.
  try {
    await ensurePlanVisits(createAdminClient(), plan);
  } catch (error) {
    console.error('Recurring visit horizon failed:', error instanceof Error ? error.message : error);
  }

  let flash = 'created';
  if (autoCharge) {
    try {
      await sendCardLink(supabase, accountId, plan.id);
      flash = 'card-sent';
    } catch (error) {
      console.error('Card setup link send failed:', error instanceof Error ? error.message : error);
      flash = 'card-failed';
    }
  }

  revalidatePath('/dashboard/recurring');
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/jobs');
  redirect(`/dashboard/recurring?flash=${flash}`);
}

export async function runPlanNowAction(planId: string) {
  const { accountId } = await requireOwnerContext();
  const { outcome, jobId } = await runRecurringPlanNow(accountId, planId);
  revalidatePath('/dashboard/recurring');
  redirect(`/dashboard/recurring?flash=ran-${outcome}&job=${jobId}`);
}

export async function setPlanActiveAction(planId: string, active: boolean) {
  const { supabase, accountId } = await requireOwnerContext();
  await setRecurringPlanActive(supabase, accountId, planId, active);
  // Pausing removes upcoming visits and resuming puts them back, so the calendar
  // this changed has to be re-rendered too.
  revalidatePath('/dashboard/recurring');
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/jobs');
}

export async function deletePlanAction(planId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const { visitsRemoved } = await deleteRecurringPlan(supabase, accountId, planId);
  revalidatePath('/dashboard/recurring');
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/jobs');
  redirect(`/dashboard/recurring?flash=deleted${visitsRemoved > 0 ? `&removed=${visitsRemoved}` : ''}`);
}

export async function resendCardLinkAction(planId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  try {
    await sendCardLink(supabase, accountId, planId);
    revalidatePath('/dashboard/recurring');
    redirect('/dashboard/recurring?flash=card-sent');
  } catch (error) {
    console.error('Resend card link failed:', error instanceof Error ? error.message : error);
    redirect('/dashboard/recurring?flash=card-failed');
  }
}

// Generate a hosted card-setup session for the plan and send the link to the
// client — email when there's an address, and text when they're SMS opted-in.
// Best-effort per channel, but throws if neither channel could be used.
async function sendCardLink(
  supabase: Awaited<ReturnType<typeof requireOwnerContext>>['supabase'],
  accountId: string,
  planId: string,
): Promise<void> {
  const plan = await getRecurringPlan(supabase, accountId, planId);
  if (!plan) throw new Error('Plan not found.');

  const url = await createCardSetupSession(plan, APP_ORIGIN);

  const [{ data: account }, { data: site }] = await Promise.all([
    supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
  ]);
  const businessName = site?.company_name || account?.business_name || "Let's Get Quoted contractor";

  let anySent = false;

  if (plan.client_email) {
    try {
      await sendCardSetupEmail({ recipientEmail: plan.client_email, businessName, planTitle: plan.title, url });
      anySent = true;
    } catch (error) {
      console.error('Card setup email failed:', error instanceof Error ? error.message : error);
    }
  }

  if (plan.client_phone) {
    const { data: consent } = await supabase
      .from('sms_consent')
      .select('status')
      .eq('account_id', accountId)
      .eq('phone_number', plan.client_phone)
      .maybeSingle();
    if (consent?.status === 'opted_in') {
      try {
        await sendCardSetupSms({ phone: plan.client_phone, businessName, url, accountId });
        anySent = true;
      } catch (error) {
        console.error('Card setup SMS failed:', error instanceof Error ? error.message : error);
      }
    }
  }

  if (!anySent) {
    throw new Error('Could not send the card link (no email, and the phone isn’t opted in to texts).');
  }
}
