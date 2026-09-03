import type { LeadViewItem } from '@/app/dashboard/leads/LeadsWorkspace';
import type { MapPin } from '@/components/pin-map';
import type { LogisticalPreset, StageFilter } from '@/lib/lead-queue';

export type OverallAdvisorType =
  | 'urgent_response'
  | 'route_cluster'
  | 'quote_followup'
  | 'high_value_pipeline'
  | 'pipeline_healthy'
  | 'empty';

export type LeadLogisticalMeta = {
  leadId: string;
  isHalo: boolean;
  haloJobTitle?: string;
  haloDistanceMiles?: number;
  isEnRoute: boolean;
  enRouteDetourMinutes?: number;
  enRouteDetourMiles?: number;
  enRouteBetween?: [string, string];
  opportunityScore: number;
  isTier1Opportunity: boolean;
  fitsScheduleGap: boolean;
  gapWindow?: string;
};

export type OverallLeadsAdvisorRecommendation = {
  type: OverallAdvisorType;
  headline: string;
  summary: string;
  metrics: { icon: string; label: string; tone?: 'accent' | 'good' | 'warn' }[];
  action?: {
    label: string;
    targetStage?: StageFilter;
    targetPane?: 'leads' | 'map';
    targetLogisticalPreset?: LogisticalPreset;
  };
  stats: {
    totalOpen: number;
    newCount: number;
    urgentCount: number;
    quotedCount: number;
    contactedCount: number;
    totalPipelineValue: number;
    clusteredLeadCount: number;
    haloCount: number;
    enRouteCount: number;
    tier1Count: number;
    gapFitCount: number;
  };
};

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
    const label = lead.waitingShort.toLowerCase().includes('waiting')
      ? lead.waitingShort
      : `${lead.waitingShort} waiting`;
    metrics.push({ icon: '⏱️', label, tone: lead.isUrgent ? 'warn' : undefined });
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

/**
 * Calculates straight-line detour in miles between two consecutive scheduled stops A and B
 * when inserting lead location L: (dist(A, L) + dist(L, B)) - dist(A, B).
 */
export function computeCorridorDetourMiles(
  stopA: { lat: number; lng: number },
  stopB: { lat: number; lng: number },
  leadPos: { lat: number; lng: number },
): number {
  const dDirect = haversineDistanceMiles(stopA.lat, stopA.lng, stopB.lat, stopB.lng);
  const dToLead = haversineDistanceMiles(stopA.lat, stopA.lng, leadPos.lat, leadPos.lng);
  const dFromLead = haversineDistanceMiles(leadPos.lat, leadPos.lng, stopB.lat, stopB.lng);
  const detour = dToLead + dFromLead - dDirect;
  return Math.max(0, Math.round(detour * 10) / 10);
}

/**
 * Parses time label or scheduled string (e.g. "Tomorrow · 1:00 PM" or "9:30 AM") into minute of day (0-1439).
 */
function parseScheduledMinuteOfDay(val?: string): number | null {
  if (!val) return null;
  const match = val.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const mins = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return hours * 60 + mins;
}

/**
 * Evaluates all 5 spatial & route criteria across the leads queue:
 * 1. Active Jobsite Halo (<= 0.75 mi from scheduled jobs)
 * 2. Drive-Corridor En Route (<= 5 mi / <= 10 min detour between scheduled stops)
 * 3. Opportunity Index (Composite score of value, urgency, and proximity)
 * 4. Schedule Gap Fitting (Fits within calendar gaps between appointments)
 */
