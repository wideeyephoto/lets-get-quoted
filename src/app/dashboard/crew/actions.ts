'use server';

import { revalidatePath } from 'next/cache';
import { resolveCrewBurdenPct } from '@/lib/cost-truth-data';
import { cookies } from 'next/headers';
import { createAdminClient, requireOwnerContext } from '@/lib/auth';
import { loadBusinessName } from '@/lib/business-name';
import { LABOR_SETTINGS_COOKIE, normalizeLaborSettings, roundHours } from '@/lib/labor-settings';
import { normalizePayType } from '@/lib/pay-types';
import { validateManualEnd } from '@/lib/time-clock';
import { clockOut, getTimeEntry } from '@/lib/time-clock-data';
import {
  deleteArchivedCrewMember,
  listCrew,
  listCrewIdsForJob,
  saveCrewStartAddress,
  setCrewArrivalPermissions,
  setJobCrewAssignments,
  updateCrewPhoto,
  updateCrewMember,
} from '@/lib/crew';
import { createCrewMemberForSeatGate, setCrewActiveForSeatGate } from '@/lib/billing/crew-seat-entitlement';
import { countLaborEntriesForCrew, countPayRecordsForCrew, laborEntryLockReason } from '@/lib/crew-pay-data';
import { deleteCrewPhotos, isCrewPhotoFile, uploadCrewPhoto, validateCrewPhotoFile } from '@/lib/crew-photo-storage';
import { createCost, getJob } from '@/lib/jobs';
import { createJobFeedEvent } from '@/lib/job-feed';
import { ensureSmsConsentBaseline, sendCrewAssignmentSms } from '@/lib/sms';
import { revokeCrewAccess, sendCrewMagicLink, stampCrewInvite } from '@/lib/crew-auth';

function optionalText(value: FormDataEntryValue | null): string | undefined {
  const text = (value ?? '').toString().trim();
  return text.length > 0 ? text : undefined;
}

