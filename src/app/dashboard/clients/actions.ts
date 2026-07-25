'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';
import { updateClient } from '@/lib/clients';
import { parseClientCsv, importClients } from '@/lib/client-import';

// Bound one import so a giant paste can't run away.
const MAX_IMPORT_ROWS = 2000;

export async function importClientsAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  // Prefer an uploaded file; fall back to pasted text.
  let text = (formData.get('csv') ?? '').toString();
  const file = formData.get('file');
  if (file && typeof file === 'object' && 'text' in file && (file as File).size > 0) {
    text = await (file as File).text();
  }

  if (!text.trim()) redirect('/dashboard/clients/import?error=empty');

  const { rows } = parseClientCsv(text);
  if (rows.length === 0) redirect('/dashboard/clients/import?error=norows');

  const result = await importClients(supabase, accountId, rows.slice(0, MAX_IMPORT_ROWS));

  revalidatePath('/dashboard/clients');
  redirect(`/dashboard/clients/import?imported=${result.imported}&duplicates=${result.duplicates}&skipped=${result.skipped}`);
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
