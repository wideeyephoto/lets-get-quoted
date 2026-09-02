import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { listServices } from '@/lib/services';
import { getSiteContent } from '@/lib/site-content';
import { getAvailableBookingDays } from '@/lib/booking';
import { displayPhone, formatPhoneDashes, normalizeUsPhone } from '@/lib/phone';

export type VoiceGroundingContext = {
  companyName: string;
  trade: string;
  serviceNames: string[];
  serviceAreas: string;
  availableSlots: string[];
  isLicensed?: boolean;
  licenseNumber?: string | null;
  customGreeting?: string | null;
  voiceTone?: 'friendly' | 'professional' | 'urgent_dispatcher' | null;
  forwardPhoneOffice?: string | null;
  forwardPhoneAfterHours?: string | null;
  forwardPhoneEmergency?: string | null;
  contractorStaffCaller?: {
    name: string;
    role: 'owner' | 'crew' | 'office';
  } | null;
  recognizedCaller?: {
    clientName?: string | null;
    serviceAddress?: string | null;
    activeJobRef?: string | null;
    activeJobScope?: string | null;
    scheduledFor?: string | null;
  } | null;
  faqs?: Array<{ question: string; answer: string }>;
  warrantyPolicy?: string | null;
  financingAvailable?: boolean;
};

/**
 * Loads dynamic grounding context for the AI receptionist:
 * - Company trade & services
 * - Service territories
 * - Real capacity-aware schedule availability
 * - Verified licensing status
 * - Returning caller recognition and active job history
 * - Published FAQs and business policies
 */
