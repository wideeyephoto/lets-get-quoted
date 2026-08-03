import type { SupabaseClient } from '@supabase/supabase-js';
import { parseQuoteItems, type QuoteItem } from '@/lib/jobs';
import {
  canSend,
  changeOrderTotal,
  isEditable,
  sendBlockers,
  type ChangeOrder,
  type ChangeOrderStatus,
} from '@/lib/change-orders';

type Row = Record<string, unknown>;

function toChangeOrder(row: Row): ChangeOrder {
  return {
    id: row.id as string,
    jobId: row.job_id as string,
    status: (row.status as ChangeOrderStatus) ?? 'draft',
    crewId: (row.crew_id as string | null) ?? null,
    crewName: (row.crew_name as string | null) ?? null,
    title: (row.title as string) ?? '',
    fieldNote: (row.field_note as string) ?? '',
    scope: (row.scope as string) ?? '',
    photoPaths: (row.photo_paths as string[] | null) ?? [],
    items: parseQuoteItems(row.items),
    amount: Number(row.amount) || 0,
    estimatedCost: row.estimated_cost === null || row.estimated_cost === undefined ? null : Number(row.estimated_cost),
    sentAt: (row.sent_at as string | null) ?? null,
    respondedAt: (row.responded_at as string | null) ?? null,
    signatureName: (row.signature_name as string | null) ?? null,
    declineReason: (row.decline_reason as string | null) ?? null,
    paymentId: (row.payment_id as string | null) ?? null,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
  };
}

/** Defensive: an un-migrated DB returns nothing rather than breaking the job page. */
export async function listChangeOrders(supabase: SupabaseClient, accountId: string, jobId: string): Promise<ChangeOrder[]> {
  const { data, error } = await supabase
    .from('change_orders')
    .select('*')
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []).map(toChangeOrder);
}

export async function getChangeOrder(
  supabase: SupabaseClient,
  accountId: string,
  changeOrderId: string,
): Promise<ChangeOrder | null> {
  const { data } = await supabase.from('change_orders').select('*').eq('account_id', accountId).eq('id', changeOrderId).maybeSingle();
  return data ? toChangeOrder(data as Row) : null;
}

/**
 * A crew member raises one from the field. It arrives as a DRAFT with no price.
 *
 * Deliberately: a change order is a bill, and deciding what to charge for it is
 * the owner's call. The crew member's job here is to document what they found
 * well enough that somebody can price it — which is the part only they can do,
 * because only they are standing in front of it.
 */
export async function raiseChangeOrder(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  input: { crewId: string | null; crewName: string | null; title: string; fieldNote: string; photoPaths?: string[] },
): Promise<ChangeOrder> {
  const { data, error } = await supabase
    .from('change_orders')
    .insert({
      account_id: accountId,
      job_id: jobId,
      crew_id: input.crewId,
      crew_name: input.crewName,
      status: 'draft',
      title: input.title.trim().slice(0, 120) || 'Additional work found',
      field_note: input.fieldNote.trim().slice(0, 2000),
      photo_paths: input.photoPaths ?? [],
    })
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Could not raise the change order.');
  return toChangeOrder(data as Row);
}

/**
 * Owner edits. Refused outright once it has been sent — see isEditable. Changing
 * the price of something a customer is looking at, or has already agreed to,
 * rewrites a deal under them.
 */
