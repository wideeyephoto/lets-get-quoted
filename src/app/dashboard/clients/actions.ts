'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import { normalizeUsPhone } from '@/lib/phone';
import { updateClient } from '@/lib/clients';
import { mergedFields } from '@/lib/client-duplicates';
import {
  parseTable,
  applyMapping,
  deterministicMapping,
  positionalMapping,
  columnLabels,
  importClients,
  type ColumnSources,
  type ColumnMapping,
  type ParsedClientRow,
} from '@/lib/client-import';
import { aiDetectColumns } from '@/lib/client-import-ai';

// Bound one import so a giant paste can't run away.
const MAX_IMPORT_ROWS = 2000;
const FIELDS: (keyof ColumnSources)[] = ['name', 'phone', 'email', 'address'];

export type ClientImportPreview =
  | { ok: false; error: 'empty' | 'norows' }
  | {
      ok: true;
      usedAi: boolean;
      hasHeader: boolean;
      sources: ColumnSources;
      columnLabels: string[];
      sampleRows: ParsedClientRow[];
      totalRows: number;
    };

// Keep only valid, in-range column indices — the confirm step sends back a
// user-editable mapping, so never trust it blind.
function sanitizeSources(raw: unknown, width: number): ColumnSources {
  const out: ColumnSources = { name: [], phone: [], email: [], address: [] };
  const obj = (raw ?? {}) as Record<string, unknown>;
  for (const field of FIELDS) {
    const arr = obj[field];
    if (Array.isArray(arr)) {
      out[field] = Array.from(
        new Set(arr.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n >= 0 && n < width)),
      );
    }
  }
  return out;
}

// Step 1: parse the upload and work out the column mapping. Tries the free
// rule-based match first, then AI, then a positional fallback — and always
// returns a preview so the owner can confirm before anything is written.
export async function analyzeClientImport(text: string): Promise<ClientImportPreview> {
  await requireOwnerContext();
  const trimmed = (text ?? '').trim();
  if (!trimmed) return { ok: false, error: 'empty' };

  const grid = parseTable(trimmed);
  if (grid.length === 0) return { ok: false, error: 'norows' };

  let usedAi = false;
  let mapping: ColumnMapping | null = deterministicMapping(grid);
  if (!mapping) {
    mapping = await aiDetectColumns(grid);
    if (mapping) usedAi = true;
  }
  if (!mapping) mapping = positionalMapping(grid);

  const rows = applyMapping(grid, mapping);
  if (rows.length === 0) return { ok: false, error: 'norows' };

  return {
    ok: true,
    usedAi,
    hasHeader: mapping.hasHeader,
    sources: mapping.sources,
    columnLabels: columnLabels(grid, mapping.hasHeader),
    sampleRows: rows.slice(0, 6),
    totalRows: rows.length,
  };
}

// Re-apply an (optionally user-edited) mapping without any AI — powers the live
// preview when the owner reassigns a column in the confirm step.
export async function previewClientImport(
  text: string,
  sources: ColumnSources,
  hasHeader: boolean,
): Promise<{ sampleRows: ParsedClientRow[]; totalRows: number }> {
  await requireOwnerContext();
  const grid = parseTable((text ?? '').trim());
  const width = grid.reduce((max, r) => Math.max(max, r.length), 0);
  const rows = applyMapping(grid, { hasHeader, sources: sanitizeSources(sources, width) });
  return { sampleRows: rows.slice(0, 6), totalRows: rows.length };
}

// Step 2: import with the confirmed mapping. Dedupe against existing clients
// (phone then email) still happens inside importClients, so re-importing is safe.
export async function commitClientImport(
  text: string,
  sources: ColumnSources,
  hasHeader: boolean,
): Promise<{ imported: number; duplicates: number; skipped: number; error?: 'norows' }> {
  const { supabase, accountId } = await requireOwnerContext();
  const grid = parseTable((text ?? '').trim());
  const width = grid.reduce((max, r) => Math.max(max, r.length), 0);
  const rows = applyMapping(grid, { hasHeader, sources: sanitizeSources(sources, width) }).slice(0, MAX_IMPORT_ROWS);
  if (rows.length === 0) return { imported: 0, duplicates: 0, skipped: 0, error: 'norows' };

  const result = await importClients(supabase, accountId, rows);
  revalidatePath('/dashboard/clients');
  return result;
}

