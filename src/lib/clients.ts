import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeUsPhone } from '@/lib/phone';

export type Client = {
  id: string;
  account_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientWithStats = Client & {
  jobCount: number;
  totalValue: number;
  lastJobAt: string | null;
};

function cleanEmail(email: string | null | undefined): string | null {
  const value = (email ?? '').trim().toLowerCase();
  return value || null;
}

// Find the existing client for this contact, or create one. Dedupe is by phone
// first (the strongest signal), then email. Returns null only when there's
// nothing to key on. Best-effort by contract — callers treat a null as "no
// client linked" rather than an error, so job creation never fails on this.
export async function findOrCreateClientId(
  supabase: SupabaseClient,
  accountId: string,
  input: { name?: string | null; phone?: string | null; email?: string | null; address?: string | null },
): Promise<string | null> {
  const name = (input.name ?? '').trim();
  const phone = input.phone ? normalizeUsPhone(input.phone) : null;
  const email = cleanEmail(input.email);
  if (!name && !phone && !email) return null;

  if (phone) {
    const { data } = await supabase.from('clients').select('id').eq('account_id', accountId).eq('phone', phone).limit(1).maybeSingle();
    if (data?.id) return data.id as string;
  }
  if (email) {
    const { data } = await supabase.from('clients').select('id').eq('account_id', accountId).eq('email', email).limit(1).maybeSingle();
    if (data?.id) return data.id as string;
  }

  const { data, error } = await supabase
    .from('clients')
    .insert({ account_id: accountId, name: name || 'Client', phone, email, address: input.address?.trim() || null })
    .select('id')
    .single();
  if (error || !data) return null;
  return data.id as string;
}

export async function listClientsWithStats(supabase: SupabaseClient, accountId: string): Promise<ClientWithStats[]> {
  const [{ data: clients }, { data: jobs }] = await Promise.all([
    supabase.from('clients').select('*').eq('account_id', accountId),
    supabase.from('jobs').select('client_id, quoted_amount, created_at').eq('account_id', accountId).not('client_id', 'is', null),
  ]);

  const stats = new Map<string, { jobCount: number; totalValue: number; lastJobAt: string | null }>();
  for (const job of jobs ?? []) {
    const key = job.client_id as string;
    const entry = stats.get(key) ?? { jobCount: 0, totalValue: 0, lastJobAt: null };
    entry.jobCount += 1;
    entry.totalValue += Number(job.quoted_amount) || 0;
    if (!entry.lastJobAt || job.created_at > entry.lastJobAt) entry.lastJobAt = job.created_at;
    stats.set(key, entry);
  }

  return (clients ?? [])
    .map((client) => {
      const entry = stats.get(client.id) ?? { jobCount: 0, totalValue: 0, lastJobAt: null };
      return { ...(client as Client), ...entry };
    })
    // Most recently active first; clients with jobs above those without.
    .sort((a, b) => {
      const aKey = a.lastJobAt ?? a.created_at;
      const bKey = b.lastJobAt ?? b.created_at;
      return bKey.localeCompare(aKey);
    });
}

export async function getClient(supabase: SupabaseClient, accountId: string, clientId: string): Promise<Client | null> {
  const { data } = await supabase.from('clients').select('*').eq('account_id', accountId).eq('id', clientId).maybeSingle();
  return (data as Client) ?? null;
}

export async function updateClient(
  supabase: SupabaseClient,
  accountId: string,
  clientId: string,
  input: { name: string; phone: string | null; email: string | null; address: string | null; notes: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('clients')
    .update({
      name: input.name.trim() || 'Client',
      phone: input.phone ? normalizeUsPhone(input.phone) : null,
      email: cleanEmail(input.email),
      address: input.address?.trim() || null,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId)
    .eq('id', clientId);
  if (error) throw error;
}