export async function updateChangeOrder(
  supabase: SupabaseClient,
  accountId: string,
  changeOrderId: string,
  input: { title?: string; scope?: string; items?: QuoteItem[]; estimatedCost?: number | null },
): Promise<{ ok: boolean; message?: string }> {
  const existing = await getChangeOrder(supabase, accountId, changeOrderId);
  if (!existing) return { ok: false, message: 'That change order could not be found.' };
  if (!isEditable(existing.status)) {
    return {
      ok: false,
      message:
        existing.status === 'sent'
          ? 'This is with the customer. Withdraw it and raise a new one rather than changing it under them.'
          : 'This has already been answered and can’t be changed.',
    };
  }

  const patch: Row = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) patch.title = input.title.trim().slice(0, 120);
  if (input.scope !== undefined) patch.scope = input.scope.trim().slice(0, 2000);
  if (input.estimatedCost !== undefined) patch.estimated_cost = input.estimatedCost;
  if (input.items !== undefined) {
    patch.items = input.items;
    // Amount is always server-computed from the lines. A client-supplied total
    // that disagrees with its own line items is how a dispute starts.
    patch.amount = changeOrderTotal(input.items);
  }

  const { error } = await supabase.from('change_orders').update(patch).eq('account_id', accountId).eq('id', changeOrderId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/** Send it. Re-checks every blocker server-side; the disabled button is a courtesy. */
export async function sendChangeOrder(
  supabase: SupabaseClient,
  accountId: string,
  changeOrderId: string,
): Promise<{ ok: boolean; blockers?: string[]; order?: ChangeOrder }> {
  const existing = await getChangeOrder(supabase, accountId, changeOrderId);
  if (!existing) return { ok: false, blockers: ['That change order could not be found.'] };
  if (!canSend(existing)) return { ok: false, blockers: sendBlockers(existing) };

  const { data, error } = await supabase
    .from('change_orders')
    .update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', changeOrderId)
    // Only from draft: two taps must not send twice, and must not un-answer an
    // order the customer already responded to.
    .eq('status', 'draft')
    .select('*')
    .maybeSingle();
  if (error) return { ok: false, blockers: [error.message] };
  if (!data) return { ok: false, blockers: ['That change order is no longer a draft.'] };
  return { ok: true, order: toChangeOrder(data as Row) };
}

export async function voidChangeOrder(supabase: SupabaseClient, accountId: string, changeOrderId: string): Promise<{ ok: boolean; message?: string }> {
  const existing = await getChangeOrder(supabase, accountId, changeOrderId);
  if (!existing) return { ok: false, message: 'That change order could not be found.' };
  if (existing.status === 'approved') {
    return { ok: false, message: 'This was approved. Withdrawing it would remove work the customer agreed to pay for.' };
  }
  const { error } = await supabase
    .from('change_orders')
    .update({ status: 'void', updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', changeOrderId);
  return error ? { ok: false, message: error.message } : { ok: true };
}

/**
 * The homeowner's answer, recorded through their job link.
 *
 * Uses the admin client because the person deciding has no account — the token
 * on the link is what authorises this, and the caller has already resolved it.
 * Guarded on `status = 'sent'` so a replayed request can't flip a decision that
 * has already been made.
 */
export async function respondToChangeOrder(
  admin: SupabaseClient,
  accountId: string,
  changeOrderId: string,
  input: { decision: 'approved' | 'declined'; signatureName: string; declineReason?: string | null },
): Promise<{ ok: boolean; order?: ChangeOrder; message?: string }> {
  const name = input.signatureName.trim().slice(0, 120);
  if (!name) return { ok: false, message: 'Type your name to confirm the decision.' };

  const { data, error } = await admin
    .from('change_orders')
    .update({
      status: input.decision,
      responded_at: new Date().toISOString(),
      signature_name: name,
      decline_reason: input.decision === 'declined' ? (input.declineReason ?? '').trim().slice(0, 500) || null : null,
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId)
    .eq('id', changeOrderId)
    .eq('status', 'sent')
    .select('*')
    .maybeSingle();

  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: 'That has already been answered.' };
  return { ok: true, order: toChangeOrder(data as Row) };
}

/** Every change order across a job, for the client-facing job page. */
export async function loadClientChangeOrders(admin: SupabaseClient, accountId: string, jobId: string): Promise<ChangeOrder[]> {
  const { data, error } = await admin
    .from('change_orders')
    .select('*')
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []).map(toChangeOrder);
}
