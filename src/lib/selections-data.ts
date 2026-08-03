import type { SupabaseClient } from '@supabase/supabase-js';
import { snapshotOption, type ChosenSnapshot, type Selection, type SelectionOption, type SelectionStatus } from '@/lib/selections';

type Row = Record<string, unknown>;

function toOption(row: Row): SelectionOption {
  return {
    id: row.id as string,
    name: (row.name as string) ?? '',
    description: (row.description as string) ?? '',
    price: Number(row.price) || 0,
    reference: (row.reference as string) ?? '',
    photoPath: (row.photo_path as string | null) ?? null,
    sortOrder: Number(row.sort_order) || 0,
  };
}

function toSelection(row: Row, options: SelectionOption[]): Selection {
  return {
    id: row.id as string,
    jobId: row.job_id as string,
    title: (row.title as string) ?? '',
    description: (row.description as string) ?? '',
    allowance: Number(row.allowance) || 0,
    decideBy: (row.decide_by as string | null) ?? null,
    creditUnderspend: row.credit_underspend !== false,
    status: (row.status as SelectionStatus) ?? 'open',
    chosenOptionId: (row.chosen_option_id as string | null) ?? null,
    chosenSnapshot: (row.chosen_snapshot as ChosenSnapshot | null) ?? null,
    chosenAt: (row.chosen_at as string | null) ?? null,
    chosenByName: (row.chosen_by_name as string | null) ?? null,
    sortOrder: Number(row.sort_order) || 0,
    options,
  };
}

/**
 * The board for a job. One round-trip per table rather than per selection.
 * Defensive: an un-migrated DB returns nothing rather than breaking the job page.
 */
export async function listSelections(supabase: SupabaseClient, accountId: string, jobId: string): Promise<Selection[]> {
  const [{ data: selectionRows, error }, { data: optionRows }] = await Promise.all([
    supabase.from('job_selections').select('*').eq('account_id', accountId).eq('job_id', jobId).order('sort_order', { ascending: true }),
    supabase.from('selection_options').select('*').eq('account_id', accountId).eq('job_id', jobId).order('sort_order', { ascending: true }),
  ]);
  if (error) return [];

  const bySelection = new Map<string, SelectionOption[]>();
  for (const row of optionRows ?? []) {
    const key = row.selection_id as string;
    bySelection.set(key, [...(bySelection.get(key) ?? []), toOption(row as Row)]);
  }
  return (selectionRows ?? []).map((row) => toSelection(row as Row, bySelection.get(row.id as string) ?? []));
}

export async function createSelection(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  input: { title: string; description?: string; allowance?: number; decideBy?: string | null; creditUnderspend?: boolean },
): Promise<Selection> {
  const { count } = await supabase
    .from('job_selections')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('job_id', jobId);

  const { data, error } = await supabase
    .from('job_selections')
    .insert({
      account_id: accountId,
      job_id: jobId,
      title: input.title.trim().slice(0, 160) || 'Choice to make',
      description: (input.description ?? '').trim().slice(0, 1000),
      allowance: Math.max(0, Number(input.allowance) || 0),
      decide_by: input.decideBy || null,
      credit_underspend: input.creditUnderspend !== false,
      sort_order: count ?? 0,
    })
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Could not add that choice.');
  return toSelection(data as Row, []);
}

/**
 * Edit a selection. Refused once a choice has been made.
 *
 * Changing the allowance under a decision somebody already took would silently
 * re-price what they agreed to — the customer picked an option knowing it was
 * "included", and it must not become "+$250" afterwards.
 */
export async function updateSelection(
  supabase: SupabaseClient,
  accountId: string,
  selectionId: string,
  input: { title?: string; description?: string; allowance?: number; decideBy?: string | null; creditUnderspend?: boolean },
): Promise<{ ok: boolean; message?: string }> {
  const { data: existing } = await supabase
    .from('job_selections')
    .select('status')
    .eq('account_id', accountId)
    .eq('id', selectionId)
    .maybeSingle();
  if (!existing) return { ok: false, message: 'That choice could not be found.' };
  if (existing.status === 'chosen') {
    return { ok: false, message: 'They have already chosen. Cancel this and add a new choice rather than changing it under them.' };
  }

  const patch: Row = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) patch.title = input.title.trim().slice(0, 160);
  if (input.description !== undefined) patch.description = input.description.trim().slice(0, 1000);
  if (input.allowance !== undefined) patch.allowance = Math.max(0, Number(input.allowance) || 0);
  if (input.decideBy !== undefined) patch.decide_by = input.decideBy || null;
  if (input.creditUnderspend !== undefined) patch.credit_underspend = input.creditUnderspend;

  const { error } = await supabase.from('job_selections').update(patch).eq('account_id', accountId).eq('id', selectionId);
  return error ? { ok: false, message: error.message } : { ok: true };
}

