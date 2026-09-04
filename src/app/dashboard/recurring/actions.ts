'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient, requireOfficeContext } from '@/lib/auth';
import {
  advanceDate,
  createRecurringPlan,
  ensurePlanVisits,
  getRecurringPlan,
  setRecurringPlanActive,
  deleteRecurringPlan,
  runRecurringPlanNow,
  setRecurringPlanAutopay,
  todayDateKey,
  updateRecurringPlan,
  requiresReconsent,
  type RecurringFrequency,
} from '@/lib/recurring';
import { createCardSetupSession } from '@/lib/card-on-file';
import { sendJobAppointmentReminder, type RemindableJob } from '@/lib/reminders';
import { sendCardSetupSms } from '@/lib/sms';
import { sendCardSetupEmail } from '@/lib/email';
import { deleteJob } from '@/lib/jobs';
import { getMembershipTier } from '@/lib/membership-tiers';

const FREQUENCIES: RecurringFrequency[] = ['weekly', 'biweekly', 'monthly', 'quarterly', 'semi-annual', 'annual'];
const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

export async function createRecurringPlanAction(formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('jobs.write', 'clients.write');

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

  const rawTerm = formData.get('termCycles');
  const termCycles = rawTerm && Number(rawTerm) > 0 ? Math.floor(Number(rawTerm)) : null;
  const membershipTierId = String(formData.get('membershipTierId') ?? '').trim() || null;
  let tierInfo: { name?: string; level?: number; benefits?: Record<string, unknown> } = {};
  if (membershipTierId) {
    try {
      const tier = await getMembershipTier(supabase, accountId, membershipTierId);
      if (tier) {
        tierInfo = { name: tier.name, level: tier.tierLevel, benefits: tier.benefits };
      }
    } catch (tierErr) {
      console.error('Failed to load membership tier:', tierErr);
    }
  }

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
    termCycles,
    membershipTierId,
    membershipTierName: tierInfo.name || null,
    tierLevel: tierInfo.level || null,
    tierBenefits: tierInfo.benefits || null,
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
  const { accountId } = await requireOfficeContext('jobs.write');
  const { outcome, jobId } = await runRecurringPlanNow(accountId, planId);
  revalidatePath('/dashboard/recurring');
  redirect(`/dashboard/recurring?flash=ran-${outcome}&job=${jobId}`);
}

export async function setPlanActiveAction(planId: string, active: boolean) {
  const { supabase, accountId, userId, role, userEmail } = await requireOfficeContext('jobs.write');
  const { visitsChanged } = await setRecurringPlanActive(supabase, accountId, planId, active);
  // Pausing removes upcoming visits and resuming puts them back, so the calendar
  // this changed has to be re-rendered too.
  revalidatePath('/dashboard/recurring');
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/jobs');
  redirect(`/dashboard/recurring?flash=${active ? 'resumed' : 'paused'}${visitsChanged > 0 ? `&changed=${visitsChanged}` : ''}`);
}

export async function deletePlanAction(planId: string) {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  const { visitsRemoved } = await deleteRecurringPlan(supabase, accountId, planId);
  revalidatePath('/dashboard/recurring');
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/jobs');
  redirect(`/dashboard/recurring?flash=deleted${visitsRemoved > 0 ? `&removed=${visitsRemoved}` : ''}`);
}

/**
 * Skip the next visit: the customer is away, the lawn doesn't need it, the
 * driveway is already clear.
 *
 * The plan moves on to the visit AFTER this one and the cadence carries on from
 * there. It does not consume a visit of a fixed term — six visits paid for is
 * still six visits, one of them later than planned.
 *
 * Refuses once the visit has been worked or billed. A skipped visit is deleted
 * from the calendar, and deleting one that has been completed or has money
 * against it would remove the record of work that actually happened; at that
 * point the honest action is Create the next visit early, not a skip.
 */
