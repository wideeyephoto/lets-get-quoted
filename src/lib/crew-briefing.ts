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

  if (stopCount === 0) {
    return `Good morning ${crewFirst}! You have no scheduled stops on your run-sheet for ${briefing.date} with ${business}. Enjoy your day! Reply STOP to opt out.`;
  }

  const stopLabel = stopCount === 1 ? '1 stop' : `${stopCount} stops`;
  const stopsSummary = briefing.stops.map((stop, i) => formatBriefingStop(stop, i)).join('\n');

  const portalLink = briefing.portalUrl ? `\nOpen Field App: ${briefing.portalUrl}` : '';

  return `☀️ Good morning ${crewFirst}! Here is your schedule for ${briefing.date} with ${business} (${stopLabel}):\n${stopsSummary}${portalLink}\nReply STOP to opt out.`;
}
