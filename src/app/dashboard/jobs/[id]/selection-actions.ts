'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient, requireOwnerContext } from '@/lib/auth';
import { sendSelectionRequest } from '@/lib/selection-notify';
import {
  addOption,
  createSelection,
  deleteOption,
  reopenSelection,
  setSelectionStatus,
  updateOption,
  updateSelection,
} from '@/lib/selections-data';
import { isJobPhotoFile, uploadJobPhoto } from '@/lib/job-photo-storage';

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

  // A photo is most of the decision. Nobody picks a tile from a product code —
  // the code is what settles the argument afterwards, the picture is what makes
  // the choice possible in the first place.
  let photoPath: string | null = null;
  const photo = formData.get('photo');
  if (isJobPhotoFile(photo)) {
    try {
      photoPath = await uploadJobPhoto(accountId, photo);
    } catch (error) {
      // A failed upload must not lose the option. They can add the picture after.
      console.error('Selection option photo failed:', error instanceof Error ? error.message : error);
    }
  }

  await addOption(supabase, accountId, {
    selectionId,
    jobId,
    name: String(formData.get('name') ?? ''),
    description: String(formData.get('description') ?? ''),
    price: num(formData.get('price')),
    // The thing that actually gets ordered. "SW7036" ends an argument that
    // "beige" starts.
    reference: String(formData.get('reference') ?? ''),
    photoPath,
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

/** Fix a typo'd product code or a price that came back different. */
export async function updateSelectionOptionAction(jobId: string, optionId: string, formData: FormData): Promise<void> {
  const { supabase, accountId } = await requireOwnerContext();
  const result = await updateOption(supabase, accountId, optionId, {
    name: String(formData.get('name') ?? ''),
    reference: String(formData.get('reference') ?? ''),
    price: num(formData.get('price')),
  });
  if (!result.ok) {
    console.error(`Selection option edit refused (${optionId}): ${result.message}`);
    return;
  }
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

/**
 * Put a made decision back on the table, reversing what it did to the price.
 *
 * The customer changed their mind, or picked in a hurry. What they first chose
 * stays on the record — this is not an undo that pretends the first decision
 * never happened.
 */
export async function reopenSelectionAction(jobId: string, selectionId: string): Promise<void> {
  const { supabase, accountId } = await requireOwnerContext();
  const result = await reopenSelection(supabase, accountId, selectionId, 'Reopened by the contractor');
  if (!result.ok) {
    console.error(`Selection reopen refused (${selectionId}): ${result.message}`);
    return;
  }
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

/**
 * "Send these to them."
 *
 * Contractor-triggered and batched, rather than a text per selection as the
 * board is built. Somebody adding six choices over ten minutes should not fire
 * six messages at a homeowner, and the moment the board is READY is a judgement
 * only the contractor can make.
 */
export async function sendSelectionsAction(jobId: string): Promise<{ ok: boolean; message: string }> {
  const { accountId } = await requireOwnerContext();
  const outcome = await sendSelectionRequest(createAdminClient(), accountId, jobId);
  revalidatePath(`/dashboard/jobs/${jobId}`);

  if (outcome.ok) {
    const what = `${outcome.count} ${outcome.count === 1 ? 'choice' : 'choices'}`;
    return { ok: true, message: `${what} ${outcome.channel === 'sms' ? 'texted' : 'emailed'} to your customer.` };
  }
  if (outcome.reason === 'no_selections') {
    return { ok: false, message: 'Add at least one option to a choice first — there is nothing for them to pick between yet.' };
  }
  if (outcome.reason === 'no_contact') {
    return { ok: false, message: 'No mobile with texting consent and no email on this job, so there is nowhere to send it.' };
  }
  return { ok: false, message: 'Could not send that just now. Please try again.' };
}

export async function cancelSelectionAction(jobId: string, selectionId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  await setSelectionStatus(supabase, accountId, selectionId, 'cancelled');
  revalidatePath(`/dashboard/jobs/${jobId}`);
}
