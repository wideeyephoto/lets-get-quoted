import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { listServices } from '@/lib/services';
import { getSiteContent } from '@/lib/site-content';

export type VoiceGroundingContext = {
  companyName: string;
  trade: string;
  serviceNames: string[];
  serviceAreas: string;
  availableSlots: string[];
  customGreeting?: string | null;
};

/**
 * Loads dynamic grounding context for the AI receptionist:
 * - Company trade & services
 * - Service territories
 * - Next 3 business days schedule availability
 */
export async function loadVoiceGroundingContext(
  admin: SupabaseClient,
  accountId: string,
): Promise<VoiceGroundingContext> {
  const [
    { data: account },
    services,
    { data: site },
  ] = await Promise.all([
    admin
      .from('accounts')
      .select('company_name, trade, city, state, zip')
      .eq('id', accountId)
      .maybeSingle(),
    listServices(admin, accountId).catch(() => []),
    admin
      .from('sites')
      .select('content')
      .eq('account_id', accountId)
      .maybeSingle(),
  ]);

  const companyName = account?.company_name?.trim() || 'our company';
  const trade = account?.trade?.trim() || 'home services contractor';
  const activeServices = services.filter((s) => s.active).map((s) => s.name);

  // Determine service area from site content or account location
  const siteContent = site?.content ? getSiteContent(site.content as Record<string, unknown>) : null;
  const serviceAreas = (siteContent?.serviceAreas?.cities && siteContent.serviceAreas.cities.length > 0)
    ? siteContent.serviceAreas.cities.join(', ')
    : (account?.city ? `${account.city}${account.state ? `, ${account.state}` : ''}` : 'the local area');

  // Compute realistic booking windows for the next 3 business days
  const availableSlots = computeUpcomingSlots(3);

  return {
    companyName,
    trade,
    serviceNames: activeServices,
    serviceAreas,
    availableSlots,
  };
}

/**
 * Formats open morning/afternoon dispatch windows for the upcoming business days.
 */
function computeUpcomingSlots(daysCount: number): string[] {
  const slots: string[] = [];
  const now = new Date();
  let added = 0;
  let offset = 1;

  while (added < daysCount && offset < 7) {
    const candidate = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    const dayOfWeek = candidate.getDay();
    // Monday (1) to Friday (5)
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      const dayName = candidate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      slots.push(`${dayName} (Morning: 8 AM – 12 PM or Afternoon: 1 PM – 5 PM)`);
      added++;
    }
    offset++;
  }

  return slots;
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
    : 'We have availability later this week.';

  return [
    `You are the professional AI phone receptionist for "${context.companyName}", a licensed ${context.trade} business serving ${context.serviceAreas}.`,
    `The opening greeting and AI disclosure have already been played to the caller; do not repeat them unless asked.`,
    serviceList,
    `Your goal is to warmly assist the caller, identify their project needs, and collect their intake details:`,
    `1. Caller's full name and best callback phone number.`,
    `2. Exact service address or neighborhood.`,
    `3. Description of the work needed and whether it is an urgent emergency (e.g. water leak, power hazard, gas smell, heating out).`,
    `4. Preferred appointment window. ${slotsText} If they suggest a time, let them know you will pencil it in for the team to confirm.`,
    `Guidelines:`,
    `- Keep answers concise, friendly, and natural for phone audio (1-2 sentences per turn).`,
    `- If asked for a price estimate, explain that we provide clear, upfront quotes after reviewing the job scope.`,
    `- Never promise an exact guaranteed price on the phone or declare an appointment officially confirmed without team review.`,
    `- If the caller insists on speaking to a live person immediately and a transfer is available, connect them right away.`,
  ].join(' ');
}

export function buildVoicePostPrompt(): string {
  return 'Summarise: (1) Caller Name, (2) Callback Phone, (3) Service Address, '
    + '(4) Work Requested, (5) Urgency Level (Emergency vs Routine), (6) Preferred Appointment Slot. '
    + 'Note if any details were omitted.';
}
