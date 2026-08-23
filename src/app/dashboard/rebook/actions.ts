'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOfficeContext } from '@/lib/auth';
import { sendRebookInvite, sendAllRebookInvites, REBOOK_DAY_OPTIONS, DEFAULT_REBOOK_DAYS } from '@/lib/rebook';

function cleanDays(value: number): number {
  return REBOOK_DAY_OPTIONS.includes(value) ? value : DEFAULT_REBOOK_DAYS;
}

export async function sendRebookInviteAction(clientId: string, days: number) {
  const { supabase, accountId } = await requireOfficeContext('jobs.write', 'clients.write');
  const params = new URLSearchParams({ days: String(cleanDays(days)) });
  try {
    const channel = await sendRebookInvite(supabase, accountId, clientId);
    params.set('flash', channel === 'sms' ? 'queued-sms' : 'sent-email');
  } catch (error) {
    params.set('flash', 'error');
    params.set('msg', error instanceof Error ? error.message : 'Could not send the invite.');
  }
  revalidatePath('/dashboard/rebook');
  redirect(`/dashboard/rebook?${params.toString()}`);
}

export async function sendAllRebookInvitesAction(days: number) {
  const { supabase, accountId } = await requireOfficeContext('jobs.write', 'clients.write');
  const clean = cleanDays(days);
  const params = new URLSearchParams({ days: String(clean) });
  try {
    const result = await sendAllRebookInvites(supabase, accountId, clean);
    params.set('flash', 'batch');
    params.set('sent', String(result.sent));
    params.set('skipped', String(result.skipped));
    params.set('failed', String(result.failed));
  } catch (error) {
    params.set('flash', 'error');
    params.set('msg', error instanceof Error ? error.message : 'Could not send invites.');
  }
  revalidatePath('/dashboard/rebook');
  redirect(`/dashboard/rebook?${params.toString()}`);
}
