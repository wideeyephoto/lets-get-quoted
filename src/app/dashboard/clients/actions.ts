'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';
import { updateClient } from '@/lib/clients';

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
