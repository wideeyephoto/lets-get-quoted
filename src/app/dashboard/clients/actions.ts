'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import { normalizeUsPhone } from '@/lib/phone';
import { updateClient } from '@/lib/clients';
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

export async function updateClientAction(clientId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  await updateClient(supabase, accountId, clientId, {
    name: (formData.get('name') ?? '').toString().trim() || 'Client',
    phone: optionalText(formData.get('phone')),
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