export async function setSelectionStatus(
  supabase: SupabaseClient,
  accountId: string,
  selectionId: string,
  status: 'open' | 'cancelled',
): Promise<void> {
  await supabase
    .from('job_selections')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', selectionId)
    // Never reopen a made decision through this path — that's what the snapshot
    // exists to protect.
    .neq('status', 'chosen');
}

export async function addOption(
  supabase: SupabaseClient,
  accountId: string,
  input: { selectionId: string; jobId: string; name: string; description?: string; price: number; reference?: string; photoPath?: string | null },
): Promise<void> {
  const { count } = await supabase
    .from('selection_options')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('selection_id', input.selectionId);

  const { error } = await supabase.from('selection_options').insert({
    account_id: accountId,
    selection_id: input.selectionId,
    job_id: input.jobId,
    name: input.name.trim().slice(0, 160) || 'Option',
    description: (input.description ?? '').trim().slice(0, 600),
    price: Math.max(0, Number(input.price) || 0),
    reference: (input.reference ?? '').trim().slice(0, 120),
    photo_path: input.photoPath ?? null,
    sort_order: count ?? 0,
  });
  if (error) throw error;
}

export async function deleteOption(supabase: SupabaseClient, accountId: string, optionId: string): Promise<{ ok: boolean; message?: string }> {
  // An option somebody already picked cannot be removed. The snapshot would keep
  // the record honest either way, but a board that shows a decision pointing at
  // nothing is a board that starts an argument rather than ending one.
  const { data: option } = await supabase
    .from('selection_options')
    .select('id, selection_id')
    .eq('account_id', accountId)
    .eq('id', optionId)
    .maybeSingle();
  if (!option) return { ok: false, message: 'That option could not be found.' };

  const { data: chosen } = await supabase
    .from('job_selections')
    .select('id')
    .eq('account_id', accountId)
    .eq('id', option.selection_id)
    .eq('chosen_option_id', optionId)
    .maybeSingle();
  if (chosen) return { ok: false, message: 'They chose this one. It stays on the record.' };

  await supabase.from('selection_options').delete().eq('account_id', accountId).eq('id', optionId);
  return { ok: true };
}

/**
 * Record the homeowner's choice.
 *
 * The snapshot is the entire point: it stores what the option SAID at this
 * moment, so a later edit to that option cannot rewrite what somebody agreed to.
 * Guarded on status = 'open' so a replayed request can't overwrite a decision
 * already made — including a different one.
 */
export async function chooseOption(
  admin: SupabaseClient,
  accountId: string,
  input: { selectionId: string; optionId: string; jobId: string; byName: string },
): Promise<{ ok: boolean; message?: string; snapshot?: ChosenSnapshot }> {
  const name = input.byName.trim().slice(0, 120);
  if (!name) return { ok: false, message: 'Type your name to confirm the choice.' };

  const { data: optionRow } = await admin
    .from('selection_options')
    .select('*')
    .eq('account_id', accountId)
    .eq('id', input.optionId)
    .maybeSingle();
  // Belongs to this selection AND this job. Without both, a valid link for one
  // job could record a choice against another customer's board.
  if (!optionRow || optionRow.selection_id !== input.selectionId || optionRow.job_id !== input.jobId) {
    return { ok: false, message: 'That option is not on this choice.' };
  }

  const snapshot = snapshotOption(toOption(optionRow as Row));
  const { data, error } = await admin
    .from('job_selections')
    .update({
      status: 'chosen',
      chosen_option_id: input.optionId,
      chosen_snapshot: snapshot,
      chosen_at: new Date().toISOString(),
      chosen_by_name: name,
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId)
    .eq('id', input.selectionId)
    .eq('job_id', input.jobId)
    .eq('status', 'open')
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: 'That choice has already been made.' };
  return { ok: true, snapshot };
}

/** Everything on a job's board, for the client-facing page. */
export async function loadClientSelections(admin: SupabaseClient, accountId: string, jobId: string): Promise<Selection[]> {
  return listSelections(admin, accountId, jobId);
}
