// Daily crew morning dispatch briefings & run-sheet generator.
//
// Pure, deterministic, and dependency-free.
// Assembles the morning 7:00 AM dispatch text with scheduled stops, arrival
// windows, customer details, and 1-tap navigation links.

export type CrewBriefingStop = {
  jobRef: string;
  clientName: string;
  address: string;
  phone?: string | null;
  scheduledTime?: string | null;
  scope?: string | null;
  notes?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export type NavProvider = 'google' | 'apple' | 'waze';

export type CrewDailyBriefing = {
  crewName: string;
  businessName: string;
  date: string;
  stops: CrewBriefingStop[];
  portalUrl?: string | null;
  customNote?: string | null;
  weatherSummary?: string | null;
  navProvider?: NavProvider;
  includeFullRoute?: boolean;
  homeBaseAddress?: string | null;
  isUrgentUpdate?: boolean;
  includeMaterialsChecklist?: boolean;
  scheduledTiming?: 'now' | 'scheduled_7am';
};

/**
 * Builds direct Google Maps navigation URL for turn-by-turn routing.
 */
export function buildGoogleMapsNavUrl(address: string, lat?: number | null, lng?: number | null): string {
  if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }
  const clean = (address || '').trim();
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(clean)}`;
}

/**
 * Builds Apple Maps navigation URL for iOS techs.
 */
export function buildAppleMapsNavUrl(address: string, lat?: number | null, lng?: number | null): string {
  if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
    return `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
  }
  const clean = (address || '').trim();
  return `https://maps.apple.com/?daddr=${encodeURIComponent(clean)}&dirflg=d`;
}

/**
 * Builds Waze navigation URL for live traffic-optimized routing.
 */
export function buildWazeNavUrl(address: string, lat?: number | null, lng?: number | null): string {
  if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
    return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  }
  const clean = (address || '').trim();
  return `https://waze.com/ul?q=${encodeURIComponent(clean)}&navigate=yes`;
}

/**
 * Builds navigation URL matching the contractor's preferred mapping provider.
 */
export function buildNavUrl(
  provider: NavProvider = 'google',
  address: string,
  lat?: number | null,
  lng?: number | null
): string {
  if (provider === 'apple') return buildAppleMapsNavUrl(address, lat, lng);
  if (provider === 'waze') return buildWazeNavUrl(address, lat, lng);
  return buildGoogleMapsNavUrl(address, lat, lng);
}

/**
 * Builds a multi-stop whole-day navigation route URL linking all scheduled stops in order.
 */
export function buildFullDayRouteNavUrl(
  stops: CrewBriefingStop[],
  homeBase?: string | null,
  provider: NavProvider = 'google'
): string | null {
  const validStops = stops.filter((s) => s.address || (typeof s.lat === 'number' && typeof s.lng === 'number'));
  if (validStops.length === 0) return null;

  const points: string[] = [];
  if (homeBase && homeBase.trim()) points.push(encodeURIComponent(homeBase.trim()));

  for (const stop of validStops) {
    if (stop.address && stop.address.trim()) {
      points.push(encodeURIComponent(stop.address.trim()));
    } else if (typeof stop.lat === 'number' && typeof stop.lng === 'number') {
      points.push(`${stop.lat},${stop.lng}`);
    }
  }

  if (points.length === 0) return null;

  if (provider === 'apple') {
    // Apple Maps: first destination with daddr
    const first = validStops[0];
    return buildAppleMapsNavUrl(first.address, first.lat, first.lng);
  }
  if (provider === 'waze') {
    const first = validStops[0];
    return buildWazeNavUrl(first.address, first.lat, first.lng);
  }

  // Google Maps multi-stop URL: /dir/start/stop1/stop2/stop3
  if (points.length === 1) {
    return `https://www.google.com/maps/dir/?api=1&destination=${points[0]}`;
  }
  return `https://www.google.com/maps/dir/${points.join('/')}`;
}

/**
 * Formats a single stop line for concise SMS reading.
 */
export function formatBriefingStop(
  stop: CrewBriefingStop,
  index: number,
  provider: NavProvider = 'google'
): string {
  const time = stop.scheduledTime ? ` (${stop.scheduledTime})` : '';
  const first = (stop.clientName || 'Client').trim().split(/\s+/)[0] || 'Client';
  const navUrl = buildNavUrl(provider, stop.address, stop.lat, stop.lng);
  return `${index + 1}) [${stop.jobRef}] ${first}${time}: ${stop.address} -> ${navUrl}`;
}

/**
 * Generates clear, actionable morning dispatch SMS for field crews.
 */
