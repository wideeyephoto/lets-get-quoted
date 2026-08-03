// The demo's Leads and Jobs pages render the REAL Focus panes, which means
// producing exactly the shapes those panes expect — both the list item and the
// detail the pane would otherwise fetch.
//
// Everything here is derived from the same DEMO_LEADS / DEMO_JOBS seeds the
// other demo pages use, for the reason stated in demo-data: a demo whose pages
// quietly disagree with each other is worse than one with fewer pages.
import { computeMargin, formatJobSchedule, formatMoney, sortJobsByStatus, type Job, type JobStatus } from '@/lib/jobs';
import { formatElapsedTime, formatLeadSource, getLeadTriage, type Lead, type LeadScore } from '@/lib/leads';
import type { LeadViewItem } from '@/app/dashboard/leads/LeadsWorkspace';
import type { JobViewItem } from '@/app/dashboard/jobs/JobsWorkspace';
import type { LeadDetailDto } from '@/lib/lead-detail';
import type { JobDetailDto } from '@/lib/job-detail';
import { DEMO_COSTS, DEMO_CREW, DEMO_JOBS, DEMO_LEADS, getDemoPayments } from '@/lib/demo-data';

const LEAD_STAGE: Record<string, string> = {
  new: 'Needs response',
  contacted: 'Contacted',
  quoted: 'Quote sent',
  won: 'Won',
  lost: 'Lost',
};

const JOB_BADGE: Record<JobStatus, { label: string; tone: string; title: string }> = {
  new_lead: { label: 'New request', tone: 'new_lead', title: 'Waiting on your quote' },
  in_progress: { label: 'In progress', tone: 'in_progress', title: 'Work is under way' },
  complete: { label: 'Complete', tone: 'complete', title: 'Finished' },
  archived: { label: 'Archived', tone: 'archived', title: 'Closed out' },
};

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function cityOf(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts[1] : null;
}

function digitsOf(phone: string | null): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits : null;
}

// A plausible score from the seed's own numbers rather than a stored one — the
// demo leads have no triage record, and a page where every lead is "hot" sells
// the scoring worse than one where the scoring visibly discriminates.
function scoreOf(lead: Lead): LeadScore {
  const hours = lead.estimated_hours ?? 0;
  if (lead.status === 'lost') return 'low';
  if (hours >= 40 || lead.source === 'referral') return 'hot';
  if (hours >= 12) return 'warm';
  return 'low';
}

const SCORE_LABEL: Record<LeadScore, string> = { hot: 'Hot', warm: 'Warm', low: 'Low' };

// ---- leads -----------------------------------------------------------------

// The list shapes come from the components themselves. Restating them here is
// how a demo drifts: the compiler caught two missing fields the moment this was
// a copy rather than a reference.
export type DemoLeadView = LeadViewItem;

function leadEstimate(lead: Lead): { min: number; max: number } | null {
  const hours = lead.estimated_hours;
  if (!hours) return null;
  // A rate band rather than a single figure: the real estimator returns a range
  // and the pane renders "$300–$600", so a point value would render wrong.
  return { min: Math.round(hours * 55), max: Math.round(hours * 95) };
}

export function demoLeadViews(): DemoLeadView[] {
  return DEMO_LEADS.map((lead) => {
    const estimate = leadEstimate(lead);
    const score = scoreOf(lead);
    const triage = getLeadTriage(lead);
    return {
      id: lead.id,
      name: lead.name || 'Unnamed request',
      status: lead.status,
      statusLabel: LEAD_STAGE[lead.status] ?? lead.status,
      sourceLabel: formatLeadSource(lead.source),
      phone: lead.phone,
      email: lead.email,
      address: lead.address,
      detail: lead.project_type || lead.message || 'Project details not provided',
      estimatedHours: lead.estimated_hours,
      createdAt: lead.created_at,
      ageLabel: formatElapsedTime(lead.created_at),
      convertedJob: lead.converted_job,
      score,
      hasTriage: true,
      scoreLabel: SCORE_LABEL[score],
      flags: lead.source === 'missed_call' ? [{ key: 'missed_call', label: 'Missed call' }] : [],
      textOnly: !lead.email,
      estimate,
      estimateLabel: estimate ? `${formatMoney(estimate.min)}–${formatMoney(estimate.max)}` : null,
      timeline: lead.status === 'new' ? 'asap' : null,
      location: cityOf(lead.address),
      city: cityOf(lead.address),
      contactLog: triage.contactLog ?? [],
      projectType: lead.project_type,
      photoCount: 0,
      isUrgent: lead.status === 'new' && lead.source === 'website_form',
    };
  });
}

