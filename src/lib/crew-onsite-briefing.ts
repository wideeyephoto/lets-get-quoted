import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { enqueueSmsDelivery } from '@/lib/sms-delivery';
import { sanitizeGsm7Text } from '@/lib/sms-field-templates';
import { createJobFeedEvent } from '@/lib/job-feed';
import { normalizeUsPhone } from '@/lib/phone';

export type JobsiteSpecialInstructions = {
  jobRef: string;
  clientName: string;
  address: string | null;
  clientNotes: string | null;
  timelineCautions: string[];
  allInstructions: string[];
};

export type JobsiteArrivalBriefingParams = {
  crewFirstName: string;
  jobRef: string;
  clientName: string;
  address: string | null;
  instructions: string[];
};

/**
 * Builds a friendly, natural, GSM-7 compliant on-site arrival briefing SMS.
 */
export function buildJobsiteArrivalBriefingText(params: JobsiteArrivalBriefingParams): string {
  const name = sanitizeGsm7Text(params.crewFirstName || 'Team');
  const ref = sanitizeGsm7Text(params.jobRef);
  const client = sanitizeGsm7Text(params.clientName || 'Client');
  const addr = params.address ? sanitizeGsm7Text(params.address.split(',')[0].trim()) : '';

  const locationHeader = addr ? `${addr} (${client})` : `${ref} (${client})`;
  const header = `Hey ${name}! Arrived at ${locationHeader}.`;

  const instructionLines = params.instructions
    .map((inst) => sanitizeGsm7Text(inst).trim())
    .filter((inst) => inst.length > 0)
    .slice(0, 3) // Keep to top 3 key instructions for SMS brevity
    .map((inst) => `* ${inst}`);

  const body = instructionLines.length > 0
    ? `\nSpecial requests & site notes:\n${instructionLines.join('\n')}`
    : '';

  const footer = `\nHave a great shift! Reply STOP to opt out.`;

  return sanitizeGsm7Text(`${header}${body}${footer}`);
}

/**
 * Extracts active customer special requests, gate codes, pet warnings,
 * and internal timeline cautions for a jobsite.
 */
export async function fetchJobsiteSpecialInstructions(
  admin: SupabaseClient,
  accountId: string,
  jobId: string,
): Promise<JobsiteSpecialInstructions | null> {
  const { data: job, error: jobError } = await admin
    .from('jobs')
    .select('id, ref, client_name, client_id, address, scope')
    .eq('account_id', accountId)
    .eq('id', jobId)
    .maybeSingle();

  if (jobError || !job) return null;

  let clientNotes: string | null = null;
  if (job.client_id) {
    const { data: client } = await admin
      .from('clients')
      .select('notes')
      .eq('account_id', accountId)
      .eq('id', job.client_id)
      .maybeSingle();

    if (client?.notes && typeof client.notes === 'string' && client.notes.trim().length > 0) {
      clientNotes = client.notes.trim();
    }
  }

  // Fetch recent internal caution notes and field updates from job_feed
  const { data: feedEvents } = await admin
    .from('job_feed')
    .select('title, body, kind, visibility, created_at')
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .eq('visibility', 'internal')
    .order('created_at', { ascending: false })
    .limit(10);

  const timelineCautions: string[] = [];
  for (const event of feedEvents ?? []) {
    const body = typeof event.body === 'string' ? event.body.trim() : '';
    const title = typeof event.title === 'string' ? event.title.trim() : '';
    const kind = typeof event.kind === 'string' ? event.kind : '';

    if (
      kind === 'field_caution' ||
      title.toLowerCase().includes('caution') ||
      title.toLowerCase().includes('warning') ||
      body.toLowerCase().includes('caution') ||
      body.toLowerCase().includes('warning') ||
      body.toLowerCase().includes('gate code') ||
      body.toLowerCase().includes('dog') ||
      body.toLowerCase().includes('pet') ||
      body.toLowerCase().includes('hazard') ||
      body.toLowerCase().includes('tie-off') ||
      body.toLowerCase().includes('parking')
    ) {
      const summary = body || title;
      if (summary && !timelineCautions.includes(summary)) {
        timelineCautions.push(summary);
      }
    }
  }

  const allInstructions: string[] = [];

  if (clientNotes) {
    // Split multi-line client notes into individual bullet points if appropriate
    const lines = clientNotes.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (!allInstructions.includes(line)) {
        allInstructions.push(line);
      }
    }
  }

  for (const caution of timelineCautions) {
    if (!allInstructions.includes(caution)) {
      allInstructions.push(caution);
    }
  }

  return {
    jobRef: job.ref || 'Job',
    clientName: job.client_name || 'Client',
    address: (job.address as string | null) ?? null,
    clientNotes,
    timelineCautions,
    allInstructions,
  };
}

