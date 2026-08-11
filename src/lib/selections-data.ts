import type { SupabaseClient } from '@supabase/supabase-js';
import {
  boardToTemplate,
  optionCost,
  parseTemplateBody,
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
  type SelectionTemplateBody,
} from '@/lib/selections';
import { createJobPhotoLinks } from '@/lib/job-photo-storage';

type Row = Record<string, unknown>;

/**
 * When anything about this board last went to the customer.
 *
 * Read from the job feed rather than from a column on the choices, because
 * there are now two senders — the contractor's own "Send these to them" and the
 * scheduled reminder — and both already write a `selection_requested` event.
 *
 * It used to be the newest of job_selections.chase_sent_at / overdue_sent_at,
 * which was wrong in both directions: the manual button stamped those columns
 * (suppressing the first scheduled reminder for every dated choice on the job),
 * and nothing else could ever appear there. Now the sweep owns its own ledger
 * and stamps nothing on the choice, so reading those columns would report a
 * board that had been reminded about twice as never sent at all.
 *
 * Tolerant of a read failure: "we cannot tell you when" is the honest answer,
 * and it is not worth failing the job page over.
 */
export async function lastSelectionSendAt(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('job_feed')
    .select('created_at')
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .eq('kind', 'selection_requested')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data?.created_at as string | null) ?? null;
}

/**
 * A needed-by date moved, was cleared, or the choice it belonged to went away.
 * Fix what has not gone out yet.
 *
 * Cancels every PENDING row in the reminder ledger for this job whose needed-by
 * date no longer corresponds to a date some open choice actually carries. SENT
 * rows are never touched — they are the record of a message a homeowner really
 * received, and rewriting history to match a new deadline would make the job
 * feed lie about what somebody was told.
 *
 * Lives here rather than in the sweep because this is the moment it matters:
 * between an edit and the next hourly run is exactly the window in which a
 * customer gets chased about a deadline that no longer exists. The sweep would
 * eventually stop chasing on its own — its plan is derived from the live choices
 * — but "eventually" is up to an hour of texts nobody meant to send, and a
 * pending row abandoned by a crashed run would block its stage indefinitely.
 *
 * Tolerant of a pre-migration database: no table, nothing to cancel.
 */
export async function resyncChoiceReminders(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
): Promise<{ cancelled: number }> {
  const { data: choices, error } = await supabase
    .from('job_selections')
    .select('decide_by, status')
    .eq('account_id', accountId)
    .eq('job_id', jobId);
  if (error) return { cancelled: 0 };

  const live = new Set(
    (choices ?? [])
      .filter((choice) => choice.status === 'open' && choice.decide_by)
      .map((choice) => String(choice.decide_by)),
  );

  const { data: pending, error: ledgerError } = await supabase
    .from('selection_reminders')
    .select('id, needed_by')
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .eq('status', 'pending');
  if (ledgerError) return { cancelled: 0 };

  const stale = (pending ?? []).filter((row) => !live.has(String(row.needed_by))).map((row) => row.id as string);
  if (stale.length === 0) return { cancelled: 0 };

  await supabase
    .from('selection_reminders')
    .update({ status: 'cancelled', failure_reason: 'needed_by_changed', updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .in('id', stale);

  return { cancelled: stale.length };
}

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
    chaseSentAt: (row.chase_sent_at as string | null) ?? null,
    overdueSentAt: (row.overdue_sent_at as string | null) ?? null,
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
    .select('status, job_id, decide_by')
    .eq('account_id', accountId)
    .eq('id', selectionId)
    .maybeSingle();
  if (!existing) return { ok: false, message: 'That choice could not be found.' };
  if (existing.status === 'chosen') {
    return { ok: false, message: 'They have already chosen. Cancel this and add a new choice rather than changing it under them.' };
  }

  // Read BEFORE the write. Comparing against `existing` afterwards would be
  // asking a row whether it used to be different, and the answer depends on
  // whether the client handed back a copy or a live reference.
  const dateChanged =
    input.decideBy !== undefined && (input.decideBy || null) !== ((existing.decide_by as string | null) ?? null);

  const patch: Row = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) patch.title = input.title.trim().slice(0, 160);
  if (input.description !== undefined) patch.description = input.description.trim().slice(0, 1000);
  if (input.allowance !== undefined) patch.allowance = Math.max(0, Number(input.allowance) || 0);
  if (input.decideBy !== undefined) patch.decide_by = input.decideBy || null;
  if (input.creditUnderspend !== undefined) patch.credit_underspend = input.creditUnderspend;

  const { error } = await supabase.from('job_selections').update(patch).eq('account_id', accountId).eq('id', selectionId);
  if (error) return { ok: false, message: error.message };

  // MOVING THE DATE MOVES THE REMINDERS. A needed-by date is the entire schedule
  // for this choice, so changing or clearing it invalidates anything not yet
  // sent for the old one — and the window between this edit and the next hourly
  // sweep is exactly when a homeowner would otherwise be chased about a deadline
  // that no longer exists. Already-SENT reminders are untouched: they are a
  // record of a message somebody really received.
  //
  // Best-effort. A resync that fails must not fail the edit — the sweep's own
  // claim key includes needed_by, so a stale pending row can at worst delay one
  // reminder, while a refused edit loses the contractor's work.
  if (dateChanged) {
    await resyncChoiceReminders(supabase, accountId, existing.job_id as string).catch(() => ({ cancelled: 0 }));
  }

  return { ok: true };
}

