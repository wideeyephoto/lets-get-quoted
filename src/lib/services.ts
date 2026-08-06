import type { SupabaseClient } from '@supabase/supabase-js';

export type Service = {
  id: string;
  account_id: string;
  name: string;
  description: string | null;
  unit_price: number;
  /**
   * What this line costs YOU. Nullable and with no default on purpose: a
   * missing cost is UNKNOWN, not zero. Defaulting it to 0 would show every
   * un-costed line at a perfect 100% margin — wrong and flattering at the same
   * time, which is exactly how a bad number gets believed.
   */
  unit_cost: number | null;
  unit: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

// Units a price-book service can be sold in. 'each'/'job'/'visit' are flat;
// 'hour'/'sqft' are per-unit (the owner multiplies when they use it).
export const SERVICE_UNITS = ['each', 'hour', 'sqft', 'visit', 'job'] as const;
export type ServiceUnit = (typeof SERVICE_UNITS)[number];

export type ServiceInput = {
  name: string;
  description?: string | null;
  unitPrice: number;
  /** undefined = leave alone; null = explicitly unknown; a number = the cost. */
  unitCost?: number | null;
  unit?: string;
};

function cleanUnit(unit: string | null | undefined): string {
  const value = (unit ?? '').trim().toLowerCase();
  return (SERVICE_UNITS as readonly string[]).includes(value) ? value : 'each';
}

/**
 * An empty cost field means "I don't know", and that has to survive the trip to
 * the database as NULL. Coercing '' through Number() gives 0, which the margin
 * code would then read as a real, free-to-deliver line.
 */
function cleanUnitCost(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

// The account's price book. Defensive: an un-migrated DB (no services table)
// degrades to an empty list rather than throwing, so the quote builder and
// recurring form still render.
export async function listServices(
  supabase: SupabaseClient,
  accountId: string,
  options?: { activeOnly?: boolean },
): Promise<Service[]> {
  let query = supabase
    .from('services')
    .select('*')
    .eq('account_id', accountId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (options?.activeOnly) query = query.eq('active', true);

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as Service[];
}

export async function createService(supabase: SupabaseClient, accountId: string, input: ServiceInput): Promise<Service> {
  const { data, error } = await supabase
    .from('services')
    .insert({
      account_id: accountId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      unit_price: Math.max(0, Math.round((Number(input.unitPrice) || 0) * 100) / 100),
      unit_cost: cleanUnitCost(input.unitCost),
      unit: cleanUnit(input.unit),
    })
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Unable to add the service.');
  return data as Service;
}

export async function updateService(supabase: SupabaseClient, accountId: string, serviceId: string, input: ServiceInput): Promise<Service> {
  const { data, error } = await supabase
    .from('services')
    .update({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      unit_price: Math.max(0, Math.round((Number(input.unitPrice) || 0) * 100) / 100),
      // Only written when the caller actually said something about it. An
      // `undefined` here means "this form doesn't edit cost", and writing NULL
      // for it would erase a figure the owner entered on a different screen.
      ...(input.unitCost === undefined ? {} : { unit_cost: cleanUnitCost(input.unitCost) }),
      unit: cleanUnit(input.unit),
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId)
    .eq('id', serviceId)
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Unable to update the service.');
  return data as Service;
}

export async function setServiceActive(supabase: SupabaseClient, accountId: string, serviceId: string, active: boolean): Promise<void> {
  const { error } = await supabase
    .from('services')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', serviceId);
  if (error) throw error;
}

export async function deleteService(supabase: SupabaseClient, accountId: string, serviceId: string): Promise<void> {
  const { error } = await supabase.from('services').delete().eq('account_id', accountId).eq('id', serviceId);
  if (error) throw error;
}

const DAY = 24 * 60 * 60 * 1000;

// Days since the newest active service was added — the signal for "you just
// expanded what you offer, tell people." Null when there's nothing active to
// announce, so a caller never has to invent an age for an empty price book.
export function mostRecentServiceAgeDays(services: Service[]): number | null {
  const active = services.filter((service) => service.active);
  if (active.length === 0) return null;
  const newest = active.reduce((latest, service) => Math.max(latest, new Date(service.created_at).getTime()), 0);
  return Math.max(0, Math.floor((Date.now() - newest) / DAY));
}

export type ServiceImportRow = { name: string | null; description: string | null; unitPrice: number; unit: string | null };

// Bulk-import price-book services, deduped by name (case-insensitive) against
// existing services AND within the file, so a re-import is safe. New rows sort
// after the current book. A row with no name can't be keyed, so it's skipped.
export async function importServices(
  supabase: SupabaseClient,
  accountId: string,
  rows: ServiceImportRow[],
): Promise<{ imported: number; duplicates: number; skipped: number }> {
  const { data: existing } = await supabase.from('services').select('name, sort_order').eq('account_id', accountId);
  const seen = new Set<string>();
  let maxSort = 0;
  for (const s of existing ?? []) {
    if (s.name) seen.add(String(s.name).trim().toLowerCase());
    maxSort = Math.max(maxSort, Number(s.sort_order) || 0);
  }

  const toInsert: Array<{ account_id: string; name: string; description: string | null; unit_price: number; unit: string; sort_order: number }> = [];
  let duplicates = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = (row.name ?? '').trim();
    if (!name) {
      skipped += 1;
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    toInsert.push({
      account_id: accountId,
      name,
      description: row.description?.trim() || null,
      unit_price: Math.max(0, Math.round((Number(row.unitPrice) || 0) * 100) / 100),
      unit: cleanUnit(row.unit),
      sort_order: (maxSort += 1),
    });
  }

  let imported = 0;
  for (let i = 0; i < toInsert.length; i += 500) {
    const chunk = toInsert.slice(i, i + 500);
    const { data, error } = await supabase.from('services').insert(chunk).select('id');
    if (error) {
      console.error('Service import chunk failed:', error.message);
      skipped += chunk.length;
    } else {
      imported += (data ?? []).length;
    }
  }

  return { imported, duplicates, skipped };
}
