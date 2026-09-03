'use server';

import { revalidatePath } from 'next/cache';
import { requireOfficeContext } from '@/lib/auth';
import {
  addWaitlistEntry,
  cancelWaitlistOffer,
  createAndSendWaitlistOffer,
  expireHoldsAndCascade,
  findCandidatesForOpenedWindow,
  removeWaitlistEntry,
  resolveWaitlistOfferReply,
  updateWaitlistEntry,
  type CreateWaitlistInput,
} from '@/lib/cancellation-waitlist-data';
import type {
  OpenedSlotWindow,
  RankedWaitlistCandidate,
  WaitlistOffer,
  WaitlistStatus,
} from '@/lib/cancellation-waitlist';

export async function addWaitlistEntryAction(input: CreateWaitlistInput) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const entry = await addWaitlistEntry(supabase, accountId, input);
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/waitlist');
  return { ok: true, entry };
}

export async function updateWaitlistEntryAction(
  id: string,
  updates: Partial<CreateWaitlistInput> & { status?: WaitlistStatus },
) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const entry = await updateWaitlistEntry(supabase, accountId, id, updates);
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/waitlist');
  return { ok: true, entry };
}

export async function removeWaitlistEntryAction(id: string) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  await removeWaitlistEntry(supabase, accountId, id);
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/waitlist');
  return { ok: true };
}

export async function findCandidatesAction(slot: OpenedSlotWindow): Promise<RankedWaitlistCandidate[]> {
  const { supabase, accountId } = await requireOfficeContext('schedule.read');
  return findCandidatesForOpenedWindow(supabase, accountId, slot);
}

export async function sendWaitlistOfferAction(input: {
  waitlistEntryId: string;
  slot: OpenedSlotWindow;
  rank: number;
  score: RankedWaitlistCandidate['score'];
  holdMinutes?: number;
  customBody?: string;
  autoCascade?: boolean;
}) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const offer = await createAndSendWaitlistOffer(supabase, accountId, input);
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/waitlist');
  return { ok: true, offer };
}

export async function cancelWaitlistOfferAction(offerId: string) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  await cancelWaitlistOffer(supabase, accountId, offerId);
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/waitlist');
  return { ok: true };
}

export async function manualAcceptOfferAction(offerId: string) {
  const { supabase } = await requireOfficeContext('schedule.write');
  const result = await resolveWaitlistOfferReply(supabase, offerId, 'YES');
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/waitlist');
  return { ok: true, result };
}

export async function manualDeclineOfferAction(offerId: string) {
  const { supabase } = await requireOfficeContext('schedule.write');
  const result = await resolveWaitlistOfferReply(supabase, offerId, 'NO');
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/waitlist');
  return { ok: true, result };
}

export async function triggerWaitlistSweepAction() {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const result = await expireHoldsAndCascade(supabase, accountId);
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/waitlist');
  return { ok: true, ...result };
}

export async function toggleWaitlistAction(enabled: boolean) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const { error } = await supabase
    .from('accounts')
    .update({ cancellation_waitlist_enabled: enabled })
    .eq('id', accountId);

  if (error) {
    throw new Error(`Failed to update waitlist setting: ${error.message}`);
  }

  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/settings');
  revalidatePath('/dashboard/schedule/waitlist');
  return { ok: true, enabled };
}

export type ExistingContactMatch = {
  id: string;
  source: 'client' | 'lead';
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  serviceName: string | null;
  notes: string | null;
  clientId: string | null;
  leadId: string | null;
};

export async function searchExistingContactsAction(query: string): Promise<ExistingContactMatch[]> {
  const trimmed = (query ?? '').trim();
  if (trimmed.length < 2) return [];

  const { supabase, accountId } = await requireOfficeContext('schedule.read');
  const term = trimmed.replace(/[%_\\]/g, '');
  if (!term) return [];

  // 1. Search clients table
  const { data: clients, error: clientErr } = await supabase
    .from('clients')
    .select('id, name, phone, email, address, notes')
    .eq('account_id', accountId)
    .or(`name.ilike.%${term}%,phone.ilike.%${term}%,address.ilike.%${term}%`)
    .limit(6);

  if (clientErr) {
    console.error('searchExistingContactsAction clients query error:', clientErr);
  }

  // 2. Search leads table
  const { data: leads, error: leadErr } = await supabase
    .from('leads')
    .select('id, name, phone, email, address, service_name, notes, lat, lng, client_id')
    .eq('account_id', accountId)
    .or(`name.ilike.%${term}%,phone.ilike.%${term}%,address.ilike.%${term}%`)
    .limit(6);

  if (leadErr) {
    console.error('searchExistingContactsAction leads query error:', leadErr);
  }

  const results: ExistingContactMatch[] = [];
  const seenPhones = new Set<string>();

  for (const c of clients ?? []) {
    if (!c.name) continue;
    const phone = c.phone || '';
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone) seenPhones.add(cleanPhone);

    results.push({
      id: c.id,
      source: 'client',
      name: c.name,
      phone,
      email: c.email || null,
      address: c.address || null,
      lat: null,
      lng: null,
      serviceName: null,
      notes: c.notes || null,
      clientId: c.id,
      leadId: null,
    });
  }

  for (const l of leads ?? []) {
    if (!l.name) continue;
    const cleanPhone = (l.phone || '').replace(/\D/g, '');

    // If client with same phone already added, enrich client with lead details
    if (cleanPhone && seenPhones.has(cleanPhone)) {
      const match = results.find((r) => r.phone.replace(/\D/g, '') === cleanPhone);
      if (match) {
        if (!match.serviceName && l.service_name) match.serviceName = l.service_name;
        if (!match.lat && l.lat) {
          match.lat = l.lat;
          match.lng = l.lng;
        }
        if (!match.address && l.address) match.address = l.address;
        if (!match.leadId) match.leadId = l.id;
      }
      continue;
    }

    results.push({
      id: l.id,
      source: 'lead',
      name: l.name,
      phone: l.phone || '',
      email: l.email || null,
      address: l.address || null,
      lat: l.lat ?? null,
      lng: l.lng ?? null,
      serviceName: l.service_name || null,
      notes: l.notes || null,
      clientId: l.client_id || null,
      leadId: l.id,
    });

    if (cleanPhone) seenPhones.add(cleanPhone);
  }

  // 3. For clients missing address/coordinates, check their recent jobs
  const clientIdsWithoutCoords = results
    .filter((r) => r.source === 'client' && (!r.lat || !r.address))
    .map((r) => r.id);

  if (clientIdsWithoutCoords.length > 0) {
    const { data: pastJobs } = await supabase
      .from('jobs')
      .select('client_id, address, lat, lng, title')
      .eq('account_id', accountId)
      .in('client_id', clientIdsWithoutCoords)
      .not('lat', 'is', null)
      .limit(10);

    for (const j of pastJobs ?? []) {
      const match = results.find((r) => r.id === j.client_id);
      if (match) {
        if (!match.address && j.address) match.address = j.address;
        if (!match.lat && j.lat) {
          match.lat = j.lat;
          match.lng = j.lng;
        }
        if (!match.serviceName && j.title) match.serviceName = j.title;
      }
    }
  }

  return results.slice(0, 8);
}
