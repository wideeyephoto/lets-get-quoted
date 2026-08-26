import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { listServices } from '@/lib/services';
import { getSiteContent } from '@/lib/site-content';
import { getAvailableBookingDays } from '@/lib/booking';
import { normalizeUsPhone } from '@/lib/phone';

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
      .select('company_name, trade, city, state, zip')
      .eq('id', accountId)
      .maybeSingle(),
    listServices(admin, accountId).catch(() => []),
    admin
      .from('sites')
      .select('content, license')
      .eq('account_id', accountId)
      .maybeSingle(),
    getAvailableBookingDays(admin, accountId).catch(() => []),
    admin
      .from('voice_settings')
      .select('voice_tone, transfer_number, alert_phone')
      .eq('account_id', accountId)
      .maybeSingle(),
  ]);

  const companyName = account?.company_name?.trim() || 'our company';
  const trade = account?.trade?.trim() || 'home services contractor';
  const activeServices = services.filter((s) => s.active).map((s) => s.name);
  const voiceTone = (voiceSettings?.voice_tone as VoiceGroundingContext['voiceTone']) || 'professional';
  const forwardPhoneOffice = voiceSettings?.transfer_number || null;
  const forwardPhoneEmergency = voiceSettings?.alert_phone || null;

  // Determine service area from site content or account location
  const siteContent = site?.content ? getSiteContent(site.content as Record<string, unknown>) : null;
  const serviceAreas = (siteContent?.serviceAreas?.cities && siteContent.serviceAreas.cities.length > 0)
    ? siteContent.serviceAreas.cities.join(', ')
    : (account?.city ? `${account.city}${account.state ? `, ${account.state}` : ''}` : 'the local area');

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

  // Returning caller lookup
  let recognizedCaller: VoiceGroundingContext['recognizedCaller'] = null;
  if (callerPhone) {
    const normalized = normalizeUsPhone(callerPhone);
    if (normalized) {
      const [{ data: job }, { data: lead }] = await Promise.all([
        admin
          .from('jobs')
          .select('ref, client_name, address, scope, scheduled_for, scheduled_time')
          .eq('account_id', accountId)
          .eq('client_phone', normalized)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        admin
          .from('leads')
          .select('name, address, project_type')
          .eq('account_id', accountId)
          .eq('phone', normalized)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (job || lead) {
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
