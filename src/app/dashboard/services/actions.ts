'use server';

import { revalidatePath } from 'next/cache';
import { requireOfficeContext } from '@/lib/auth';
import { createService, updateService, setServiceActive, deleteService, listServices } from '@/lib/services';
import { getStarterCatalogByTrade } from '@/lib/trade-catalogs';

function num(value: FormDataEntryValue | null): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Cost is optional, and blank means UNKNOWN rather than free.
 *
 * num() would turn '' into 0 here, and a 0 cost reads downstream as a line with
 * a perfect 100% margin. Blank has to survive as null all the way to the column.
 */
function optionalCost(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function createServiceAction(formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  const name = String(formData.get('name') ?? '').trim();
  if (!name) throw new Error('Give the service a name.');

  await createService(supabase, accountId, {
    name,
    description: String(formData.get('description') ?? ''),
    unitPrice: num(formData.get('unitPrice')),
    unitCost: optionalCost(formData.get('unitCost')),
    unit: String(formData.get('unit') ?? 'each'),
  });

  revalidatePath('/dashboard/services');
}

export async function updateServiceAction(serviceId: string, formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  const name = String(formData.get('name') ?? '').trim();
  if (!name) throw new Error('Give the service a name.');

  await updateService(supabase, accountId, serviceId, {
    name,
    description: String(formData.get('description') ?? ''),
    unitPrice: num(formData.get('unitPrice')),
    unitCost: optionalCost(formData.get('unitCost')),
    unit: String(formData.get('unit') ?? 'each'),
  });

  revalidatePath('/dashboard/services');
}

export async function setServiceActiveAction(serviceId: string, active: boolean) {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  await setServiceActive(supabase, accountId, serviceId, active);
  revalidatePath('/dashboard/services');
}

export async function deleteServiceAction(serviceId: string) {
  const { supabase, accountId, userId, userEmail, role } = await requireOfficeContext('jobs.write');
  await deleteService(supabase, accountId, serviceId, { userId, role, email: userEmail ?? undefined });
  revalidatePath('/dashboard/services');
  revalidatePath('/dashboard/trash');
  revalidatePath('/dashboard/activity');
}

export async function loadTradeStarterCatalogAction(formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  const tradeId = String(formData.get('tradeId') ?? '').trim();
  const catalog = getStarterCatalogByTrade(tradeId);
  if (!catalog) throw new Error('Selected trade starter catalog not found.');

  const existingServices = await listServices(supabase, accountId);
  const existingNames = new Set(existingServices.map((s) => s.name.trim().toLowerCase()));

  for (const item of catalog.items) {
    if (existingNames.has(item.name.trim().toLowerCase())) continue;
    await createService(supabase, accountId, {
      name: item.name,
      description: item.description,
      unitPrice: item.unitPrice,
      unitCost: item.unitCost,
      unit: item.unit,
    });
  }

  revalidatePath('/dashboard/services');
}
