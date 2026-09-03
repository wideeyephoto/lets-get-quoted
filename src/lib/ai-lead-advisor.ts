import type { LeadViewItem } from '@/app/dashboard/leads/LeadsWorkspace';
import type { MapPin } from '@/components/pin-map';

export type LeadAdvisorRecommendation = {
  headline: string;
  summary: string;
  metrics: { icon: string; label: string; tone?: 'accent' | 'good' | 'warn' }[];
  action: {
    type: 'sms' | 'visit' | 'call' | 'quote';
    label: string;
    href: string;
    suggestedBody?: string;
  };
  score: number;
  clusterJob?: {
    title: string;
    address?: string;
    scheduled?: string;
    distanceMiles: number;
  };
};

export type AdvisorState = 'visible' | 'snoozed' | 'dismissed';

/**
 * Calculates straight-line distance in miles between two coordinates via Haversine formula.
 */
export function haversineDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth's radius in miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Finds the nearest scheduled job pin to this lead from available map pins.
 */
export function findNearestScheduledJob(
  leadPin: MapPin | undefined,
  mapPins: MapPin[],
  maxRadiusMiles = 25,
): { title: string; address?: string; scheduled?: string; distanceMiles: number } | null {
  if (!leadPin || leadPin.lat == null || leadPin.lng == null) return null;

  let nearest: { title: string; address?: string; scheduled?: string; distanceMiles: number } | null = null;
  let minDistance = Infinity;

  for (const pin of mapPins) {
    if (pin.kind !== 'scheduled' || pin.lat == null || pin.lng == null) continue;
    const dist = haversineDistanceMiles(leadPin.lat, leadPin.lng, pin.lat, pin.lng);
    if (dist < minDistance && dist <= maxRadiusMiles) {
      minDistance = dist;
      const scheduledRow = pin.rows?.find((r) => r.label === 'Scheduled')?.value;
      nearest = {
        title: pin.label,
        address: pin.sublabel,
        scheduled: scheduledRow && scheduledRow !== 'No date set' ? scheduledRow : undefined,
        distanceMiles: dist,
      };
    }
  }

  return nearest;
}

/**
 * Analyzes lead characteristics and optional map pins to generate an AI advisor recommendation.
 */
