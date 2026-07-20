'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';
import {
  createCrewMember,
  deleteArchivedCrewMember,
  listCrew,
  listCrewIdsForJob,
  setCrewActive,
  setJobCrewAssignments,
  updateCrewPhoto,
  updateCrewMember,
} from '@/lib/crew';
import { deleteCrewPhotos, isCrewPhotoFile, uploadCrewPhoto, validateCrewPhotoFile } from '@/lib/crew-photo-storage';
import { getJob } from '@/lib/jobs';
import { sendCrewAssignmentSms } from '@/lib/sms';

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
  const photo = formData.get('photo');
  if (isCrewPhotoFile(photo)) validateCrewPhotoFile(photo);

  const member = await createCrewMember(supabase, accountId, {
    name,
    phone,
    roleLabel: optionalText(formData.get('roleLabel')),
    hourlyRate: Number.isFinite(hourlyRateRaw) && hourlyRateRaw > 0 ? hourlyRateRaw : 0,
  });

  if (isCrewPhotoFile(photo)) {
    const photoPath = await uploadCrewPhoto(accountId, member.id, photo);
    await updateCrewPhoto(supabase, accountId, member.id, photoPath);
  }

  revalidatePath('/dashboard/crew');
}

export async function updateCrewAction(crewId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const name = (formData.get('name') ?? '').toString().trim();
  const phone = (formData.get('phone') ?? '').toString().trim();

  if (!name || !phone) {
    throw new Error('Name and phone are required to update a crew member.');
  }

  const hourlyRateRaw = Number(formData.get('hourlyRate'));

  await updateCrewMember(supabase, accountId, crewId, {
    name,
    phone,
    roleLabel: optionalText(formData.get('roleLabel')),
    hourlyRate: Number.isFinite(hourlyRateRaw) && hourlyRateRaw > 0 ? hourlyRateRaw : 0,
  });

  revalidatePath('/dashboard/crew');
  revalidatePath('/dashboard/jobs');
  revalidatePath('/dashboard/schedule');
}

export async function updateCrewPhotoAction(crewId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const photo = formData.get('photo');

  // No file attached (e.g. the picker was dismissed) — do nothing instead of
  // throwing. The avatar upload only submits once a file is chosen, so this is
  // just a guard against an empty submit rather than a user-facing error.
  if (!isCrewPhotoFile(photo)) {
    return;
  }

  const photoPath = await uploadCrewPhoto(accountId, crewId, photo);
  const { previousPhotoPath } = await updateCrewPhoto(supabase, accountId, crewId, photoPath);
  if (previousPhotoPath) await deleteCrewPhotos(accountId, [previousPhotoPath]);

  revalidatePath('/dashboard/crew');
  revalidatePath('/dashboard/jobs');
  revalidatePath('/dashboard/schedule');
}

export async function setCrewActiveAction(crewId: string, active: boolean) {
  const { supabase, accountId } = await requireOwnerContext();

  await setCrewActive(supabase, accountId, crewId, active);

  revalidatePath('/dashboard/crew');
  revalidatePath('/dashboard/jobs');
}

export async function deleteArchivedCrewAction(crewId: string) {
  const { supabase, accountId } = await requireOwnerContext();

  const photoPath = await deleteArchivedCrewMember(supabase, accountId, crewId);
  if (photoPath) await deleteCrewPhotos(accountId, [photoPath]);

  revalidatePath('/dashboard/crew');
  revalidatePath('/dashboard/jobs');
  revalidatePath('/dashboard/schedule');
}

export async function assignCrewToJobAction(crewId: string, formData: FormData) {
  const jobId = optionalText(formData.get('jobId'));
  if (!jobId) throw new Error('Choose a job before assigning crew.');

  const { supabase, accountId } = await requireOwnerContext();
  const [job, crewMembers, existingCrewIds] = await Promise.all([
    getJob(supabase, accountId, jobId),
    listCrew(supabase, accountId, { activeOnly: true }),
    listCrewIdsForJob(supabase, accountId, jobId),
  ]);

  if (!job) throw new Error('Job not found.');
  const member = crewMembers.find((candidate) => candidate.id === crewId);
  if (!member) throw new Error('Active crew member not found.');

  const { added } = await setJobCrewAssignments(supabase, accountId, jobId, [...new Set([...existingCrewIds, crewId])]);

  if (added.includes(crewId)) {
    try {
      const { data: account } = await supabase.from('accounts').select('business_name').eq('id', accountId).single();
      await sendCrewAssignmentSms({
        phone: member.phone,
        crewName: member.name,
        businessName: account?.business_name || "Let's Get Quoted contractor",
        jobRef: job.ref,
        clientName: job.client_name,
        address: job.address,
        scheduledFor: job.scheduled_for,
        scheduledTime: job.scheduled_time,
      });
    } catch (error) {
      console.error(`Crew assignment SMS failed for crew ${crewId} on job ${jobId}:`, error);
    }
  }

  revalidatePath('/dashboard/crew');
  revalidatePath('/dashboard/jobs');
  revalidatePath(`/dashboard/jobs/${jobId}`);
  revalidatePath('/dashboard/schedule');
}