function positiveAmount(value: FormDataEntryValue | null): number | null {
  const parsed = Number((value ?? '').toString().trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * How this person is paid, from the form.
 *
 * Only the amount belonging to the chosen type is read. That was already true
 * when the form posted all three and hid two of them, and it stays true now
 * that PayTypeFields renders only the matching one: `positiveAmount` of a field
 * that was never on screen is null, and the branches below discard it anyway.
 * Reading them all would store a salary against somebody switched back to
 * hourly, where it would be invisible and wrong.
 *
 * hourlyRate is read unconditionally on purpose — for a salaried or day-rate
 * person it arrives absent, lands as 0, and payColumns then DERIVES the costing
 * rate from the salary or day rate (see lib/pay-types costingRate).
 */
function payFromForm(formData: FormData) {
  const payType = normalizePayType(formData.get('payType'));
  return {
    payType,
    hourlyRate: positiveAmount(formData.get('hourlyRate')) ?? 0,
    annualSalary: payType === 'salary' ? positiveAmount(formData.get('annualSalary')) : null,
    dayRate: payType === 'day_rate' ? positiveAmount(formData.get('dayRate')) : null,
    payrollId: optionalText(formData.get('payrollId')) ?? null,
  };
}

/**
 * What "add a crew member" reports back.
 *
 * This action used to return void and throw on a bad input, which is what made
 * the add form silent: a `<form action={createCrewAction}>` has nowhere to put
 * a result, so a successful add looked exactly like a click that did nothing,
 * and a rejected one (no phone, a 6 MB photo) surfaced as the framework's error
 * overlay rather than as a sentence next to the field. Every outcome is a value
 * now, so AddCrewDrawer can name the person it just added, close itself, and
 * keep a half-filled form on screen when the save was refused.
 *
 * The type and its idle constant live in lib/crew-add-state, not here, because
 * A 'use server' FILE MAY ONLY EXPORT ASYNC FUNCTIONS. The type would have been
 * fine — types are erased long before that check runs — but `CREATE_CREW_IDLE`
 * is an object, and exporting it from this file failed the build with
 * "A \"use server\" file can only export async functions, found object", in a
 * message that named an unrelated route. It passed tsc, passed lint, and said
 * "Compiled successfully" first.
 *
 * Re-exported as a type so importers of this module keep working.
 */
export type { CreateCrewState } from '@/lib/crew-add-state';
// Imported as well as re-exported: `export type … from` forwards the name to
// consumers without binding it in this module's own scope.
import type { CreateCrewState } from '@/lib/crew-add-state';

/**
 * Add a crew member — optionally inviting them to the field app in the same press.
 *
 * TWO OUTCOMES, ONE FORM. "Save and invite" and "Save without inviting" post the
 * same fields and differ only in `intent`, because emailing somebody a login is
 * a decision about that person, not a second kind of record. The invite is sent
 * AFTER the row exists and inside its own try/catch: a mail provider having a
 * bad minute must not lose the crew member the owner just typed in.
 */
export async function createCrewAction(_previous: CreateCrewState, formData: FormData): Promise<CreateCrewState> {
  const name = (formData.get('name') ?? '').toString().trim();
  const phone = (formData.get('phone') ?? '').toString().trim();
  const email = optionalText(formData.get('email')) ?? null;
  const wantsInvite = formData.get('intent') === 'invite';

  if (!name) return { status: 'error', message: 'Enter their name before saving.' };
  // A phone number is not paperwork here: assigning somebody to a job texts
  // them (sendCrewAssignmentSms), a customer picking a time texts them
  // (sendCrewScheduleSelectedSms), and both route through deliverCrewSms, which
  // has nothing to send to without a number. A crew member with no phone is one
  // who is never told about the work.
  if (!phone) return { status: 'error', message: 'Enter a mobile number — it is how they are told about a job.' };
  if (phone.replace(/\D/g, '').length < 10) {
    return { status: 'error', message: 'That number is too short to text. Enter all ten digits.' };
  }

  try {
    const { supabase, accountId } = await requireOwnerContext();

    const photo = formData.get('photo');
    // Checked BEFORE the insert rather than after: validateCrewPhotoFile throws,
    // and a throw here used to leave a crew member created with no photo and an
    // error on screen that read as though nothing had been saved at all.
    if (isCrewPhotoFile(photo)) validateCrewPhotoFile(photo);

    const member = await createCrewMemberForSeatGate(supabase, createAdminClient, accountId, {
      name,
      phone,
      email,
      roleLabel: optionalText(formData.get('roleLabel')),
      ...payFromForm(formData),
    });

    // Seed a baseline consent row so a future STOP from this crew number has a
    // row to flip (the inbound handler only updates existing rows). Best-effort.
    await ensureSmsConsentBaseline(accountId, phone).catch(() => {});

    if (isCrewPhotoFile(photo)) {
      const photoPath = await uploadCrewPhoto(accountId, member.id, photo);
      await updateCrewPhoto(supabase, accountId, member.id, photoPath);
    }

    let invite: 'sent' | 'skipped' | 'no-email' | 'failed' = 'skipped';
    if (wantsInvite && !email) {
      invite = 'no-email';
    } else if (wantsInvite && email) {
      try {
        // Named business, and stamped — the same two things inviteCrewAction
        // does. Add-and-invite is the commonest way a crew member is invited at
        // all, so leaving it out of the lifecycle would mean most of the roster
        // read "Not invited" the moment after being invited.
        await sendCrewMagicLink(email, await loadBusinessName(supabase, accountId), accountId);
        await stampCrewInvite(createAdminClient(), accountId, member.id);
        invite = 'sent';
      } catch (inviteError) {
        console.error(`Crew invite email failed for ${member.id}:`, inviteError);
        invite = 'failed';
      }
    }

    // The Active count, the roster and the stat ticker all live on this route,
    // so one revalidate is what makes the new person appear without a reload.
    revalidatePath('/dashboard/crew');
    revalidatePath('/dashboard/schedule');

    const inviteNote =
      invite === 'sent'
        ? ` An invitation to the field app is on its way to ${email}.`
        : invite === 'no-email'
          ? ' Add an email address to their profile to invite them to the field app.'
          : invite === 'failed'
            ? ' The field app invitation could not be sent — try again from their profile.'
            : '';

    return {
      status: 'added',
      id: member.id,
      name: member.name,
      message: `${member.name} was added to your crew.${inviteNote}`,
      invite,
    };
  } catch (error) {
    // Everything below requireOwnerContext can fail for a reason the owner can
    // act on (a photo that is too big, a duplicate, a dropped connection), and
    // the only useful place to say so is beside the form they are still looking
    // at. Rethrowing would take the form with it.
    console.error('createCrewAction failed:', error);
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'That crew member could not be saved. Try again.',
    };
  }
}

export async function updateCrewAction(crewId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const name = (formData.get('name') ?? '').toString().trim();
  const phone = (formData.get('phone') ?? '').toString().trim();

  if (!name || !phone) {
    throw new Error('Name and phone are required to update a crew member.');
  }

  await updateCrewMember(supabase, accountId, crewId, {
    name,
    phone,
    email: optionalText(formData.get('email')) ?? null,
    roleLabel: optionalText(formData.get('roleLabel')),
    ...payFromForm(formData),
  });

  // Where this person's day starts, for Plan my day. Geocoded precise-only:
  // a city-level match would silently move every leg of their route by miles,
  // so a vague address stores the text and no coordinates, and the plan keeps
  // falling back to the shop.
  await saveCrewStartAddress(supabase, accountId, crewId, optionalText(formData.get('startAddress')) ?? null);

  // What they may do around an arrival. Read as plain absent/present: the edit
  // form always renders all four boxes, so an unticked one is a real "no"
  // rather than a field that wasn't on screen.
  await setCrewArrivalPermissions(supabase, accountId, crewId, {
    send: formData.get('canSendArrival') === 'on',
    shareLocation: formData.get('canShareLocation') === 'on',
    viewContact: formData.get('canViewClientContact') === 'on',
    reschedule: formData.get('canReschedule') === 'on',
  });

  // Keep a baseline consent row in step with the (possibly new) phone number.
  await ensureSmsConsentBaseline(accountId, phone).catch(() => {});

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

export type CrewActiveActionState = {
  status: 'idle' | 'saved' | 'error';
  message: string;
};

export async function setCrewActiveAction(
  crewId: string,
  active: boolean,
  _previous: CrewActiveActionState,
  _formData: FormData,
): Promise<CrewActiveActionState> {
  // Keep the established auth/account redirects out of the error-state catch:
  // Next implements redirect() as a thrown sentinel, and swallowing it would
  // strand a signed-out or suspended owner on this form instead of navigating.
  const { supabase, accountId } = await requireOwnerContext();

  try {
    await setCrewActiveForSeatGate(supabase, createAdminClient, accountId, crewId, active);
  } catch (error) {
    // Reactivation is a counted-seat transition. Returning the mapped database
    // sentence is deliberate: thrown Server Action errors are redacted in
    // production, which would turn an at-cap/remediation decision into a
    // content-free "server error" beside the button that needs to explain it.
    console.error('setCrewActiveAction failed:', error);
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'That crew member could not be updated. Try again.',
    };
  }

  revalidatePath('/dashboard/crew');
  revalidatePath('/dashboard/jobs');
  return { status: 'saved', message: '' };
}

export async function deleteArchivedCrewAction(crewId: string) {
  const { supabase, accountId } = await requireOwnerContext();

  // Someone who has been paid can't be deleted. Their payment records are the
  // answer to "did we pay them for that week", and deleting the person would
  // take that answer with them — which is the one thing a pay history must
  // never do. Archiving already keeps them off the roster.
  const payRecords = await countPayRecordsForCrew(supabase, accountId, crewId);
  if (payRecords > 0) {
    throw new Error(
      'This crew member appears in a pay period that has been approved or paid, so their record has to stay. They are already archived and off the roster.',
    );
  }

  // Even with no pay record, their hours are job costs. costs.crew_id is ON
  // DELETE SET NULL, so deleting the person would silently unattach every entry
  // and change what those jobs cost — retroactively, with nothing to show for it.
  const laborEntries = await countLaborEntriesForCrew(supabase, accountId, crewId);
  if (laborEntries > 0) {
    throw new Error(
      `This crew member has ${laborEntries} labor ${laborEntries === 1 ? 'entry' : 'entries'} against jobs. Deleting them would take those hours off the jobs they were worked on and change what each one cost. They are already archived and off the roster.`,
    );
  }

  const photoPath = await deleteArchivedCrewMember(supabase, accountId, crewId);
  if (photoPath) await deleteCrewPhotos(accountId, [photoPath]);

  revalidatePath('/dashboard/crew');
  revalidatePath('/dashboard/jobs');
  revalidatePath('/dashboard/schedule');
}

// Emails a crew member a magic link into the mobile field app. Requires an email
// on their record; the link ties their sign-in to this roster entry.
//
// The invitation names THIS business. Somebody on two rosters under one email
// used to land in whichever account the app happened to resolve first, which
// meant an owner could invite a person and watch them open a competitor's job
// list. The account rides in the callback URL and becomes the remembered choice.
export async function inviteCrewAction(crewId: string) {
  const { supabase, accountId } = await requireOwnerContext();

  const { data: member } = await supabase
    .from('crew')
    .select('email, name')
    .eq('account_id', accountId)
    .eq('id', crewId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!member) throw new Error('Crew member not found.');
  if (!member.email) throw new Error('Add an email address for this crew member first, then send the invite.');

  const businessName = await loadBusinessName(supabase, accountId);

  await sendCrewMagicLink(member.email as string, businessName, accountId);
  // Stamped AFTER the send, so a roster that says "invited" is only ever
  // describing an email that actually left. It also clears any revocation:
  // sending somebody a fresh link IS the decision to let them back in, and a
  // link the session guard then refuses reads as the product being broken.
  await stampCrewInvite(createAdminClient(), accountId, crewId);
  revalidatePath('/dashboard/crew');
}

/**
 * Shut the field app to somebody who is still on the crew.
 *
 * NOT archiving. Archiving takes a person off the roster, out of the assignable
 * list and off the schedule — a far bigger claim than "this phone was stolen"
 * or "they're on gardening leave for a fortnight". Until now those were the same
 * button, so the smaller decision had to be made with the larger one.
 *
 * Their history stays: hours, costs, and the jobs they did are the business's
 * records, not a permission.
 */
export async function revokeCrewAccessAction(crewId: string) {
  const { supabase, accountId } = await requireOwnerContext();

  const { data: member } = await supabase
    .from('crew')
    .select('id')
    .eq('account_id', accountId)
    .eq('id', crewId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!member) throw new Error('Crew member not found.');

  await revokeCrewAccess(createAdminClient(), accountId, crewId);
  revalidatePath('/dashboard/crew');
}

// One Assign button with a "text them" checkbox beside it, rather than two
// buttons that differed only in a trailing clause. Two submit buttons made the
// texting decision look like two different actions; it's one action with an
// option, and the option is now visible before you commit to it.
//
// Unchecked is a real choice, so the checkbox value is read here rather than
// bound: an absent checkbox means don't text.
export async function assignCrewToJobAction(crewId: string, formData: FormData) {
  const jobId = optionalText(formData.get('jobId'));
  if (!jobId) throw new Error('Choose a job before assigning crew.');
  const notify = formData.get('notify') !== null;

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

  if (notify && added.includes(crewId)) {
    try {
      const result = await sendCrewAssignmentSms({
        accountId,
        crewId: member.id,
        phone: member.phone,
        crewName: member.name,
        businessName: await loadBusinessName(supabase, accountId),
        jobRef: job.ref,
        clientName: job.client_name,
        address: job.address,
        scheduledFor: job.scheduled_for,
        scheduledTime: job.scheduled_time,
      });
      // Record the notification (only on a real send) so the schedule's "Crew
      // Notified" status is consistent no matter which surface assigned the crew.
      if (result?.status === 'sent') {
        await createJobFeedEvent(supabase, accountId, jobId, {
          kind: 'job_update',
          title: 'Crew assignment text sent',
          body: `Texted ${member.name} about their assignment to ${job.ref}.`,
          visibility: 'internal',
        });
      }
    } catch (error) {
      console.error(`Crew assignment SMS failed for crew ${crewId} on job ${jobId}:`, error);
    }
  }

  revalidatePath('/dashboard/crew');
  revalidatePath('/dashboard/jobs');
  revalidatePath(`/dashboard/jobs/${jobId}`);
  revalidatePath('/dashboard/schedule');
}

// Log labor against a job by hand — the counterpart to a crew member logging it
// from the field app. Same createCost path the job page uses, so the entry is
// identical in every way that matters: server-computed amount (hours × rate,
// never a client-supplied total) and a crew snapshot taken at insert.
export async function addLaborEntryAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const jobId = optionalText(formData.get('jobId'));
  if (!jobId) throw new Error('Choose a job to log this labor against.');
  const crewId = optionalText(formData.get('crewId'));

  const hours = Number(formData.get('hours'));
  if (!Number.isFinite(hours) || hours <= 0) throw new Error('Enter how many hours were worked.');

  // Fall back to the crew member's saved rate so the common case is two fields,
  // not three. An entry logged at a zero rate is exactly what the Hours & pay
  // tab flags as "missing rate", so it's worth trying not to create one.
  let rate = Number(formData.get('rate'));
  if (!Number.isFinite(rate) || rate <= 0) {
    const { data: member } = crewId
      ? await supabase.from('crew').select('hourly_rate').eq('account_id', accountId).eq('id', crewId).maybeSingle()
      : { data: null };
    rate = Number(member?.hourly_rate) || 0;
  }

  const job = await getJob(supabase, accountId, jobId);
  if (!job) throw new Error('Job not found.');

  const description = optionalText(formData.get('description')) ?? 'Labor added by owner';
  const cost = await createCost(supabase, accountId, jobId, {
    type: 'labor',
    description,
    crewId,
    hours,
    rate,
    source: 'estimated',
    burdenPct: await resolveCrewBurdenPct(supabase, accountId, crewId),
  });

  await createJobFeedEvent(supabase, accountId, jobId, {
    kind: 'cost_added',
    title: 'Labor added',
    body: description,
    visibility: 'internal',
    amount: Number(cost.amount),
    sourceTable: 'costs',
    sourceId: cost.id,
  });

  revalidatePath('/dashboard/crew');
  revalidatePath('/dashboard/jobs');
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

// Close a shift a crew member left running.
//
// The owner supplies the end time, because they're guessing at when the work
// actually stopped — the alternative is banking every hour between the missed
// clock-out and whenever somebody noticed. The row is stamped closed_by_owner
// so the difference between a clocked end time and a guessed one stays visible
// afterwards.
export async function closeOpenShiftAction(entryId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const entry = await getTimeEntry(supabase, accountId, entryId);
  if (!entry) throw new Error('That shift no longer exists.');
  if (entry.ended_at) throw new Error('That shift has already been closed.');

  // A datetime-local value has no zone, so it's read as the owner's local time —
  // which is what they typed and what the crew worked.
  const raw = String(formData.get('endedAt') ?? '').trim();
  const endedAt = raw ? new Date(raw) : new Date();
  if (Number.isNaN(endedAt.getTime())) throw new Error('That end time isn\'t a real time.');

  const problem = validateManualEnd(entry.started_at, endedAt.toISOString());
  if (problem) throw new Error(problem);

  const { data: member } = await supabase
    .from('crew')
    .select('name')
    .eq('account_id', accountId)
    .eq('id', entry.crew_id)
    .maybeSingle();

  const settings = normalizeLaborSettings(cookies().get(LABOR_SETTINGS_COOKIE)?.value);
  await clockOut(supabase, accountId, entry, {
    endedAt: endedAt.toISOString(),
    crewName: (member?.name as string) || 'Crew member',
    note: String(formData.get('note') ?? '').trim() || null,
    closedByOwner: true,
    round: settings.rounding === 'none' ? undefined : (hours) => roundHours(hours, settings.rounding),
  });

  revalidatePath('/dashboard/crew');
  revalidatePath(`/dashboard/jobs/${entry.job_id}`);
}

// Remove a labor entry that shouldn't count — a double-log from the field, or
// one with no hours on it. Scoped to type='labor' so this can never be used to
// delete a material cost or anything else attached to a job.
export async function deleteLaborEntryAction(entryId: string) {
  const { supabase, accountId } = await requireOwnerContext();

  // Hours that are part of an approved or paid period stay put. The `locked`
  // flag only ever guarded the pay record; the cost row underneath it was
  // deletable, which meant a payment could end up with no evidence behind it.
  const locked = await laborEntryLockReason(supabase, accountId, entryId);
  if (locked) throw new Error(locked);

  const { error } = await supabase
    .from('costs')
    .delete()
    .eq('account_id', accountId)
    .eq('id', entryId)
    .eq('type', 'labor');
  if (error) throw error;
  revalidatePath('/dashboard/crew');
  revalidatePath('/dashboard/jobs');
}