export function generateLeadAdvisorRecommendation(
  lead: LeadViewItem,
  mapPins: MapPin[] = [],
  base = '/dashboard',
): LeadAdvisorRecommendation {
  const firstName = lead.name.split(' ')[0] || 'there';
  const projectType = lead.projectType || lead.detail || 'project';
  const leadPin = mapPins.find((p) => p.id === `lead-${lead.id}`);
  const cluster = findNearestScheduledJob(leadPin, mapPins);

  const metrics: { icon: string; label: string; tone?: 'accent' | 'good' | 'warn' }[] = [];
  let score = 50;

  // 1. Proximity / Route clustering
  if (cluster) {
    metrics.push({
      icon: '🚗',
      label: `${cluster.distanceMiles} mi from ${cluster.address ? cluster.address.split(',')[0] : 'nearby job'}`,
      tone: cluster.distanceMiles <= 5 ? 'good' : 'accent',
    });
    score += Math.max(0, 30 - Math.round(cluster.distanceMiles * 2));
  } else if (lead.city) {
    metrics.push({ icon: '📍', label: lead.city });
  }

  // 2. Revenue potential
  const estMidpoint = lead.estimate
    ? Math.round((lead.estimate.min + lead.estimate.max) / 2)
    : lead.estimatedHours
      ? lead.estimatedHours * 150
      : null;

  if (estMidpoint && estMidpoint >= 3500) {
    metrics.push({
      icon: '💰',
      label: lead.estimateLabel || `~$${estMidpoint.toLocaleString()} est`,
      tone: 'accent',
    });
    score += 20;
  } else if (lead.estimateLabel) {
    metrics.push({ icon: '💰', label: lead.estimateLabel });
  }

  // 3. Urgency & Age
  if (lead.waitingShort) {
    metrics.push({ icon: '⏱️', label: `${lead.waitingShort} waiting`, tone: lead.isUrgent ? 'warn' : undefined });
    if (lead.isUrgent) score += 15;
  }

  if (lead.textOnly) {
    metrics.push({ icon: '💬', label: 'Prefers text', tone: 'accent' });
  }

  // Generate actionable recommendation
  if (cluster && cluster.distanceMiles <= 15) {
    const nearbySnippet = cluster.address ? cluster.address.split(',')[0] : 'your area';
    const timeSnippet = cluster.scheduled ? ` around ${cluster.scheduled}` : ' tomorrow';
    const suggestedBody = `Hi ${firstName}, our crew has a job scheduled near ${nearbySnippet}${timeSnippet}—could we stop by to inspect your ${projectType}?`;
    
    return {
      headline: '⚡ Route Cluster Opportunity',
      summary: `You have a scheduled crew job ${cluster.distanceMiles} mi away${cluster.scheduled ? ` (${cluster.scheduled})` : ''}. Group an on-site estimate visit to eliminate windshield time.`,
      metrics,
      action: lead.phone
        ? {
            type: 'sms',
            label: '💬 Send 1-Tap Route SMS',
            suggestedBody,
            href: `sms:${lead.phone}?body=${encodeURIComponent(suggestedBody)}`,
          }
        : {
            type: 'visit',
            label: '📅 Book Route Visit',
            href: `${base}/leads/${lead.id}#availability-snapshot`,
          },
      score,
      clusterJob: cluster,
    };
  }

  // High ticket / urgent priority
  if (estMidpoint && estMidpoint >= 3500) {
    const suggestedBody = `Hi ${firstName}, thanks for reaching out to us regarding your ${projectType}! I reviewed the details and would love to get you an accurate quote—are you available for a quick 5-minute call today?`;

    return {
      headline: '🔥 High-Value Target ($' + estMidpoint.toLocaleString() + ' Est)',
      summary: `High-ticket project with substantial margin potential. Fast response dramatically increases conversion before competitor outreach.`,
      metrics,
      action: lead.textOnly && lead.phone
        ? {
            type: 'sms',
            label: '💬 Send Priority SMS',
            suggestedBody,
            href: `sms:${lead.phone}?body=${encodeURIComponent(suggestedBody)}`,
          }
        : lead.phone
          ? {
              type: 'call',
              label: '📞 Call Customer Now',
              href: `tel:${lead.phone}`,
            }
          : {
              type: 'quote',
              label: '📝 Draft High-Value Quote',
              href: `${base}/leads/${lead.id}#lead-estimate`,
            },
      score,
    };
  }

  // Default Fast-Response recommendation
  const defaultBody = `Hi ${firstName}, thanks for contacting us about your ${projectType}! When would be a good time for us to discuss your project?`;

  return {
    headline: lead.textOnly ? '💬 Fast-Track SMS' : '⚡ Recommended Next Action',
    summary: lead.textOnly
      ? 'Homeowner requested text messages first. Send an introductory text to establish immediate contact.'
      : 'Reach out to confirm site details and advance this lead to an estimate visit.',
    metrics,
    action: lead.phone
      ? {
          type: 'sms',
          label: '💬 Send Quick Text',
          suggestedBody: defaultBody,
          href: `sms:${lead.phone}?body=${encodeURIComponent(defaultBody)}`,
        }
      : {
          type: 'visit',
          label: '📅 Schedule Estimate Visit',
          href: `${base}/leads/${lead.id}#availability-snapshot`,
        },
    score,
  };
}

/**
 * Reads the dismiss/snooze state from localStorage for a given lead.
 */
export function getAdvisorState(leadId: string): { state: AdvisorState; snoozedUntil?: number } {
  if (typeof window === 'undefined') return { state: 'visible' };
  try {
    const raw = localStorage.getItem(`lgq_advisor_${leadId}`);
    if (!raw) return { state: 'visible' };
    const parsed = JSON.parse(raw);
    if (parsed.dismissed) return { state: 'dismissed' };
    if (parsed.snoozedUntil && Date.now() < parsed.snoozedUntil) {
      return { state: 'snoozed', snoozedUntil: parsed.snoozedUntil };
    }
    return { state: 'visible' };
  } catch {
    return { state: 'visible' };
  }
}

/**
 * Persists a permanent dismissal for this lead's advisor recommendation.
 */
export function setAdvisorDismissed(leadId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`lgq_advisor_${leadId}`, JSON.stringify({ dismissed: true }));
  } catch {}
}

/**
 * Persists a temporary snooze (default 24 hours).
 */
export function setAdvisorSnoozed(leadId: string, hours = 24): void {
  if (typeof window === 'undefined') return;
  try {
    const snoozedUntil = Date.now() + hours * 60 * 60 * 1000;
    localStorage.setItem(`lgq_advisor_${leadId}`, JSON.stringify({ snoozedUntil }));
  } catch {}
}

/**
 * Clears dismiss/snooze state, restoring the advisor banner to visible.
 */
export function clearAdvisorState(leadId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(`lgq_advisor_${leadId}`);
  } catch {}
}
