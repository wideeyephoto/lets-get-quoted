'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';
import { addOption, createSelection, deleteOption, setSelectionStatus, updateSelection } from '@/lib/selections-data';

function num(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? '').trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function createSelectionAction(jobId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  await createSelection(supabase, accountId, jobId, {
    title: String(formData.get('title') ?? ''),
    description: String(formData.get('description') ?? ''),
    allowance: num(formData.get('allowance')),
    decideBy: String(formData.get('decideBy') ?? '').trim() || null,
    // Unchecked means the contractor writes their allowances as "up to" and
    // keeps the difference. Default is to credit, because that's what the word
    // means in a construction contract.
    creditUnderspend: formData.get('creditUnderspend') !== null,
  });
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function updateSelectionAction(jobId: string, selectionId: string, formData: FormData): Promise<{ ok: boolean; message?: string }> {
  const { supabase, accountId } = await requireOwnerContext();
  const result = await updateSelection(supabase, accountId, selectionId, {
    title: String(formData.get('title') ?? ''),
    description: String(formData.get('description') ?? ''),
    allowance: num(formData.get('allowance')),
    decideBy: String(formData.get('decideBy') ?? '').trim() || null,
  });
  if (result.ok) revalidatePath(`/dashboard/jobs/${jobId}`);
  return result;
}

export async function addSelectionOptionAction(jobId: string, selectionId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  await addOption(supabase, accountId, {
    selectionId,
    jobId,
    name: String(formData.get('name') ?? ''),
    description: String(formData.get('description') ?? ''),
    price: num(formData.get('price')),
    // The thing that actually gets ordered. "SW7036" ends an argument that
    // "beige" starts.
    reference: String(formData.get('reference') ?? ''),
  });
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

/**
 * Remove an option. Returns nothing, because it's bound to a plain form button.
 *
 * deleteOption still refuses to remove one the customer already picked — the UI
 * doesn't offer the button on a decided selection, so that refusal is
 * defence-in-depth against a direct POST rather than something an owner sees.
 */
export async function deleteSelectionOptionAction(jobId: string, optionId: string): Promise<void> {
  const { supabase, accountId } = await requireOwnerContext();
  const result = await deleteOption(supabase, accountId, optionId);
  if (!result.ok) {
    console.error(`Selection option delete refused (${optionId}): ${result.message}`);
    return;
  }
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function cancelSelectionAction(jobId: string, selectionId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  await setSelectionStatus(supabase, accountId, selectionId, 'cancelled');
  revalidatePath(`/dashboard/jobs/${jobId}`);
}
