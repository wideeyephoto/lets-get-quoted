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

export type CrewDailyBriefing = {
  crewName: string;
  businessName: string;
  date: string;
  stops: CrewBriefingStop[];
  portalUrl?: string | null;
  customNote?: string | null;
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
 * Formats a single stop line for concise SMS reading.
 */
export function formatBriefingStop(stop: CrewBriefingStop, index: number): string {
  const time = stop.scheduledTime ? ` (${stop.scheduledTime})` : '';
  const first = (stop.clientName || 'Client').trim().split(/\s+/)[0] || 'Client';
  const navUrl = buildGoogleMapsNavUrl(stop.address, stop.lat, stop.lng);
  return `${index + 1}) [${stop.jobRef}] ${first}${time}: ${stop.address} -> ${navUrl}`;
}

/**
 * Generates clear, actionable morning dispatch SMS for field crews.
 */
export function buildCrewMorningBriefingSms(briefing: CrewDailyBriefing): string {
  const crewFirst = (briefing.crewName || 'Team').trim().split(/\s+/)[0] || 'Team';
  const business = (briefing.businessName || 'our team').trim();
  const stopCount = briefing.stops.length;
  const noteSection = briefing.customNote ? `\n📌 Note: ${briefing.customNote.trim()}` : '';

  if (stopCount === 0) {
    return `Good morning ${crewFirst}! You have no scheduled stops on your run-sheet for ${briefing.date} with ${business}.${noteSection} Enjoy your day! Reply STOP to opt out.`;
  }

  const stopLabel = stopCount === 1 ? '1 stop' : `${stopCount} stops`;
  const stopsSummary = briefing.stops.map((stop, i) => formatBriefingStop(stop, i)).join('\n');

  const portalLink = briefing.portalUrl ? `\nOpen Field App: ${briefing.portalUrl}` : '';

  return `☀️ Good morning ${crewFirst}! Here is your schedule for ${briefing.date} with ${business} (${stopLabel}):${noteSection}\n${stopsSummary}${portalLink}\nReply STOP to opt out.`;
}

/**
 * Generates a clean, detailed multi-line text run-sheet suitable for clipboard sharing
 * (WhatsApp, iMessage, Slack, email) or printed briefings.
 */
export function buildCrewDailyRunSheetText(briefing: CrewDailyBriefing): string {
  const crewName = briefing.crewName || 'Field Crew';
  const business = briefing.businessName || 'Our Business';
  const header = `📋 DAILY DISPATCH RUN-SHEET: ${briefing.date}\nAssigned: ${crewName} (${business})\nTotal Stops: ${briefing.stops.length}`;
  const note = briefing.customNote ? `\n\n📌 DAILY NOTES:\n${briefing.customNote.trim()}` : '';

  if (briefing.stops.length === 0) {
    return `${header}${note}\n\nNo stops scheduled for this day.`;
  }

  const stopsList = briefing.stops
    .map((stop, index) => {
      const time = stop.scheduledTime ? `⏰ Scheduled: ${stop.scheduledTime}` : '⏰ Scheduled: Anytime / Unset';
      const client = stop.clientName ? `👤 Client: ${stop.clientName}` : '';
      const phone = stop.phone ? `📞 Phone: ${stop.phone}` : '';
      const address = stop.address ? `📍 Address: ${stop.address}` : '';
      const nav = `🗺️ Nav: ${buildGoogleMapsNavUrl(stop.address, stop.lat, stop.lng)}`;
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

  return `${header}${note}\n\n${stopsList}${fieldApp}`;
}