export async function setSelectionStatus(
  supabase: SupabaseClient,
  accountId: string,
  selectionId: string,
  status: 'open' | 'cancelled',
): Promise<void> {
  const { data: existing } = await supabase
    .from('job_selections')
    .select('job_id')
    .eq('account_id', accountId)
    .eq('id', selectionId)
    .maybeSingle();

  await supabase
    .from('job_selections')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', selectionId)
    // Never reopen a made decision through this path — that's what the snapshot
    // exists to protect.
    .neq('status', 'chosen');

  // Taking a choice off the table is one of the automatic stops. If it was the
  // last one carrying its needed-by date, the reminder queued against that date
  // is now about nothing.
  if (existing?.job_id) {
    await resyncChoiceReminders(supabase, accountId, existing.job_id as string).catch(() => ({ cancelled: 0 }));
  }
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

/**
 * Signed photo URLs for the OWNER's board, keyed by option id.
 *
 * The homeowner saw pictures and the contractor saw a text list, so the two
 * were not looking at the same thing — which is a strange way to run a feature
 * whose entire purpose is that both parties agree on what was picked.
 *
 * Best effort, exactly like the client side: a photo that won't sign becomes no
 * photo, which is a plainer board and not a broken one.
 */
export async function signSelectionPhotos(accountId: string, selections: Selection[]): Promise<Record<string, string>> {
  const byOption = new Map<string, string>();
  for (const selection of selections) {
    for (const option of selection.options) {
      if (option.photoPath) byOption.set(option.id, option.photoPath);
    }
  }
  if (byOption.size === 0) return {};

  try {
    const links = await createJobPhotoLinks(accountId, [...new Set(byOption.values())]);
    const byPath = new Map(links.map((link) => [link.path, link.url]));
    const signed: Record<string, string> = {};
    for (const [optionId, path] of byOption) {
      const url = byPath.get(path);
      if (url) signed[optionId] = url;
    }
    return signed;
  } catch (error) {
    console.error('Selection photo signing failed:', error instanceof Error ? error.message : error);
    return {};
  }
}

/**
 * Move a choice up or down the board.
 *
 * Swaps sort_order with its neighbour rather than renumbering everything: two
 * writes instead of N, and a failure halfway leaves the board in an order
 * somebody chose rather than a jumble.
 *
 * Up/down rather than drag. The board is a column of cards a contractor edits
 * with one hand on a phone in a van, and drag is the interaction that fails
 * there.
 */
export async function moveSelection(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  selectionId: string,
  direction: 'up' | 'down',
): Promise<void> {
  const selections = (await listSelections(supabase, accountId, jobId)).filter((s) => s.status !== 'cancelled');
  const index = selections.findIndex((selection) => selection.id === selectionId);
  if (index < 0) return;
  const swapWith = direction === 'up' ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= selections.length) return;

  const a = selections[index];
  const b = selections[swapWith];
  // Positions rather than the stored numbers: legacy rows can share a
  // sort_order, and swapping two identical values changes nothing at all.
  await supabase.from('job_selections').update({ sort_order: swapWith }).eq('account_id', accountId).eq('id', a.id);
  await supabase.from('job_selections').update({ sort_order: index }).eq('account_id', accountId).eq('id', b.id);
}

// -- Templates ----------------------------------------------------------------

