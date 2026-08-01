'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';

const CATEGORIES = ['payroll', 'materials', 'equipment', 'bill', 'tax', 'loan', 'other'] as const;
const RECURRENCES = ['once', 'weekly', 'biweekly', 'monthly'] as const;

function money(value: FormDataEntryValue | null): number {
  // Strip $ and thousands separators — people paste "1,250.00" and "$1250".
  const cleaned = String(value ?? '').replace(/[$,\s]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : NaN;
}

function optionalMoney(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = money(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * What's in the bank right now, and how low it can get.
 *
 * The balance is stamped with WHEN it was entered, because a forecast built on
 * a number from three weeks ago is a forecast about three weeks ago. The page
 * shows the age and asks for it again once it's stale.
 */
export async function saveCashSettingsAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const balance = optionalMoney(formData.get('balance'));
  const buffer = optionalMoney(formData.get('buffer'));
  const creditLine = optionalMoney(formData.get('creditLine'));

  if (balance !== null && balance < 0) throw new Error('The starting balance can’t be negative — use the credit line for an overdraft.');
  if (buffer !== null && buffer < 0) throw new Error('The safety buffer can’t be negative.');
  if (creditLine !== null && creditLine < 0) throw new Error('The credit line can’t be negative.');

  const patch: Record<string, unknown> = {
    cash_buffer: buffer ?? 0,
    cash_credit_line: creditLine ?? 0,
  };
  // Only re-stamp the date when a balance was actually submitted, or saving a
  // buffer would silently make a stale balance look freshly checked.
  if (balance !== null) {
    patch.cash_balance = balance;
    patch.cash_balance_at = new Date().toISOString();
  }

  const { error } = await supabase.from('accounts').update(patch).eq('id', accountId);
  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/cash-flow');
}

export async function saveScheduledPaymentAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const id = String(formData.get('id') ?? '').trim();
  const label = String(formData.get('label') ?? '').trim();
  const amount = money(formData.get('amount'));
  const direction = formData.get('direction') === 'in' ? 'in' : 'out';
  const rawCategory = String(formData.get('category') ?? 'bill');
  const category = (CATEGORIES as readonly string[]).includes(rawCategory) ? rawCategory : 'bill';
  const dueDate = String(formData.get('dueDate') ?? '').trim();
  const rawRecurrence = String(formData.get('recurrence') ?? 'once');
  const recurrence = (RECURRENCES as readonly string[]).includes(rawRecurrence) ? rawRecurrence : 'once';
  const endsOn = String(formData.get('endsOn') ?? '').trim();
  const confirmed = formData.get('confirmed') === 'on';
  const note = String(formData.get('note') ?? '').trim();

  if (!label) throw new Error('Give it a name — “Truck payment”, “General liability”, “Supply house”.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter an amount greater than $0.');
  if (!dueDate) throw new Error('Pick the date it’s due.');
  if (endsOn && endsOn < dueDate) throw new Error('The end date can’t be before the first payment.');
  if (recurrence === 'once' && endsOn) throw new Error('A one-off payment doesn’t repeat, so it has no end date.');

  const row = {
    account_id: accountId,
    label,
    amount,
    direction,
    category,
    due_date: dueDate,
    recurrence,
    ends_on: endsOn || null,
    confirmed,
    note: note || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = id
    ? await supabase.from('scheduled_payments').update(row).eq('account_id', accountId).eq('id', id)
    : await supabase.from('scheduled_payments').insert(row);
  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/cash-flow');
}

/**
 * Stop a scheduled payment without erasing it.
 *
 * Deactivating rather than deleting by default: an insurance premium that's
 * been suspended for a season is a row somebody will want back, and retyping it
 * from memory is how the amount ends up wrong.
 */
export async function setScheduledPaymentActiveAction(id: string, active: boolean) {
  const { supabase, accountId } = await requireOwnerContext();
  const { error } = await supabase
    .from('scheduled_payments')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/cash-flow');
}

export async function deleteScheduledPaymentAction(id: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const { error } = await supabase.from('scheduled_payments').delete().eq('account_id', accountId).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/cash-flow');
}