export function analyzePipelineLogistics(
  leads: LeadViewItem[],
  mapPins: MapPin[] = [],
): Map<string, LeadLogisticalMeta> {
  const result = new Map<string, LeadLogisticalMeta>();

  // Scheduled job stops
  const scheduledPins = mapPins.filter((p) => p.kind === 'scheduled' && p.lat != null && p.lng != null);

  // Look for schedule gaps between chronologically adjacent jobs
  const jobTimes: { pin: MapPin; minute: number }[] = [];
  for (const p of scheduledPins) {
    let min: number | null = null;
    if (p.rows) {
      for (const row of p.rows) {
        min = parseScheduledMinuteOfDay(row.value);
        if (min !== null) break;
      }
    }
    if (min === null && p.sublabel) {
      min = parseScheduledMinuteOfDay(p.sublabel);
    }
    if (min !== null) {
      jobTimes.push({ pin: p, minute: min });
    }
  }
  jobTimes.sort((a, b) => a.minute - b.minute);

  // Identify gap intervals >= 45 minutes
  type GapInfo = { startMin: number; endMin: number; beforeJob: string; afterJob: string; label: string };
  const gaps: GapInfo[] = [];
  for (let i = 0; i < jobTimes.length - 1; i++) {
    const endPrev = jobTimes[i].minute + 120; // assumed 2hr duration
    const startNext = jobTimes[i + 1].minute;
    if (startNext - endPrev >= 45) {
      const formatMin = (m: number) => {
        const h = Math.floor(m / 60) % 24;
        const mins = m % 60;
        const p = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 === 0 ? 12 : h % 12;
        return `${h12}:${String(mins).padStart(2, '0')} ${p}`;
      };
      gaps.push({
        startMin: endPrev,
        endMin: startNext,
        beforeJob: jobTimes[i].pin.label,
        afterJob: jobTimes[i + 1].pin.label,
        label: `${formatMin(endPrev)}–${formatMin(startNext)}`,
      });
    }
  }

  for (const lead of leads) {
    const leadPin = mapPins.find((p) => p.id === `lead-${lead.id}`);
    const hasCoords = leadPin?.lat != null && leadPin?.lng != null;

    let isHalo = false;
    let haloJobTitle: string | undefined;
    let haloDistanceMiles: number | undefined;

    let isEnRoute = false;
    let enRouteDetourMinutes: number | undefined;
    let enRouteDetourMiles: number | undefined;
    let enRouteBetween: [string, string] | undefined;

    let fitsScheduleGap = false;
    let gapWindow: string | undefined;

    let nearestDist = Infinity;

    if (hasCoords && scheduledPins.length > 0) {
      const lPos = { lat: leadPin.lat, lng: leadPin.lng };

      // 1. Check Jobsite Halo (<= 0.75 mi)
      for (const sPin of scheduledPins) {
        const d = haversineDistanceMiles(lPos.lat, lPos.lng, sPin.lat, sPin.lng);
        if (d < nearestDist) nearestDist = d;
        if (d <= 0.75) {
          isHalo = true;
          haloJobTitle = sPin.label;
          haloDistanceMiles = d;
          break;
        }
      }

      // 2. Check Drive-Corridor En Route
      if (scheduledPins.length >= 2) {
        let minDetour = Infinity;
        let bestPair: [string, string] | undefined;
        for (let i = 0; i < scheduledPins.length - 1; i++) {
          const sA = scheduledPins[i];
          const sB = scheduledPins[i + 1];
          const detour = computeCorridorDetourMiles(
            { lat: sA.lat, lng: sA.lng },
            { lat: sB.lat, lng: sB.lng },
            lPos,
          );
          if (detour < minDetour) {
            minDetour = detour;
            bestPair = [sA.label, sB.label];
          }
        }
        // Detour <= 5 miles (~10 min drive) qualifies as en route
        if (minDetour <= 5) {
          isEnRoute = true;
          enRouteDetourMiles = minDetour;
          enRouteDetourMinutes = Math.round(minDetour * 2);
          enRouteBetween = bestPair;
        }
      } else if (scheduledPins.length === 1) {
        const s = scheduledPins[0];
        const d = haversineDistanceMiles(lPos.lat, lPos.lng, s.lat, s.lng);
        if (d <= 4) {
          isEnRoute = true;
          enRouteDetourMiles = d;
          enRouteDetourMinutes = Math.round(d * 2);
          enRouteBetween = ['Shop', s.label];
        }
      }

      // 3. Check Schedule Gap Fits
      if (gaps.length > 0 && (isEnRoute || isHalo || nearestDist <= 8)) {
        fitsScheduleGap = true;
        gapWindow = gaps[0].label;
      }
    }

    // 4. Calculate Opportunity Index
    let leadValue = 0;
    if (lead.estimate) {
      leadValue = Math.round((lead.estimate.min + lead.estimate.max) / 2);
    } else if (lead.estimatedHours) {
      leadValue = lead.estimatedHours * 150;
    }

    const valueScore = Math.min(100, Math.round(leadValue / 100));
    const urgencyScore =
      (lead.score === 'hot' ? 30 : lead.score === 'warm' ? 15 : 0) + (lead.isUrgent ? 25 : 0);
    const logisticsBoost = isHalo ? 40 : isEnRoute ? 25 : nearestDist <= 10 ? 10 : 0;
    const opportunityScore = valueScore + urgencyScore + logisticsBoost;
    const isTier1Opportunity = opportunityScore >= 110 || (leadValue >= 5000 && urgencyScore >= 25);

    result.set(lead.id, {
      leadId: lead.id,
      isHalo,
      haloJobTitle,
      haloDistanceMiles,
      isEnRoute,
      enRouteDetourMinutes,
      enRouteDetourMiles,
      enRouteBetween,
      opportunityScore,
      isTier1Opportunity,
      fitsScheduleGap,
      gapWindow,
    });
  }

  return result;
}