export async function loadVoiceGroundingContext(
  admin: SupabaseClient,
  accountId: string,
  callerPhone?: string | null,
): Promise<VoiceGroundingContext> {
  const [
    { data: account },
    services,
    { data: site },
    bookingDays,
    { data: voiceSettings },
  ] = await Promise.all([
    admin
      .from('accounts')
      .select('id, business_name, alert_phone, call_forward_number, timezone')
      .eq('id', accountId)
      .maybeSingle(),
    listServices(admin, accountId).catch(() => []),
    admin
      .from('sites')
      .select('company_name, phone, license, service_area, content')
      .eq('account_id', accountId)
      .maybeSingle(),
    getAvailableBookingDays(admin, accountId).catch(() => []),
    admin
      .from('voice_settings')
      .select('voice_tone, transfer_number, emergency_transfer_number')
      .eq('account_id', accountId)
      .maybeSingle(),
  ]);

  const siteContent = site?.content ? getSiteContent(site.content as Record<string, unknown>) : null;
  const companyName = site?.company_name?.trim() || account?.business_name?.trim() || 'our company';
  const trade = (siteContent?.trade as string | undefined)?.trim() || 'home services contractor';
  const activeServices = services.filter((s) => s.active).map((s) => s.name);
  const voiceTone = (voiceSettings?.voice_tone as VoiceGroundingContext['voiceTone']) || 'professional';
  const forwardPhoneOffice = voiceSettings?.transfer_number || null;
  const forwardPhoneEmergency = voiceSettings?.emergency_transfer_number || account?.alert_phone || null;

  // Determine service area from site content or site record
  const serviceAreas = (siteContent?.serviceAreas?.cities && siteContent.serviceAreas.cities.length > 0)
    ? siteContent.serviceAreas.cities.join(', ')
    : (site?.service_area?.trim() || 'the local area');

  // Compute realistic booking windows from genuine capacity
  let availableSlots: string[] = [];
  if (bookingDays && bookingDays.length > 0) {
    availableSlots = bookingDays.slice(0, 3).map((d) => {
      const windowNames = d.slots.map((s) => s.label);
      return windowNames.length > 0
        ? `${d.dayLabel} (${windowNames.join(' or ')})`
        : d.dayLabel;
    });
  }

  const rawLicense = typeof site?.license === 'string' ? site.license.trim() : null;
  const isLicensed = Boolean(rawLicense);

  // Published FAQs from site content
  const faqs = siteContent?.faqs?.enabled && Array.isArray(siteContent.faqs.items)
    ? siteContent.faqs.items.slice(0, 5).map((f) => ({
        question: f.question,
        answer: f.answer,
      }))
    : [];

  // Returning caller lookup & Contractor Staff lookup
  let recognizedCaller: VoiceGroundingContext['recognizedCaller'] = null;
  let contractorStaffCaller: VoiceGroundingContext['contractorStaffCaller'] = null;

  if (callerPhone) {
    const normalized = normalizeUsPhone(callerPhone);
    if (normalized) {
      const digits = normalized.replace(/\D/g, '');
      const tenDigits = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
      const candidatePhones = Array.from(new Set([
        normalized,
        digits,
        tenDigits,
        `+${digits}`,
        formatPhoneDashes(tenDigits),
        displayPhone(normalized),
        callerPhone.trim(),
      ].filter(Boolean))) as string[];

      // Check owner numbers on account and site
      const isOwnerAccountPhone = Boolean(
        (account?.alert_phone && normalizeUsPhone(account.alert_phone) === normalized) ||
        (account?.call_forward_number && normalizeUsPhone(account.call_forward_number) === normalized) ||
        (voiceSettings?.transfer_number && normalizeUsPhone(voiceSettings.transfer_number) === normalized) ||
        (site?.phone && normalizeUsPhone(site.phone) === normalized),
      );

      const staffLookupPromise = admin
        .from('memberships')
        .select('user_id, role')
        .eq('account_id', accountId)
        .in('role', ['owner', 'office'])
        .order('created_at', { ascending: true })
        .limit(5)
        .then(async ({ data: members }) => {
          if (!Array.isArray(members) || members.length === 0) return [];
          const users = await Promise.all(
            members.map(async (m) => {
              try {
                const { data: userData } = await admin.auth.admin.getUserById(m.user_id);
                const user = userData?.user;
                const meta = user?.user_metadata;
                const name = (meta?.full_name || meta?.name || meta?.first_name || '').trim() || null;
                const authPhone = user?.phone ? normalizeUsPhone(user.phone) : null;
                return { name, authPhone, role: m.role as 'owner' | 'office' };
              } catch {
                return null;
              }
            }),
          );
          return users.filter(Boolean) as Array<{ name: string | null; authPhone: string | null; role: 'owner' | 'office' }>;
        });

      const crewPromise = admin
        .from('crew')
        .select('id, name, phone, active, user_id, last_signed_in_at, phone_verified_at, phone_verified, role_label')
        .eq('account_id', accountId)
        .eq('active', true)
        .then(({ data }) => (Array.isArray(data) ? data : []));

      const jobPromise = admin
        .from('jobs')
        .select('ref, client_name, address, scope, scheduled_for, scheduled_time')
        .eq('account_id', accountId)
        .in('client_phone', candidatePhones)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => data ?? null);

      const leadPromise = admin
        .from('leads')
        .select('name, address, project_type')
        .eq('account_id', accountId)
        .in('phone', candidatePhones)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => data ?? null);

      const [staffUsers, activeCrew, job, lead] = await Promise.all([
        staffLookupPromise,
        crewPromise,
        jobPromise,
        leadPromise,
      ]);

      const matchedStaffUser = staffUsers.find((u) => u.authPhone && u.authPhone === normalized);
      const ownerRecord = staffUsers.find((u) => u.role === 'owner');
      const matchedCrewMember = activeCrew.find(
        (c) => c.phone && normalizeUsPhone(c.phone) === normalized,
      );

      if (isOwnerAccountPhone) {
        const ownerName = ownerRecord?.name || account?.business_name || site?.company_name || 'Owner';
        contractorStaffCaller = { name: ownerName, role: 'owner' };
      } else if (matchedStaffUser) {
        const staffName = matchedStaffUser.name || (matchedStaffUser.role === 'owner' ? 'Owner' : 'Office Staff');
        contractorStaffCaller = { name: staffName, role: matchedStaffUser.role };
      } else if (matchedCrewMember) {
        contractorStaffCaller = {
          name: matchedCrewMember.name || 'Team Member',
          role: 'crew',
        };
      } else if (job || lead) {
        recognizedCaller = {
          clientName: job?.client_name || lead?.name || null,
          serviceAddress: job?.address || lead?.address || null,
          activeJobRef: job?.ref || null,
          activeJobScope: job?.scope || lead?.project_type || null,
          scheduledFor: job?.scheduled_for
            ? `${job.scheduled_for}${job.scheduled_time ? ` at ${job.scheduled_time}` : ''}`
            : null,
        };
      }
    }
  }

  return {
    companyName,
    trade,
    serviceNames: activeServices,
    serviceAreas,
    availableSlots,
    isLicensed,
    licenseNumber: rawLicense,
    recognizedCaller,
    contractorStaffCaller,
    faqs,
    voiceTone,
    forwardPhoneOffice,
    forwardPhoneEmergency,
  };
}

