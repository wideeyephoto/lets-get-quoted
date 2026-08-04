import type { SupabaseClient } from '@supabase/supabase-js';
import {
  optionCost,
  reopenAdjustment,
  snapshotOption,
  toClientSelections,
  toPreviousChoice,
  type ChosenSnapshot,
  type ClientSelection,
  type PreviousChoice,
  type Selection,
  type SelectionOption,
  type SelectionStatus,
} from '@/lib/selections';
import { createJobPhotoLinks } from '@/lib/job-photo-storage';

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
    // Absent on a pre-migration row, and an array is the only shape the rest of
    // the code will accept — a bare null here would crash every board.
    reopened: Array.isArray(row.reopened) ? (row.reopened as PreviousChoice[]) : [],
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

/**
 * Fix an option — a typo'd product code, a price that came back different.
 *
 * Refused on the one they chose, exactly like deleteOption. The snapshot keeps
 * the agreement honest either way, but "the thing you picked" changing name or
 * price under the same row is how a record stops being trusted. Reopen the
 * decision if it genuinely has to change.
 */
export async function updateOption(
  supabase: SupabaseClient,
  accountId: string,
  optionId: string,
  input: { name?: string; description?: string; price?: number; reference?: string },
): Promise<{ ok: boolean; message?: string }> {
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
  if (chosen) return { ok: false, message: 'They chose this one. Reopen the choice first if it has to change.' };

  const patch: Row = {};
  if (input.name !== undefined) patch.name = input.name.trim().slice(0, 160) || 'Option';
  if (input.description !== undefined) patch.description = input.description.trim().slice(0, 600);
  if (input.price !== undefined) patch.price = Math.max(0, Number(input.price) || 0);
  if (input.reference !== undefined) patch.reference = input.reference.trim().slice(0, 120);
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await supabase.from('selection_options').update(patch).eq('account_id', accountId).eq('id', optionId);
  return error ? { ok: false, message: error.message } : { ok: true };
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

  // The choice moves the price of the job, because that is what the customer
  // just agreed to. Done here rather than derived at read time so every existing
  // reader — invoices, margin, the client's own total — sees the new number
  // without knowing selections exist.
  //
  // A credit moves it DOWN. That is not a bug: picking under the allowance is
  // meant to give the money back, and a job total that only ever goes up would
  // quietly pocket the difference.
  try {
    const { data: selectionRow } = await admin
      .from('job_selections')
      .select('allowance, credit_underspend')
      .eq('account_id', accountId)
      .eq('id', input.selectionId)
      .maybeSingle();
    const net = optionCost(
      { price: snapshot.price },
      { allowance: Number(selectionRow?.allowance) || 0, creditUnderspend: selectionRow?.credit_underspend !== false },
    ).net;

    await moveJobTotal(admin, accountId, input.jobId, net);
  } catch (error) {
    // The decision is recorded either way. A job total that didn't move is a
    // visible, fixable problem; losing the choice would not be.
    console.error('Selection job total update failed:', error instanceof Error ? error.message : error);
  }

  return { ok: true, snapshot };
}

/**
 * Move the job total, never below zero.
 *
 * Shared by choosing and reopening so the two can't drift: whatever a decision
 * added, undoing it takes off. A stack of credits bigger than the quote means
 * somebody has mis-set an allowance, and a negative job total is a worse way to
 * find that out than a zero one.
 */
async function moveJobTotal(admin: SupabaseClient, accountId: string, jobId: string, delta: number): Promise<void> {
  if (!delta) return;
  const { data: job } = await admin.from('jobs').select('quoted_amount').eq('id', jobId).maybeSingle();
  const updated = Math.max(0, Math.round(((Number(job?.quoted_amount) || 0) + delta) * 100) / 100);
  await admin.from('jobs').update({ quoted_amount: updated }).eq('account_id', accountId).eq('id', jobId);
}

