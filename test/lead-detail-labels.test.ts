import { describe, it, expect } from 'vitest';
import {
  JOB_STATUS_LABEL,
  LEAD_STATUS_LABEL,
  estimateRangeLabel,
  formatLeadClock,
  formatLeadDate,
  leadScoreLabel,
  leadStageLabel,
} from '@/lib/lead-detail-labels';
import { LEADS_VIEWS, normalizeLeadsView } from '@/lib/leads';

// These labels are shared by the leads board, the Focus pane and the full lead
// page. The point of the module is that the three can't describe the same lead
// differently — they had already drifted into separate copies — so the tests
// pin the wordings that aren't obvious from the enum.

describe('lead stage labels', () => {
  it('has a label for every stage', () => {
    for (const status of ['new', 'contacted', 'quoted', 'won', 'lost'] as const) {
      expect(LEAD_STATUS_LABEL[status]).toBeTruthy();
    }
  });

  it('reads "quoted" as what actually happened', () => {
    expect(LEAD_STATUS_LABEL.quoted).toBe('Quote sent');
  });

  it('shouts only about an unanswered website request', () => {
    expect(leadStageLabel('new', 'website_form')).toBe('Needs response');
    // A missed call or a manually typed lead is new, but nobody is sitting on a
    // form waiting for a reply, so it stays the neutral wording.
    expect(leadStageLabel('new', 'missed_call')).toBe('New request');
    expect(leadStageLabel('new')).toBe('New request');
    // Answered already — the badge must not keep demanding a response.
    expect(leadStageLabel('contacted', 'website_form')).toBe('Contacted');
  });
});

describe('job stage labels', () => {
  it('covers every job status, for the job a lead turned into', () => {
    for (const status of ['new_lead', 'in_progress', 'complete', 'archived'] as const) {
      expect(JOB_STATUS_LABEL[status]).toBeTruthy();
    }
  });
});

describe('score labels', () => {
  it('names each tier the way the chips do', () => {
    expect(leadScoreLabel('hot')).toBe('🔥 Hot');
    expect(leadScoreLabel('warm')).toBe('Warm');
    expect(leadScoreLabel('low')).toBe('Low');
  });
});

describe('estimate ranges', () => {
  it('formats a range with thousands separators', () => {
    expect(estimateRangeLabel({ min: 1200, max: 3400 })).toBe('$1,200–$3,400');
  });

  it('collapses a single number instead of printing it twice', () => {
    expect(estimateRangeLabel({ min: 900, max: 900 })).toBe('$900');
  });

  it('returns null when there is no usable number', () => {
    expect(estimateRangeLabel(null)).toBeNull();
    expect(estimateRangeLabel(undefined)).toBeNull();
    expect(estimateRangeLabel({ min: Number.NaN, max: 500 })).toBeNull();
    expect(estimateRangeLabel({ min: 500, max: Number.POSITIVE_INFINITY })).toBeNull();
  });
});

describe('lead timestamps', () => {
  it('keeps the clock on a touchpoint, so two the same day are tellable apart', () => {
    const label = formatLeadClock('2026-07-28T18:15:00.000Z');
    expect(label).toMatch(/\d:\d{2}\s?(AM|PM)/);
  });

  it('drops the clock from a received date, where it is noise', () => {
    const label = formatLeadDate('2026-07-28T18:15:00.000Z');
    expect(label).toMatch(/2026/);
    expect(label).not.toMatch(/(AM|PM)/);
  });

  it('returns an empty string rather than "Invalid Date"', () => {
    expect(formatLeadClock('not a date')).toBe('');
    expect(formatLeadDate('')).toBe('');
  });
});

describe('leads view cookie', () => {
  it('accepts focus alongside the layouts that came before it', () => {
    expect(LEADS_VIEWS).toContain('focus');
    expect(normalizeLeadsView('focus')).toBe('focus');
    expect(normalizeLeadsView('split')).toBe('split');
  });

  it('falls back to the board for anything it does not recognise', () => {
    // An old cookie, or a hand-edited one, must not render a blank workspace.
    expect(normalizeLeadsView('kanban')).toBe('board');
    expect(normalizeLeadsView(undefined)).toBe('board');
  });
});