/**
 * Builds the AI system instruction prompt grounded in the contractor's real business facts.
 */
export function buildVoiceSystemPrompt(context: VoiceGroundingContext): string {
  // If the caller is the business owner or crew member, switch to Contractor Voice Assistant mode
  if (context.contractorStaffCaller) {
    const staff = context.contractorStaffCaller;
    const rawFirst = staff.name ? staff.name.trim().split(/\s+/)[0] : '';
    const greetingName = rawFirst && rawFirst !== 'Owner' ? rawFirst : 'there';
    return [
      `[ROLE & IDENTITY - CONTRACTOR VOICE ASSISTANT]`,
      `You are the dedicated AI Field Assistant for "${context.companyName}", speaking directly with ${staff.name} (${staff.role === 'owner' ? 'Business Owner' : 'Field Crew'}).`,
      `Tone & Demeanor: Efficient, capable, smart, and direct. The contractor is calling while driving, between jobs, or on-site to add/update jobs, create leads, and log work.`,
      `The greeting and opening disclosure have already been played. Greet them by name: "Hey ${greetingName}, what job or lead are you updating today?"`,
      ``,
      `[AVAILABLE CONTRACTOR TOOLS]`,
      `1. update_job_details: Update job scope, quote line items, schedule date/time, tasks, or status (e.g. "We finished the rough-in on Miller's job, add 4 recessed lights for $650, schedule final for Tuesday").`,
      `2. create_or_update_lead: Create a new customer lead or update an existing lead (e.g. "Take a new lead for John Davis at 142 Elm St, roof leak, phone 555-0199, needs inspection Friday").`,
      `3. log_crew_time_and_materials: Log hours worked, materials purchased/used, and cost notes for a job.`,
      `4. create_job_change_order: Record extra unforeseen work or scope changes requiring a change order.`,
      `5. append_job_caution_or_note: Add an internal note, safety warning, gate code, pet caution, or special request to a job or client record (e.g. "Add a caution on the Miller job: gate code is 4821 and watch out for the dog", or "Note on Davis: delicate historic brick, use soft wash only").`,
      ``,
      `[BEHAVIOR & CONVERSATION FLOW]`,
      `- Listen carefully to the contractor's spoken instructions.`,
      `- Execute the appropriate tool immediately with the extracted parameters.`,
      `- Confirm the update in 1 short, crisp sentence (e.g., "Got it, I updated the Miller job and added the 4 recessed lights to the quote for $650.").`,
      `- Ask: "Is there anything else you'd like to update on that job?"`,
    ].join('\n');
  }

  const serviceList = context.serviceNames.length > 0
    ? `Our primary services include: ${context.serviceNames.slice(0, 10).join(', ')}.`
    : `We provide professional ${context.trade} services.`;

  const slotsText = context.availableSlots.length > 0
    ? `We currently have available appointment windows on: ${context.availableSlots.join('; ')}.`
    : 'Our service calendar is open for booking requests and our dispatch team will review open times.';

  const licenseClause = context.isLicensed
    ? `a licensed ${context.trade} business`
    : `a professional ${context.trade} business`;

  const toneDirectives = context.voiceTone === 'friendly'
    ? 'Tone & Demeanor: Warm, neighborly, and empathetic. Build personal connection with the homeowner while remaining helpful and concise.'
    : context.voiceTone === 'urgent_dispatcher'
    ? 'Tone & Demeanor: Focused, rapid, and safety-first. Prioritize emergency assessment, direct schedule availability, and fast resolution.'
    : 'Tone & Demeanor: Polished, professional, and clear. Maintain a calm, authoritative business tone.';

  const sections: string[] = [
    `[ROLE & IDENTITY]`,
    `You are the AI phone receptionist for "${context.companyName}", ${licenseClause} serving ${context.serviceAreas}.`,
    toneDirectives,
    `The opening greeting and AI disclosure have already been played to the caller; do not repeat them unless asked.`,
  ];

  if (context.recognizedCaller?.clientName) {
    const r = context.recognizedCaller;
    sections.push(
      `[RECOGNIZED CALLER CONTEXT]`,
      `The caller is recognized as ${r.clientName}${r.serviceAddress ? ` at ${r.serviceAddress}` : ''}.${r.activeJobRef ? ` They have active project ${r.activeJobRef}${r.activeJobScope ? ` (${r.activeJobScope})` : ''}.` : ''}${r.scheduledFor ? ` Their scheduled appointment is on ${r.scheduledFor}.` : ''}`,
      `You may greet them warmly by name if appropriate, but never disclose sensitive financial details without verification.`,
    );
  }

  sections.push(
    `[BUSINESS FACTS & SERVICES]`,
    serviceList,
  );

  if (context.faqs && context.faqs.length > 0) {
    const faqLines = context.faqs.map((f) => `Q: ${f.question} A: ${f.answer}`).join(' ');
    sections.push(`Approved FAQs: ${faqLines}`);
  }

  sections.push(
    `[REAL CAPACITY & SCHEDULING]`,
    slotsText,
    `Use the check_available_slots tool to check open calendar windows by date, and use the book_appointment_slot tool to directly lock in an appointment slot and text a confirmation to the caller.`,
    `[INTAKE GOALS & BEHAVIOR]`,
    `Warmly collect or verify the caller's intake details: (1) Full name and best callback number, (2) Exact service address, (3) Detailed issue description and urgency, (4) Preferred appointment window.`,
    `- Keep replies concise, polite, and natural for phone audio (1 to 2 sentences per turn).`,
    `- If asked for a price estimate, explain that we provide clear, upfront quotes after reviewing the job scope.`,
    `- If the caller asks whether a permit or city inspection is required, use check_permit_requirement.`,
    `- If the caller asks about municipal inspection status for their existing job, use check_inspection_status.`,
    `- If the caller asks for clean energy or IRA rebates, use check_rebates_and_incentives.`,
    `- If the caller insists on speaking to a live person and a transfer tool is available, use transfer_to_business.`,
  );

  return sections.join('\n');
}

export function buildVoicePostPrompt(): string {
  return [
    'Return a valid JSON object summarizing this call intake. Output only the JSON object without markdown fences or extra prose.',
    '{',
    '  "caller_name": string or null,',
    '  "caller_phone": string or null,',
    '  "service_address": string or null,',
    '  "work_requested": string,',
    '  "urgency": "emergency" | "urgent" | "normal",',
    '  "is_emergency": boolean,',
    '  "hazard_type": string or null,',
    '  "requested_slot": string or null,',
    '  "booked_slot": string or null,',
    '  "transfer_requested": boolean,',
    '  "follow_up_action": "callback_required" | "booked" | "quote_needed" | "none",',
    '  "confidence": number',
    '}',
  ].join('\n');
}
