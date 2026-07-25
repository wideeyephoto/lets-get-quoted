'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';
import { createService, updateService, setServiceActive, deleteService } from '@/lib/services';

function num(value: FormDataEntryValue | null): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function createServiceAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) throw new Error('Give the service a name.');

  await createService(supabase, accountId, {
    name,
    description: String(formData.get('description') ?? ''),
    unitPrice: num(formData.get('unitPrice')),
    unit: String(formData.get('unit') ?? 'each'),
  });

  revalidatePath('/dashboard/services');
}

export async function updateServiceAction(serviceId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) throw new Error('Give the service a name.');

  await updateService(supabase, accountId, serviceId, {
    name,
    description: String(formData.get('description') ?? ''),
    unitPrice: num(formData.get('unitPrice')),
    unit: String(formData.get('unit') ?? 'each'),
  });

  revalidatePath('/dashboard/services');
}

export async function setServiceActiveAction(serviceId: string, active: boolean) {
  const { supabase, accountId } = await requireOwnerContext();
  await setServiceActive(supabase, accountId, serviceId, active);
  revalidatePath('/dashboard/services');
}

export async function deleteServiceAction(serviceId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  await deleteService(supabase, accountId, serviceId);
  revalidatePath('/dashboard/services');
}