/**
 * Put a made decision back on the table.
 *
 * Homeowners change their mind, usually within the hour and usually before
 * anything is ordered. Without this the only fix was a database edit, because
 * every other path refuses to touch a chosen selection — and the job total had
 * already moved.
 *
 * What they first chose is APPENDED to the history rather than dropped. The
 * record is the entire reason this feature exists; "they picked the beige, then
 * changed to the grey on the 14th" is exactly the history worth keeping, and it
 * is also the contractor's evidence if the paint is already on the wall.
 */
export async function reopenSelection(
  supabase: SupabaseClient,
  accountId: string,
  selectionId: string,
  reason: string,
): Promise<{ ok: boolean; message?: string }> {
  const { data: row } = await supabase
    .from('job_selections')
    .select('id, job_id, status, allowance, credit_underspend, chosen_snapshot, chosen_at, chosen_by_name, reopened')
    .eq('account_id', accountId)
    .eq('id', selectionId)
    .maybeSingle();
  if (!row) return { ok: false, message: 'That choice could not be found.' };
  if (row.status !== 'chosen') return { ok: false, message: 'Nothing has been chosen on this one yet.' };

  const selection = {
    allowance: Number(row.allowance) || 0,
    creditUnderspend: row.credit_underspend !== false,
    chosenSnapshot: (row.chosen_snapshot as ChosenSnapshot | null) ?? null,
    chosenAt: (row.chosen_at as string | null) ?? null,
    chosenByName: (row.chosen_by_name as string | null) ?? null,
  };
  const previous = toPreviousChoice(selection, reason);
  const history = Array.isArray(row.reopened) ? (row.reopened as PreviousChoice[]) : [];

  // Guarded on status so a double-submit cannot reverse the price twice.
  const { data: updated, error } = await supabase
    .from('job_selections')
    .update({
      status: 'open',
      chosen_option_id: null,
      chosen_snapshot: null,
      chosen_at: null,
      chosen_by_name: null,
      reopened: previous ? [...history, previous] : history,
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId)
    .eq('id', selectionId)
    .eq('status', 'chosen')
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, message: error.message };
  if (!updated) return { ok: false, message: 'That choice has already been reopened.' };

  // AFTER the status flip, and only if it took. Reversing first would leave a
  // job repriced for a decision still standing if the update then lost the race.
  try {
    await moveJobTotal(supabase, accountId, row.job_id as string, reopenAdjustment(selection));
  } catch (error) {
    console.error('Selection reopen total update failed:', error instanceof Error ? error.message : error);
  }

  return { ok: true };
}

/** Everything on a job's board, for the client-facing page. */
export async function loadClientSelections(admin: SupabaseClient, accountId: string, jobId: string): Promise<Selection[]> {
  return listSelections(admin, accountId, jobId);
}

/**
 * The client view with its photos signed.
 *
 * The job-photos bucket is private, so a raw path renders as a broken image in
 * front of a customer. Signing happens here rather than in the pure module
 * because it needs storage and a network call.
 *
 * Best effort: a photo that won't sign becomes no photo, which is a worse-looking
 * option list but a working page.
 */
export async function toSignedClientSelections(
  admin: SupabaseClient,
  accountId: string,
  selections: Selection[],
): Promise<ClientSelection[]> {
  const client = toClientSelections(selections);

  const paths = new Map<string, string>();
  for (const selection of selections) {
    for (const option of selection.options) {
      if (option.photoPath) paths.set(option.id, option.photoPath);
    }
  }
  if (paths.size === 0) return client;

  const signed = new Map<string, string>();
  try {
    const links = await createJobPhotoLinks(accountId, [...new Set(paths.values())]);
    const byPath = new Map(links.map((link) => [link.path, link.url]));
    for (const [optionId, path] of paths) {
      const url = byPath.get(path);
      if (url) signed.set(optionId, url);
    }
  } catch (error) {
    console.error('Selection photo signing failed:', error instanceof Error ? error.message : error);
  }

  return client.map((selection) => ({
    ...selection,
    options: selection.options.map((option) => ({ ...option, photoUrl: signed.get(option.id) ?? null })),
  }));
}
