'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';
import { createCrewMember, listCrew, listCrewIdsForJob, setCrewActive, setJobCrewAssignments } from '@/lib/crew';
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