export type SelectionTemplate = { id: string; name: string; body: SelectionTemplateBody };

/**
 * The account's saved boards. Empty (and harmless) until the migration runs —
 * a missing table must not take the job page down with it.
 */
export async function listSelectionTemplates(supabase: SupabaseClient, accountId: string): Promise<SelectionTemplate[]> {
  try {
    const { data, error } = await supabase
      .from('selection_templates')
      .select('id, name, body')
      .eq('account_id', accountId)
      .order('name', { ascending: true })
      .limit(50);
    if (error) return [];
    return (data ?? []).map((row) => ({
      id: row.id as string,
      name: (row.name as string) ?? '',
      body: parseTemplateBody(row.body),
    }));
  } catch {
    return [];
  }
}

/**
 * Save this board for next time.
 *
 * Upserts on the name, because "save this as Interior repaint" said a second
 * time means replace it — a list with three Interior repaints in it is a list
 * nobody trusts to pick from.
 */
export async function saveBoardAsTemplate(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  name: string,
): Promise<{ ok: boolean; message?: string }> {
  const clean = name.trim().slice(0, 80);
  if (!clean) return { ok: false, message: 'Give the template a name you will recognize later.' };

  const selections = await listSelections(supabase, accountId, jobId);
  const body = boardToTemplate(selections);
  if (body.items.length === 0) return { ok: false, message: 'There is nothing on this board to save yet.' };

  // Read-then-write rather than upsert: the unique index is on
  // (account_id, lower(name)) so that "Interior repaint" and "Interior Repaint"
  // are the same template, and an expression index cannot be an ON CONFLICT
  // target — PostgREST's onConflict only takes column names, and passing
  // 'account_id,name' fails with "no unique or exclusion constraint matching".
  //
  // The race this leaves open (two saves of a new name at once) surfaces as the
  // 23505 handled below, which is the correct answer anyway.
  // % and _ are wildcards to ilike, so a template named "50% off" would match
  // half the list. Escaped rather than avoided, because ilike is the only
  // case-insensitive comparison PostgREST offers.
  const pattern = clean.replace(/([\\%_])/g, '\\$1');
  const { data: existing } = await supabase
    .from('selection_templates')
    .select('id')
    .eq('account_id', accountId)
    .ilike('name', pattern)
    .maybeSingle();

  const now = new Date().toISOString();
  const { error } = existing
    ? await supabase.from('selection_templates').update({ name: clean, body, updated_at: now }).eq('account_id', accountId).eq('id', existing.id)
    : await supabase.from('selection_templates').insert({ account_id: accountId, name: clean, body, updated_at: now });

  if (error) {
    return error.code === '23505'
      ? { ok: false, message: `You already have a template called “${clean}”.` }
      : { ok: false, message: error.message };
  }
  return { ok: true };
}

/**
 * Start a board from a saved one.
 *
 * ADDS to whatever is already there rather than replacing it — a contractor who
 * applies a template to a board mid-build should not lose the rows they typed,
 * and "it wiped my work" is not a mistake anybody forgives twice.
 *
 * No needed-by dates: those belong to the job and the contractor sets them.
 */
export async function applyTemplate(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  templateId: string,
): Promise<{ ok: boolean; added: number; message?: string }> {
  const { data: row } = await supabase
    .from('selection_templates')
    .select('id, body')
    .eq('account_id', accountId)
    .eq('id', templateId)
    .maybeSingle();
  if (!row) return { ok: false, added: 0, message: 'That template could not be found.' };

  const body = parseTemplateBody(row.body);
  if (body.items.length === 0) return { ok: false, added: 0, message: 'That template is empty.' };

  let added = 0;
  for (const item of body.items) {
    const selection = await createSelection(supabase, accountId, jobId, {
      title: item.title,
      description: item.description,
      allowance: item.allowance,
      decideBy: null,
      creditUnderspend: item.creditUnderspend,
    });
    for (const option of item.options) {
      await addOption(supabase, accountId, {
        selectionId: selection.id,
        jobId,
        name: option.name,
        description: option.description,
        price: option.price,
        reference: option.reference,
        photoPath: option.photoPath,
      });
    }
    added += 1;
  }
  return { ok: true, added };
}

export async function deleteSelectionTemplate(supabase: SupabaseClient, accountId: string, templateId: string): Promise<void> {
  await supabase.from('selection_templates').delete().eq('account_id', accountId).eq('id', templateId);
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