export type SendJobsiteArrivalBriefingInput = {
  accountId: string;
  jobId: string;
  crewId: string;
  triggerSource?: 'geofence_clock_in' | 'field_arrival' | 'manual';
  now?: Date;
};

export type SendJobsiteArrivalBriefingResult =
  | { sent: true; eventId: string; phone: string; message: string }
  | { sent: false; reason: 'no_instructions' | 'no_phone' | 'crew_not_found' | 'enqueue_failed'; error?: string };

/**
 * Evaluates and delivers an on-site dispatch briefing to an arriving crew member
 * if special requests or safety cautions exist for the jobsite.
 *
 * Implements strict daily idempotency per crew member per job to avoid repeat texts.
 */
export async function sendJobsiteArrivalBriefingSms(
  input: SendJobsiteArrivalBriefingInput,
  admin: SupabaseClient = createAdminClient(),
): Promise<SendJobsiteArrivalBriefingResult> {
  const now = input.now ?? new Date();
  const dateKey = now.toISOString().slice(0, 10);

  // 1. Fetch crew member details and phone
  const { data: crewMember } = await admin
    .from('crew')
    .select('id, name, phone, active')
    .eq('account_id', input.accountId)
    .eq('id', input.crewId)
    .maybeSingle();

  if (!crewMember || !crewMember.active) {
    return { sent: false, reason: 'crew_not_found' };
  }

  const rawPhone = crewMember.phone ? String(crewMember.phone).trim() : '';
  const normalizedPhone = normalizeUsPhone(rawPhone);
  if (!normalizedPhone) {
    return { sent: false, reason: 'no_phone' };
  }

  // 2. Fetch site instructions & cautions
  const siteIntel = await fetchJobsiteSpecialInstructions(admin, input.accountId, input.jobId);
  if (!siteIntel || siteIntel.allInstructions.length === 0) {
    // Zero-noise policy: do not send an empty briefing if no special notes exist
    return { sent: false, reason: 'no_instructions' };
  }

  const crewFirstName = (crewMember.name || 'Team').trim().split(/\s+/)[0] || 'Team';
  const messageBody = buildJobsiteArrivalBriefingText({
    crewFirstName,
    jobRef: siteIntel.jobRef,
    clientName: siteIntel.clientName,
    address: siteIntel.address,
    instructions: siteIntel.allInstructions,
  });

  // 3. Stable 1-per-day idempotency key
  const idempotencyKey = `onsite-briefing:${input.accountId}:${input.jobId}:${input.crewId}:${dateKey}`;

  try {
    const enqueued = await enqueueSmsDelivery(
      {
        accountId: input.accountId,
        phoneNumber: normalizedPhone,
        body: messageBody,
        messageKind: 'crew-onsite-briefing',
        billingCategory: 'crew_message',
        context: 'crew',
        senderPurpose: 'lgq_dispatch',
        idempotencyKey,
        crewId: input.crewId,
      },
      admin,
    );

    // If a new delivery was enqueued (not a duplicate replay), log to internal job timeline
    if (enqueued.created) {
      await createJobFeedEvent(admin, input.accountId, input.jobId, {
        kind: 'job_update',
        title: 'On-Site Crew Briefing Sent',
        body: `Briefed ${crewMember.name} on ${siteIntel.allInstructions.length} site special request(s) upon arrival.`,
        visibility: 'internal',
        author: 'System (Automated Briefing)',
        meta: {
          crewId: input.crewId,
          triggerSource: input.triggerSource ?? 'field_arrival',
          smsEventId: enqueued.eventId,
        },
      });
    }

    return {
      sent: true,
      eventId: enqueued.eventId,
      phone: normalizedPhone,
      message: messageBody,
    };
  } catch (err) {
    console.error('Failed to send on-site arrival briefing SMS:', err);
    return {
      sent: false,
      reason: 'enqueue_failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