export async function skipNextVisitAction(planId: string) {
  const { supabase, accountId, userId, role, userEmail } = await requireOfficeContext('jobs.write');
  const plan = await getRecurringPlan(supabase, accountId, planId);
  if (!plan) throw new Error('Plan not found.');
  if (!plan.active) throw new Error('This plan is paused, so there is no next visit to skip. Resume it first.');

  const skipped = plan.next_run_date;

  const { data: visit } = await supabase
    .from('jobs')
    .select('id, status')
    .eq('account_id', accountId)
    .eq('recurring_plan_id', planId)
    .eq('recurring_visit_date', skipped)
    .maybeSingle();

  if (visit) {
    if (visit.status === 'complete') {
      throw new Error(`The ${shortDay(skipped)} visit is already marked complete — it can’t be skipped after the fact.`);
    }
    const { count } = await supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('job_id', visit.id);
    if ((count ?? 0) > 0) {
      throw new Error(`The ${shortDay(skipped)} visit has already been billed. Void or refund that payment before skipping it.`);
    }
    await deleteJob(supabase, accountId, visit.id, { userId, role, email: userEmail ?? undefined });
  }

  const nextDate = advanceDate(skipped, plan.frequency, plan.anchor_day);
  const { error } = await supabase
    .from('recurring_plans')
    .update({ next_run_date: nextDate, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', planId);
  if (error) throw error;

  // Refill the far end of the horizon so skipping doesn't shorten how far ahead
  // the calendar is populated. Best-effort, like every other call of this: the
  // daily sweep creates any visit this misses on the morning it is due.
  try {
    await ensurePlanVisits(createAdminClient(), { ...plan, next_run_date: nextDate });
  } catch (visitError) {
    console.error('Refilling visits after a skip failed:', visitError instanceof Error ? visitError.message : visitError);
  }

  revalidatePath('/dashboard/recurring');
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/jobs');
  redirect(`/dashboard/recurring?flash=skipped&on=${skipped}&then=${nextDate}`);
}

/** "Aug 11" — for error messages that have to name the visit being refused. */
function shortDay(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Text or email the customer that their next visit is coming up.
 *
 * Same code as the nightly reminder sweep, forced past its once-per-visit guard
 * because an owner pressing a button has decided to send this one. The feed
 * entry it leaves behind then stops tonight's sweep sending a second, so a
 * manual reminder replaces the automatic one instead of doubling it.
 */
export async function remindNextVisitAction(planId: string) {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  const plan = await getRecurringPlan(supabase, accountId, planId);
  if (!plan) throw new Error('Plan not found.');

  const { data: visit } = await supabase
    .from('jobs')
    .select('id, account_id, ref, client_name, client_phone, client_email, address, scheduled_for, scheduled_time')
    .eq('account_id', accountId)
    .eq('recurring_plan_id', planId)
    .eq('recurring_visit_date', plan.next_run_date)
    .maybeSingle();

  if (!visit) {
    throw new Error('That visit isn’t on the calendar yet, so there is nothing to remind them about. Create it early first.');
  }

  let flash = 'reminded';
  try {
    const result = await sendJobAppointmentReminder(createAdminClient(), visit as RemindableJob, { force: true });
    if (!result.sent) flash = 'remind-nochannel';
    else if (result.channel === 'email') flash = 'reminded-email';
  } catch (error) {
    console.error('Manual visit reminder failed:', error instanceof Error ? error.message : error);
    flash = 'remind-failed';
  }

  revalidatePath('/dashboard/recurring');
  revalidatePath(`/dashboard/jobs/${visit.id}`);
  redirect(`/dashboard/recurring?flash=${flash}`);
}

/**
 * Turn autopay on or off on a plan that already exists.
 *
 * Blunt on purpose: the switch flips immediately rather than waiting for the
 * customer to do anything. Turning it on sends the card link as well, and until
 * a card lands the plan reads "Awaiting card" and shows up in the attention
 * banner — which is the honest state, and one the owner can already see and
 * chase. Waiting for the card before flipping the switch would leave the owner
 * pressing a button that appears to do nothing for a day.
 *
 * A failed send is NOT a failed switch. Autopay is a fact about the plan; the
 * link is a message about it, and the flash says which one didn't happen.
 */
export async function setPlanAutopayAction(planId: string, autoCharge: boolean) {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  const plan = await setRecurringPlanAutopay(supabase, accountId, planId, autoCharge);

  let flash = autoCharge ? 'autopay-on' : 'autopay-off';
  if (autoCharge && !plan.card_last4) {
    try {
      await sendCardLink(supabase, accountId, planId);
      flash = 'autopay-card-sent';
    } catch (error) {
      console.error('Autopay card link send failed:', error instanceof Error ? error.message : error);
      flash = 'autopay-card-failed';
    }
  }

  revalidatePath('/dashboard/recurring');
  revalidatePath('/dashboard/cash-flow');
  redirect(`/dashboard/recurring?flash=${flash}`);
}

export async function resendCardLinkAction(planId: string) {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
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
  supabase: Awaited<ReturnType<typeof requireOfficeContext>>['supabase'],
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
      await sendCardSetupEmail({ recipientEmail: plan.client_email, businessName, planTitle: plan.title, url, accountId });
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

/**
 * Edit a live plan's price, cadence, or next visit date.
 *
 * A price rise on a plan that auto-charges is refused unless the owner confirms
 * the client agreed to the new amount — the card on file is permission to take
 * an agreed figure, not whatever the plan later says.
 */
export async function updatePlanAction(planId: string, formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  const plan = await getRecurringPlan(supabase, accountId, planId);
  if (!plan) throw new Error('Plan not found.');

  const rawAmount = Number(formData.get('amount'));
  const amount = Number.isFinite(rawAmount) && rawAmount >= 0 ? Math.round(rawAmount * 100) / 100 : plan.amount;
  const rawFrequency = (formData.get('frequency') ?? '').toString();
  const frequency = FREQUENCIES.includes(rawFrequency as RecurringFrequency) ? (rawFrequency as RecurringFrequency) : plan.frequency;
  const nextRunDate = (formData.get('nextRunDate') ?? '').toString().trim() || plan.next_run_date;

  if (requiresReconsent(plan, amount) && formData.get('confirmIncrease') !== 'on') {
    throw new Error(
      `This plan charges a card on file. Confirm ${plan.client_name} agreed to the increase before raising it from $${plan.amount} to $${amount}.`,
    );
  }

  await updateRecurringPlan(supabase, accountId, planId, { amount, frequency, nextRunDate });
  revalidatePath('/dashboard/recurring');
  revalidatePath('/dashboard/schedule');
}