function optionalText(value: FormDataEntryValue | null): string | null {
  const text = (value ?? '').toString().trim();
  return text.length > 0 ? text : null;
}

/**
 * Store a phone the way the rest of the system expects to find one.
 *
 * Creating a client normalizes to E.164; editing one did not, so an edit saved
 * whatever was typed. That matters more than tidiness: the duplicate check on
 * create is `.eq('phone', normalizeUsPhone(typed))`, so a client whose number
 * had been left as "(248) 555-0117" by an edit could never be matched again and
 * the next booking from that number made a second client record.
 *
 * Unparseable input is KEPT rather than dropped. Create nulls it, which is
 * defensible for a new row; silently erasing a number somebody already had —
 * an extension, an international line — because we could not parse it is not.
 */
function normalizedPhone(value: FormDataEntryValue | null): string | null {
  const typed = optionalText(value);
  if (!typed) return null;
  return normalizeUsPhone(typed) ?? typed;
}

export async function updateClientAction(clientId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  await updateClient(supabase, accountId, clientId, {
    name: (formData.get('name') ?? '').toString().trim() || 'Client',
    phone: normalizedPhone(formData.get('phone')),
    email: optionalText(formData.get('email')),
    address: optionalText(formData.get('address')),
    notes: optionalText(formData.get('notes')),
  });

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath('/dashboard/clients');
}

// Creates a customer by hand, from the Clients page.
//
// Until now a client only ever appeared as a side effect of a job or an import,
// which meant the one thing you'd expect a customer list to do — add a customer —
// couldn't be done from it.
//
// Dedupe is deliberate and matches findOrCreateClientId: phone first, then
// email. Adding somebody who is already in the book returns their existing
// profile rather than creating a second copy, because two half-filled records
// for the same person is exactly what a customer list is supposed to prevent.
export async function createClientAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const name = String(formData.get('name') ?? '').trim().slice(0, 160);
  if (!name) throw new Error('A customer needs a name.');

  const phoneRaw = String(formData.get('phone') ?? '').trim();
  const phone = phoneRaw ? normalizeUsPhone(phoneRaw) : null;
  const email = String(formData.get('email') ?? '').trim().toLowerCase() || null;
  const address = String(formData.get('address') ?? '').trim().slice(0, 300) || null;
  const notes = String(formData.get('notes') ?? '').trim().slice(0, 2000) || null;

  // Same keys, same order as the automatic path.
  let existingId: string | null = null;
  if (phone) {
    const { data } = await supabase.from('clients').select('id').eq('account_id', accountId).eq('phone', phone).limit(1).maybeSingle();
    existingId = (data?.id as string) ?? null;
  }
  if (!existingId && email) {
    const { data } = await supabase.from('clients').select('id').eq('account_id', accountId).eq('email', email).limit(1).maybeSingle();
    existingId = (data?.id as string) ?? null;
  }

  if (existingId) {
    revalidatePath('/dashboard/clients');
    redirect(`/dashboard/clients/${existingId}?existing=1`);
  }

  const { data, error } = await supabase
    .from('clients')
    .insert({ account_id: accountId, name, phone, email, address, notes })
    .select('id')
    .single();
  if (error || !data) throw new Error('Could not save that customer.');

  revalidatePath('/dashboard/clients');
  redirect(`/dashboard/clients/${data.id as string}?created=1`);
}

