import type { SupabaseClient } from '@supabase/supabase-js';
import { formatLeadSource, getLead, getLeadTriage, LEAD_FLAG_LABELS, type LeadScore } from './leads';
import { formatJobSchedule, formatMoney, getJob } from './jobs';
import { createLeadPhotoLinks } from './lead-photo-storage';
import { formatPhoneDashes } from './phone';
import type { LeadVisualAnalysis } from './lead-photo-ai';
import {
  JOB_STATUS_LABEL,
  estimateRangeLabel,
  formatLeadClock,
  formatLeadDate,
  leadScoreLabel,
  leadStageLabel,
} from './lead-detail-labels';

// One lead's detail, shaped for the leads pipeline's Focus pane.
//
// Same discipline as JobDetailDto: this is served over an HTTP route, so it
// carries display values only — no account_id, no raw triage jsonb, no
// client_id, no source_page beyond the path the homeowner filled the form on.
// Ship the label, not the record.

export const LEAD_FOCUS_PHOTO_LIMIT = 8;
export const LEAD_FOCUS_LOG_LIMIT = 12;

export type LeadContactEvent = { label: string; note: string | null; at: string };

export type LeadDetailDto = {
  id: string;
  name: string;
  stageLabel: string;
  sourceLabel: string;
  sourcePage: string | null;

  phone: string | null;
  phoneDigits: string | null;
  email: string | null;
  address: string | null;

  projectType: string | null;
  message: string | null;
  estimatedHours: number | null;
  createdAtLabel: string;

  score: LeadScore;
  scoreLabel: string;
  hasTriage: boolean;
  flags: Array<{ key: string; label: string }>;
  timeline: string | null;
  location: string | null;
  estimateLabel: string | null;
  textOnly: boolean;

  /** Visual intelligence derived from lead photos. */
  visualAnalysis?: LeadVisualAnalysis | null;

  contactLog: LeadContactEvent[];
  contactCount: number;

  photos: Array<{ path: string; url: string }>;
  photoCount: number;

  quoteVisit: { whenLabel: string; durationLabel: string; notes: string | null; confirmedLabel: string | null } | null;
  convertedJob: { id: string; ref: string; stageLabel: string; quotedLabel: string } | null;

  /** Other work on file for the same client. Null when the lead isn't linked to one. */
  history: { jobs: number; leads: number } | null;
};

function durationLabel(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '1 hr';
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hr${hours === 1 ? '' : 's'}`;
}

/**
 * Load everything the leads Focus pane shows for one lead.
 *
 * Two round trips: the lead, then everything that needs its id. The counts are
 * head-only (no rows come back) so "3 past jobs" costs a count, not a table.
 */
export async function loadLeadDetail(
  supabase: SupabaseClient,
  accountId: string,
  leadId: string,
): Promise<LeadDetailDto | null> {
  const lead = await getLead(supabase, accountId, leadId);
  if (!lead) return null;

  const triage = getLeadTriage(lead);
  const photoPaths = lead.photo_paths || [];

  const [photoLinks, convertedJob, jobHistory, leadHistory] = await Promise.all([
    // Best-effort: an expired bucket or a revoked key must not take the whole
    // pane down with it — the rest of the lead is still worth reading.
    createLeadPhotoLinks(accountId, photoPaths).catch(() => []),
    lead.converted_job ? getJob(supabase, accountId, lead.converted_job).catch(() => null) : Promise.resolve(null),
    lead.client_id
      ? supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('account_id', accountId).eq('client_id', lead.client_id)
      : Promise.resolve({ count: null }),
    lead.client_id
      ? supabase.from('leads').select('id', { count: 'exact', head: true }).eq('account_id', accountId).eq('client_id', lead.client_id).neq('id', lead.id)
      : Promise.resolve({ count: null }),
  ]);

  const visit = lead.quote_visit;

  return {
    id: lead.id,
    name: lead.name || 'Unnamed request',
    stageLabel: leadStageLabel(lead.status, lead.source),
    sourceLabel: formatLeadSource(lead.source),
    sourcePage: lead.source_page ?? null,

    phone: lead.phone ? formatPhoneDashes(lead.phone) : null,
    // The dialable form, kept apart from the printed one so tel:/sms: links
    // never inherit the dashes and spaces a person wants to read.
    phoneDigits: lead.phone ?? null,
    email: lead.email ?? null,
    address: lead.address ?? null,

    projectType: lead.project_type ?? null,
    message: lead.message ?? null,
    estimatedHours: lead.estimated_hours ?? null,
    createdAtLabel: formatLeadDate(lead.created_at),

    score: triage.score,
    scoreLabel: leadScoreLabel(triage.score),
    hasTriage: Boolean(lead.triage),
    // phone_verified is a plumbing detail, not something the owner acts on.
    flags: triage.flags
      .filter((flag) => flag !== 'phone_verified')
      .map((key) => ({ key, label: LEAD_FLAG_LABELS[key] || key })),
    timeline: triage.timeline ?? null,
    location: triage.location ?? null,
    estimateLabel: estimateRangeLabel(triage.estimate),
    textOnly: triage.contactPreference === 'text_only',
    visualAnalysis: triage.visualAnalysis ?? null,

    // Newest first, and capped — a lead chased for a month can carry dozens.
    contactLog: (triage.contactLog ?? [])
      .slice()
      .reverse()
      .slice(0, LEAD_FOCUS_LOG_LIMIT)
      .map((entry) => ({ label: entry.label, note: entry.note ?? null, at: formatLeadClock(entry.at) })),
    contactCount: (triage.contactLog ?? []).length,

    photos: photoLinks.slice(0, LEAD_FOCUS_PHOTO_LIMIT),
    photoCount: photoPaths.length,

    quoteVisit: visit
      ? {
          whenLabel: formatJobSchedule(visit.scheduledFor, visit.scheduledTime),
          durationLabel: durationLabel(Number(visit.durationMinutes)),
          notes: visit.notes ?? null,
          confirmedLabel: visit.confirmationTextSentAt ? formatLeadClock(visit.confirmationTextSentAt) : null,
        }
      : null,

    convertedJob: convertedJob
      ? {
          id: convertedJob.id,
          ref: convertedJob.ref,
          stageLabel: JOB_STATUS_LABEL[convertedJob.status] ?? convertedJob.status,
          quotedLabel: formatMoney(Number(convertedJob.quoted_amount) || 0),
        }
      : null,

    history: lead.client_id
      ? { jobs: jobHistory.count ?? 0, leads: leadHistory.count ?? 0 }
      : null,
  };
}