export function buildCrewMorningBriefingSms(briefing: CrewDailyBriefing): string {
  const crewFirst = (briefing.crewName || 'Team').trim().split(/\s+/)[0] || 'Team';
  const business = (briefing.businessName || 'our team').trim();
  const stopCount = briefing.stops.length;
  const provider = briefing.navProvider || 'google';

  const weatherSection = briefing.weatherSummary ? `\n🌤️ Weather: ${briefing.weatherSummary.trim()}` : '';
  const noteSection = briefing.customNote ? `\n📌 Note: ${briefing.customNote.trim()}` : '';

  if (stopCount === 0) {
    const zeroHead = briefing.isUrgentUpdate
      ? `🚨 URGENT SCHEDULE UPDATE: Hi ${crewFirst}, you have no remaining scheduled stops for ${briefing.date} with ${business}.`
      : `Good morning ${crewFirst}! You have no scheduled stops on your run-sheet for ${briefing.date} with ${business}.`;
    return `${zeroHead}${weatherSection}${noteSection} Enjoy your day! Reply STOP to opt out.`;
  }

  const stopLabel = stopCount === 1 ? '1 stop' : `${stopCount} stops`;
  const stopsSummary = briefing.stops.map((stop, i) => formatBriefingStop(stop, i, provider)).join('\n');

  let materialsSection = '';
  if (briefing.includeMaterialsChecklist) {
    const materials = briefing.stops
      .map((s, i) => (s.scope ? `${i + 1}) ${s.scope}` : null))
      .filter(Boolean);
    if (materials.length > 0) {
      materialsSection = `\n🧰 Truck Packing & Scopes:\n${materials.join('\n')}`;
    }
  }

  let fullRouteSection = '';
  if (briefing.includeFullRoute !== false && stopCount > 1) {
    const fullRouteUrl = buildFullDayRouteNavUrl(briefing.stops, briefing.homeBaseAddress, provider);
    if (fullRouteUrl) {
      fullRouteSection = `\n🚗 Full Route (All Stops): ${fullRouteUrl}`;
    }
  }

  const portalLink = briefing.portalUrl ? `\nOpen Field App: ${briefing.portalUrl}` : '';

  const head = briefing.isUrgentUpdate
    ? `🚨 URGENT SCHEDULE UPDATE from ${business}!\nHi ${crewFirst}, your route for ${briefing.date} has been updated (${stopLabel}):`
    : `☀️ Good morning ${crewFirst}! Here is your schedule for ${briefing.date} with ${business} (${stopLabel}):`;

  return `${head}${weatherSection}${noteSection}\n${stopsSummary}${materialsSection}${fullRouteSection}${portalLink}\nReply STOP to opt out.`;
}

/**
 * Generates a clean, detailed multi-line text run-sheet suitable for clipboard sharing
 * (WhatsApp, iMessage, Slack, email) or printed briefings.
 */
export function buildCrewDailyRunSheetText(briefing: CrewDailyBriefing): string {
  const crewName = briefing.crewName || 'Field Crew';
  const business = briefing.businessName || 'Our Business';
  const provider = briefing.navProvider || 'google';

  const docTitle = briefing.isUrgentUpdate ? '🚨 URGENT DISPATCH RUN-SHEET' : '📋 DAILY DISPATCH RUN-SHEET';
  const header = `${docTitle}: ${briefing.date}\nAssigned: ${crewName} (${business})\nTotal Stops: ${briefing.stops.length}`;
  const weather = briefing.weatherSummary ? `\n\n🌤️ WEATHER OUTLOOK:\n${briefing.weatherSummary.trim()}` : '';
  const note = briefing.customNote ? `\n\n📌 DAILY NOTES:\n${briefing.customNote.trim()}` : '';

  if (briefing.stops.length === 0) {
    return `${header}${weather}${note}\n\nNo stops scheduled for this day.`;
  }

  let materialsList = '';
  if (briefing.includeMaterialsChecklist) {
    const checklistItems = briefing.stops
      .map((s, i) => `[ ] Stop #${i + 1} (${s.clientName || 'Job'}): ${s.scope || 'Standard tools / materials'}`)
      .join('\n');
    materialsList = `\n\n🧰 TRUCK PACKING & MATERIALS CHECKLIST:\n${checklistItems}`;
  }

  let fullRoute = '';
  if (briefing.includeFullRoute !== false && briefing.stops.length > 1) {
    const fullRouteUrl = buildFullDayRouteNavUrl(briefing.stops, briefing.homeBaseAddress, provider);
    if (fullRouteUrl) {
      fullRoute = `\n\n🚗 FULL-DAY MASTER ROUTE:\n${fullRouteUrl}`;
    }
  }

  const stopsList = briefing.stops
    .map((stop, index) => {
      const time = stop.scheduledTime ? `⏰ Scheduled: ${stop.scheduledTime}` : '⏰ Scheduled: Anytime / Unset';
      const client = stop.clientName ? `👤 Client: ${stop.clientName}` : '';
      const phone = stop.phone ? `📞 Phone: ${stop.phone}` : '';
      const address = stop.address ? `📍 Address: ${stop.address}` : '';
      const nav = `🗺️ Nav (${provider.toUpperCase()}): ${buildNavUrl(provider, stop.address, stop.lat, stop.lng)}`;
      const scope = stop.scope ? `📝 Scope: ${stop.scope}` : '';
      const notes = stop.notes ? `💬 Notes: ${stop.notes}` : '';

      const lines = [
        `Stop #${index + 1} [${stop.jobRef}]`,
        time,
        client,
        phone,
        address,
        nav,
        scope,
        notes,
      ].filter(Boolean);

      return lines.join('\n');
    })
    .join('\n\n---\n\n');

  const fieldApp = briefing.portalUrl ? `\n\n🔗 Crew Field Portal: ${briefing.portalUrl}` : '';

  return `${header}${weather}${note}${materialsList}${fullRoute}\n\n${stopsList}${fieldApp}`;
}