/**
 * Fold duplicate customer records into one.
 *
 * WHAT MOVES. Four tables carry a client_id — jobs, leads, recurring_plans and
 * extra_stop_requests (see schema.sql). Every one is repointed at the survivor
 * before the duplicates are deleted, so nothing is orphaned. All four writes
 * are scoped by account_id as well as by client id: the ids arrive from a form,
 * and an id belonging to another account must not be reachable even if one were
 * guessed.
 *
 * WHAT DOES NOT MOVE. jobs.client_name / client_phone / client_email are a
 * per-job SNAPSHOT of who the customer was when that job was written, and they
 * stay exactly as they are. Rewriting them would edit history to match a
 * decision made today, and the invoice a customer already has in their inbox
 * would stop matching the job it came from.
 *
 * WHY IT FILLS ONLY BLANKS. mergedFields never overwrites a value somebody
 * typed with a different value somebody typed. Where two records genuinely
 * disagree, the survivor's own value stands and the discarded one is appended
 * to the notes — losing a customer's real phone number to a merge would make
 * this feature worse than the duplicates it cleans up.
 *
 * NOT UNDOABLE, so the UI asks first.
 */
export async function mergeClientsAction(formData: FormData): Promise<void> {
  const { supabase, accountId } = await requireOwnerContext();

  const survivorId = String(formData.get('survivorId') ?? '').trim();
  const duplicateIds = formData
    .getAll('duplicateId')
    .map((value) => String(value).trim())
    .filter((id) => id && id !== survivorId);

  if (!survivorId || duplicateIds.length === 0) return;

  // Read them back rather than trusting the form's copy of the fields: the page
  // may have been open a while, and the merge should combine what is in the
  // book NOW.
  const { data: rows } = await supabase
    .from('clients')
    .select('id, name, phone, email, address, notes, created_at')
    .eq('account_id', accountId)
    .in('id', [survivorId, ...duplicateIds]);

  const found = (rows ?? []) as {
    id: string; name: string; phone: string | null; email: string | null;
    address: string | null; notes: string | null; created_at: string;
  }[];
  const survivor = found.find((row) => row.id === survivorId);
  // Only what this account actually owns — anything else silently drops out.
  const others = found.filter((row) => row.id !== survivorId);
  if (!survivor || others.length === 0) return;

  const merged = mergedFields(survivor, others);

  // A disagreement is recorded, not resolved. The owner can read it and decide.
  const noteParts = [
    (survivor.notes ?? '').trim(),
    ...others.map((other) => (other.notes ?? '').trim()).filter(Boolean),
    merged.conflicts.length > 0
      ? `Merged ${others.length} duplicate record${others.length === 1 ? '' : 's'}. ${merged.conflicts.join('; ')}.`
      : `Merged ${others.length} duplicate record${others.length === 1 ? '' : 's'}.`,
  ].filter(Boolean);

  await supabase
    .from('clients')
    .update({
      name: merged.name,
      phone: merged.phone,
      email: merged.email,
      address: merged.address,
      notes: noteParts.join('\n\n').slice(0, 4000),
    })
    .eq('account_id', accountId)
    .eq('id', survivorId);

  const loserIds = others.map((row) => row.id);
  // Sequential, not concurrent. If one of these fails the ones before it have
  // already landed, and a client whose jobs moved but whose leads did not is
  // recoverable by merging again; a partially-applied concurrent batch with the
  // delete already through is not.
  for (const table of ['jobs', 'leads', 'recurring_plans', 'extra_stop_requests'] as const) {
    const { error } = await supabase
      .from(table)
      .update({ client_id: survivorId })
      .eq('account_id', accountId)
      .in('client_id', loserIds);
    // A table that does not exist yet on an older database must not take the
    // whole merge down with it — the rest still moves and the delete is skipped.
    if (error) throw new Error(`Could not move ${table} onto the surviving customer.`);
  }

  await supabase.from('clients').delete().eq('account_id', accountId).in('id', loserIds);

  revalidatePath('/dashboard/clients');
  revalidatePath(`/dashboard/clients/${survivorId}`);
  redirect(`/dashboard/clients/${survivorId}?merged=${loserIds.length}`);
}
