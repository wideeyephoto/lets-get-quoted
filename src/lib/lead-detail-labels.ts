import type { LeadScore, LeadStatus } from './leads';
import type { JobStatus } from './jobs';

// Display strings shared by the leads board, the Focus pane and the full lead
// page. They lived in three files and had already drifted — the board printed
// "Quote sent" while the detail page's own map printed the same thing from a
// separate copy, and either could have been edited alone. Client-safe: pure
// strings and formatting, no server imports.

// Canonical lead-stage vocabulary. 'quoted' reads "Quote sent" because that is
// what happened; the raw enum only makes sense to whoever wrote the schema.
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New request',
  contacted: 'Contacted',
  quoted: 'Quote sent',
  won: 'Won',
  lost: 'Lost',
};

// A website form that nobody has answered is the one state worth shouting
// about, so it gets its own wording rather than the generic "New request".
export function leadStageLabel(status: LeadStatus, source?: string): string {
  if (status === 'new' && source === 'website_form') return 'Needs response';
  return LEAD_STATUS_LABEL[status] ?? status;
}

// The stage of the job a lead turned into. data-export.ts keeps its own copy of
// these strings on purpose — that one has to round-trip through
// mapImportedJobStatus on re-import, so it is not free to be reworded. Leave
// them as two maps: they answer to different masters.
export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  new_lead: 'New request',
  in_progress: 'In progress',
  complete: 'Complete',
  archived: 'Archived',
};

export function leadScoreLabel(score: LeadScore): string {
  if (score === 'hot') return '🔥 Hot';
  if (score === 'low') return 'Low';
  return 'Warm';
}

/** "$1,200–$3,400", or null when the AI never put a number on it. */
export function estimateRangeLabel(estimate: { min: number; max: number } | null | undefined): string | null {
  if (!estimate) return null;
  const { min, max } = estimate;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min === max) return `$${min.toLocaleString('en-US')}`;
  return `$${min.toLocaleString('en-US')}–$${max.toLocaleString('en-US')}`;
}

/** "Jul 28, 2:15 PM" — enough to tell two touchpoints on the same day apart. */
export function formatLeadClock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "Jul 28, 2026" — for a created date, where the clock is noise. */
export function formatLeadDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