export function demoLeadDetails(): Record<string, LeadDetailDto> {
  const out: Record<string, LeadDetailDto> = {};
  for (const lead of DEMO_LEADS) {
    const estimate = leadEstimate(lead);
    const score = scoreOf(lead);
    const job = lead.converted_job ? DEMO_JOBS.find((item) => item.id === lead.converted_job) ?? null : null;
    out[lead.id] = {
      id: lead.id,
      name: lead.name || 'Unnamed request',
      stageLabel: LEAD_STAGE[lead.status] ?? lead.status,
      sourceLabel: formatLeadSource(lead.source),
      sourcePage: lead.source_page,
      phone: lead.phone,
      phoneDigits: digitsOf(lead.phone),
      email: lead.email,
      address: lead.address,
      projectType: lead.project_type,
      message: lead.message,
      estimatedHours: lead.estimated_hours,
      createdAtLabel: dateLabel(lead.created_at),
      score,
      scoreLabel: SCORE_LABEL[score],
      hasTriage: true,
      flags: lead.source === 'missed_call' ? [{ key: 'missed_call', label: 'Missed call' }] : [],
      timeline: lead.status === 'new' ? 'asap' : null,
      location: cityOf(lead.address),
      estimateLabel: estimate ? `${formatMoney(estimate.min)}–${formatMoney(estimate.max)}` : null,
      textOnly: !lead.email,
      contactLog: [],
      contactCount: 0,
      photos: [],
      photoCount: 0,
      quoteVisit: null,
      convertedJob: job
        ? {
            id: job.id,
            ref: job.ref,
            stageLabel: JOB_BADGE[job.status].label,
            quotedLabel: formatMoney(job.quoted_amount),
          }
        : null,
      history: null,
    };
  }
  return out;
}

// ---- jobs ------------------------------------------------------------------

export type DemoJobView = JobViewItem;

function jobMoney(job: Job) {
  const payments = getDemoPayments(job);
  const paid = payments.filter((p) => p.paid).reduce((sum, p) => sum + p.amount, 0);
  return { paid, outstanding: Math.max(0, job.quoted_amount - paid) };
}

function scheduleLabel(job: Job): string | null {
  return formatJobSchedule(job.scheduled_for, job.scheduled_time, null) || null;
}

export function demoJobViews(): DemoJobView[] {
  // Same order the live page uses. Unsorted, the pane opens on the oldest
  // completed job — a prospect's first sight of Jobs should be live work.
  return sortJobsByStatus(DEMO_JOBS).map((job) => {
    const badge = JOB_BADGE[job.status];
    const { paid, outstanding } = jobMoney(job);
    return {
      id: job.id,
      ref: job.ref,
      clientName: job.client_name,
      address: job.address,
      status: job.status,
      badgeLabel: badge.label,
      badgeTone: badge.tone,
      badgeTitle: badge.title,
      scheduledLabel: scheduleLabel(job),
      quotedAmount: job.quoted_amount,
      quotedLabel: formatMoney(job.quoted_amount),
      estimatedHours: job.estimated_hours,
      createdAt: job.created_at,
      outstandingLabel: formatMoney(outstanding),
      paidLabel: formatMoney(paid),
      invoiceRef: job.status === 'new_lead' ? null : `INV-${job.ref.replace('J-', '')}`,
      invoiceStatusLabel: job.status === 'complete' ? 'Paid' : job.status === 'new_lead' ? null : 'Sent',
      scope: job.scope,
      photoCount: 0,
    };
  });
}

export function demoJobDetails(): Record<string, JobDetailDto> {
  const out: Record<string, JobDetailDto> = {};
  for (const job of DEMO_JOBS) {
    const costs = DEMO_COSTS[job.id] ?? [];
    const margin = computeMargin(job, costs);
    const { paid, outstanding } = jobMoney(job);
    // Two crew per job, matching the assignment the dashboard page makes.
    const crew = job.status === 'new_lead' ? [] : [DEMO_CREW[0], DEMO_CREW[3]];

    out[job.id] = {
      id: job.id,
      ref: job.ref,
      clientName: job.client_name,
      clientPhone: job.client_phone,
      clientEmail: job.client_email,
      address: job.address,
      scope: job.scope,
      status: job.status,
      createdAtLabel: dateLabel(job.created_at),
      scheduledLabel: scheduleLabel(job),
      estimatedHours: job.estimated_hours,
      money: {
        quotedLabel: formatMoney(job.quoted_amount),
        materialsLabel: formatMoney(margin.materialsCost),
        laborLabel: formatMoney(margin.laborCost),
        overheadLabel: formatMoney(margin.otherCost),
        totalCostLabel: formatMoney(margin.totalCost),
        profitLabel: formatMoney(margin.profit),
        // Margin is a 0..1 ratio on the real type, not a percentage.
        marginPct: Math.round(margin.margin * 100),
        marginLabel: `${Math.round(margin.margin * 100)}%`,
        outstandingLabel: formatMoney(outstanding),
        paidLabel: formatMoney(paid),
      },
      invoice: job.status === 'new_lead'
        ? null
        : {
            ref: `INV-${job.ref.replace('J-', '')}`,
            statusLabel: job.status === 'complete' ? 'Paid' : 'Sent',
            totalLabel: formatMoney(job.quoted_amount),
          },
      paymentStatusLabel: job.status === 'complete' ? 'Paid in full' : outstanding > 0 ? `${formatMoney(outstanding)} outstanding` : null,
      crew: crew.map((member) => ({ id: member.id, name: member.name, roleLabel: member.role_label ?? 'Crew' })),
      tasks: { items: [], done: 0, total: 0, pct: 0 },
      feed: [],
      photos: [],
      photoCount: 0,
      costCount: costs.length,
    };
  }
  return out;
}
