'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';
import { createCrewMember, setCrewActive } from '@/lib/crew';

function optionalText(value: FormDataEntryValue | null): string | undefined {
  const text = (value ?? '').toString().trim();
  return text.length > 0 ? text : undefined;
}

export async function createCrewAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const name = (formData.get('name') ?? '').toString().trim();
  const phone = (formData.get('phone') ?? '').toString().trim();

  if (!name || !phone) {
    throw new Error('Name and phone are required to add a crew member.');
  }

  const hourlyRateRaw = Number(formData.get('hourlyRate'));

  await createCrewMember(supabase, accountId, {
    name,
    phone,
    roleLabel: optionalText(formData.get('roleLabel')),
    hourlyRate: Number.isFinite(hourlyRateRaw) && hourlyRateRaw > 0 ? hourlyRateRaw : 0,
  });

  revalidatePath('/dashboard/crew');
}

export async function setCrewActiveAction(crewId: string, active: boolean) {
  const { supabase, accountId } = await requireOwnerContext();

  await setCrewActive(supabase, accountId, crewId, active);

  revalidatePath('/dashboard/crew');
  revalidatePath('/dashboard/jobs');
}