/**
 * Analyzes the entire leads pipeline and scheduled job pins to generate high-level
 * pipeline triage, route optimization, and revenue management recommendations.
 */
export function generateOverallLeadsAdvisorRecommendation(
  leads: LeadViewItem[],
  mapPins: MapPin[] = [],
  _base = '/dashboard',
): OverallLeadsAdvisorRecommendation {
  const openLeads = leads.filter((l) => l.status !== 'won' && l.status !== 'lost');
  const newLeads = openLeads.filter((l) => l.status === 'new');
  const urgentLeads = openLeads.filter((l) => l.isUrgent || l.score === 'hot');
  const quotedLeads = openLeads.filter((l) => l.status === 'quoted');
  const contactedLeads = openLeads.filter((l) => l.status === 'contacted');

  // Compute total pipeline value from estimates
  let totalPipelineValue = 0;
  for (const lead of openLeads) {
    if (lead.estimate) {
      totalPipelineValue += Math.round((lead.estimate.min + lead.estimate.max) / 2);
    } else if (lead.estimatedHours) {
      totalPipelineValue += lead.estimatedHours * 150;
    }
  }

  // Analyze spatial & route logistics
  const logisticsMap = analyzePipelineLogistics(openLeads, mapPins);
  const haloLeads: LeadViewItem[] = [];
  const enRouteLeads: LeadViewItem[] = [];
  const tier1Leads: LeadViewItem[] = [];
  const gapFitLeads: LeadViewItem[] = [];

  for (const lead of openLeads) {
    const meta = logisticsMap.get(lead.id);
    if (!meta) continue;
    if (meta.isHalo) haloLeads.push(lead);
    if (meta.isEnRoute) enRouteLeads.push(lead);
    if (meta.isTier1Opportunity) tier1Leads.push(lead);
    if (meta.fitsScheduleGap) gapFitLeads.push(lead);
  }

  // Check general route clusters (<= 15 mi)
  const scheduledPins = mapPins.filter((p) => p.kind === 'scheduled' && p.lat != null && p.lng != null);
  const clusteredLeads: LeadViewItem[] = [];
  let clusterCity: string | null = null;
  let nearestJobTitle: string | null = null;

  if (scheduledPins.length > 0) {
    for (const lead of openLeads) {
      const pin = mapPins.find((p) => p.id === `lead-${lead.id}`);
      if (!pin || pin.lat == null || pin.lng == null) continue;
      const nearest = findNearestScheduledJob(pin, mapPins, 15);
      if (nearest) {
        clusteredLeads.push(lead);
        if (!clusterCity && lead.city) clusterCity = lead.city;
        if (!nearestJobTitle) nearestJobTitle = nearest.title;
      }
    }
  }

  const stats = {
    totalOpen: openLeads.length,
    newCount: newLeads.length,
    urgentCount: urgentLeads.length,
    quotedCount: quotedLeads.length,
    contactedCount: contactedLeads.length,
    totalPipelineValue,
    clusteredLeadCount: clusteredLeads.length,
    haloCount: haloLeads.length,
    enRouteCount: enRouteLeads.length,
    tier1Count: tier1Leads.length,
    gapFitCount: gapFitLeads.length,
  };

  // Base metrics for overall pipeline visibility
  const metrics: { icon: string; label: string; tone?: 'accent' | 'good' | 'warn' }[] = [];
  if (totalPipelineValue > 0) {
    metrics.push({
      icon: '💰',
      label: `$${totalPipelineValue.toLocaleString()} Pipeline`,
      tone: 'accent',
    });
  }
  if (haloLeads.length > 0) {
    metrics.push({
      icon: '🏡',
      label: `${haloLeads.length} Jobsite Halo`,
      tone: 'good',
    });
  }
  if (enRouteLeads.length > 0) {
    metrics.push({
      icon: '🚗',
      label: `${enRouteLeads.length} En Route`,
      tone: 'good',
    });
  }
  if (tier1Leads.length > 0) {
    metrics.push({
      icon: '⭐',
      label: `${tier1Leads.length} Best Value`,
      tone: 'accent',
    });
  }
  if (gapFitLeads.length > 0) {
    metrics.push({
      icon: '⏱️',
      label: `${gapFitLeads.length} Gap Fits`,
    });
  }
  if (urgentLeads.length > 0) {
    metrics.push({
      icon: '🔥',
      label: `${urgentLeads.length} Urgent`,
      tone: 'warn',
    });
  }
  if (newLeads.length > 0) {
    metrics.push({
      icon: '⏱️',
      label: `${newLeads.length} Needs Response`,
      tone: 'warn',
    });
  }
  if (quotedLeads.length > 0) {
    metrics.push({
      icon: '📝',
      label: `${quotedLeads.length} Quotes Sent`,
    });
  }

  // If no open leads
  if (openLeads.length === 0) {
    return {
      type: 'empty',
      headline: '✅ Pipeline Clear · No Active Leads Waiting',
      summary: 'All inquiries have been handled or scheduled into jobs. New website requests will appear here automatically.',
      metrics: [{ icon: '🎉', label: 'All caught up', tone: 'good' }],
      stats,
    };
  }

  // Priority 1: Urgent leads / Speed-to-lead backlog
  if (urgentLeads.length > 0) {
    let urgentValue = 0;
    for (const lead of urgentLeads) {
      if (lead.estimate) {
        urgentValue += Math.round((lead.estimate.min + lead.estimate.max) / 2);
      } else if (lead.estimatedHours) {
        urgentValue += lead.estimatedHours * 150;
      }
    }
    const valSnippet = urgentValue > 0 ? ` · ~$${urgentValue.toLocaleString()} at stake` : '';
    return {
      type: 'urgent_response',
      headline: `⚡ ${urgentLeads.length} Urgent Lead${urgentLeads.length === 1 ? '' : 's'} Need First Response${valSnippet}`,
      summary: `Fast response dramatically increases conversion before competitor outreach. ${urgentLeads.length === 1 ? '1 hot lead is' : `${urgentLeads.length} hot leads are`} waiting on your team right now.`,
      metrics,
      action: {
        label: `⚡ Triage ${urgentLeads.length} Urgent Lead${urgentLeads.length === 1 ? '' : 's'}`,
        targetStage: 'new',
      },
      stats,
    };
  }

  // Priority 2: Active Jobsite Halo Leads (<= 0.75 mi from crew working today)
  if (haloLeads.length > 0) {
    const meta0 = logisticsMap.get(haloLeads[0].id);
    const jobContext = meta0?.haloJobTitle ? ` near "${meta0.haloJobTitle}"` : '';
    return {
      type: 'route_cluster',
      headline: `🏡 Jobsite Halo: ${haloLeads.length} Neighbor Inquir${haloLeads.length === 1 ? 'y' : 'ies'} Within 0.75 mi of Active Jobs`,
      summary: `Your crews and trucks are working right nearby${jobContext}. Drop in to offer neighborhood rates with zero extra drive time.`,
      metrics,
      action: {
        label: `🏡 Triage ${haloLeads.length} Jobsite Halo Lead${haloLeads.length === 1 ? '' : 's'}`,
        targetLogisticalPreset: 'halo',
      },
      stats,
    };
  }

  // Priority 3: En-Route Drops along Transit Corridors (>= 2 leads)
  if (enRouteLeads.length >= 2) {
    return {
      type: 'route_cluster',
      headline: `🚗 En Route: ${enRouteLeads.length} Leads Directly Along Crew Transit Routes`,
      summary: `These leads add minimal detour (<10 min) between scheduled stops. Squeeze in fast site visits during travel without disrupting crew timing.`,
      metrics,
      action: {
        label: `🚗 Review ${enRouteLeads.length} En-Route Leads`,
        targetLogisticalPreset: 'en_route',
      },
      stats,
    };
  }

  // Priority 4: Schedule Gap Filling (Idle Slack Between Appointments)
  if (gapFitLeads.length >= 1 && gapFitLeads.some((l) => logisticsMap.get(l.id)?.gapWindow)) {
    const windowLabel = logisticsMap.get(gapFitLeads[0].id)?.gapWindow;
    return {
      type: 'route_cluster',
      headline: `⏱️ Calendar Slack: ${gapFitLeads.length} Lead${gapFitLeads.length === 1 ? '' : 's'} Fit Today's Schedule Window (${windowLabel})`,
      summary: `You have idle buffer between appointments. Reach out to secure on-site inspections during this open travel window.`,
      metrics,
      action: {
        label: `⏱️ Fill Schedule Slack (${gapFitLeads.length})`,
        targetLogisticalPreset: 'gap_fits',
      },
      stats,
    };
  }

  // Priority 5: Tier-1 Best Value Opportunities (High Value + High Urgency)
  if (tier1Leads.length >= 1) {
    let tier1Val = 0;
    for (const lead of tier1Leads) {
      if (lead.estimate) {
        tier1Val += Math.round((lead.estimate.min + lead.estimate.max) / 2);
      } else if (lead.estimatedHours) {
        tier1Val += lead.estimatedHours * 150;
      }
    }
    const valSnippet = tier1Val > 0 ? ` (~$${tier1Val.toLocaleString()})` : '';
    return {
      type: 'high_value_pipeline',
      headline: `⭐ High Priority: ${tier1Leads.length} Tier-1 Opportunities${valSnippet}`,
      summary: `High contract value combined with urgent timelines. Secure these high-margin jobs before competitors quote.`,
      metrics,
      action: {
        label: `⭐ Focus on Tier-1 Targets (${tier1Leads.length})`,
        targetLogisticalPreset: 'best_opportunities',
      },
      stats,
    };
  }

  // Priority 6: New uncontacted leads
  if (newLeads.length > 0) {
    return {
      type: 'urgent_response',
      headline: `⚡ ${newLeads.length} New Inbound Lead${newLeads.length === 1 ? '' : 's'} Awaiting Response`,
      summary: `Inbound leads contacted within the first hour close up to 391% higher than delayed responses. Reach out to secure site visits.`,
      metrics,
      action: {
        label: `Review New Leads (${newLeads.length})`,
        targetStage: 'new',
      },
      stats,
    };
  }

  // Priority 7: Route clustering opportunity (broad geographic vicinity)
  if (clusteredLeads.length >= 2) {
    const locSnippet = clusterCity ? ` near ${clusterCity}` : nearestJobTitle ? ` near ${nearestJobTitle}` : '';
    return {
      type: 'route_cluster',
      headline: `🚗 Route Opportunity: ${clusteredLeads.length} Leads Near Scheduled Jobs`,
      summary: `You have ${clusteredLeads.length} open leads within 15 miles of upcoming crew stops${locSnippet}. Group on-site estimate visits onto your calendar to eliminate windshield time.`,
      metrics,
      action: {
        label: `🗺️ View ${clusteredLeads.length} Clustered Leads on Map`,
        targetPane: 'map',
      },
      stats,
    };
  }

  // Priority 8: Quoted leads awaiting follow-up
  if (quotedLeads.length > 0) {
    let quotedValue = 0;
    for (const lead of quotedLeads) {
      if (lead.estimate) {
        quotedValue += Math.round((lead.estimate.min + lead.estimate.max) / 2);
      } else if (lead.estimatedHours) {
        quotedValue += lead.estimatedHours * 150;
      }
    }
    const valSnippet = quotedValue > 0 ? ` ($${quotedValue.toLocaleString()})` : '';
    return {
      type: 'quote_followup',
      headline: `📝 ${quotedLeads.length} Outstanding Quote${quotedLeads.length === 1 ? '' : 's'} Awaiting Homeowner Decision${valSnippet}`,
      summary: `Quotes have been delivered. Follow up with homeowners to answer questions, overcome hesitations, and confirm deposit schedules.`,
      metrics,
      action: {
        label: `Follow Up on Quotes (${quotedLeads.length})`,
        targetStage: 'quoted',
      },
      stats,
    };
  }

  // Priority 9: Active pipeline / Healthy
  return {
    type: 'high_value_pipeline',
    headline: `💼 Pipeline Active · $${totalPipelineValue.toLocaleString()} Across ${openLeads.length} Leads`,
    summary: `All current inquiries have been contacted. Keep nurturing leads through site visits, quotes, and project scheduling.`,
    metrics,
    action: {
      label: `View All Open Leads (${openLeads.length})`,
      targetStage: 'open',
    },
    stats,
  };
}

/**
 * Reads the dismiss/snooze state from localStorage for the overall pipeline advisor.
 */
export function getOverallAdvisorState(): { state: AdvisorState; snoozedUntil?: number } {
  if (typeof window === 'undefined') return { state: 'visible' };
  try {
    const raw = localStorage.getItem('lgq_overall_leads_advisor');
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
 * Persists a permanent dismissal for the overall pipeline advisor.
 */
export function setOverallAdvisorDismissed(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('lgq_overall_leads_advisor', JSON.stringify({ dismissed: true }));
  } catch {}
}

/**
 * Persists a temporary snooze for the overall pipeline advisor (default 24 hours).
 */
export function setOverallAdvisorSnoozed(hours = 24): void {
  if (typeof window === 'undefined') return;
  try {
    const snoozedUntil = Date.now() + hours * 60 * 60 * 1000;
    localStorage.setItem('lgq_overall_leads_advisor', JSON.stringify({ snoozedUntil }));
  } catch {}
}

/**
 * Clears dismiss/snooze state, restoring the overall pipeline advisor banner to visible.
 */
export function clearOverallAdvisorState(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('lgq_overall_leads_advisor');
  } catch {}
}

