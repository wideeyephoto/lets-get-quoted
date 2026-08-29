import { describe, it, expect } from 'vitest';
import { ready, unavailable, isReady } from '@/lib/dashboard-types';
import { buildPriorityQueue } from '@/lib/dashboard/attention-loader';
import { buildTodaySchedule, extractCity, initials } from '@/lib/dashboard/schedule-loader';
import { buildBusinessPulse } from '@/lib/dashboard/pulse-loader';
import { buildCapacitySummary } from '@/lib/dashboard/capacity-loader';
import { buildJobReadiness } from '@/lib/dashboard/readiness-loader';
import { findBestOpportunity } from '@/lib/dashboard/opportunity-loader';
import { buildPipelineSummary } from '@/lib/dashboard/pipeline-loader';
import { buildCashPreview } from '@/lib/dashboard/cash-preview-loader';
import { buildAutomationSummary } from '@/lib/dashboard/automation-loader';
import type { Job, ScheduledJobOccurrence } from '@/lib/jobs';
import type { CrewMember } from '@/lib/crew';
import type { Lead } from '@/lib/leads';
import type { LeadSummary } from '@/lib/lead-summary';

describe('Loadable container contract', () => {
  it('creates ready and unavailable containers', () => {
    const readyState = ready({ test: 123 });
    expect(readyState.kind).toBe('ready');
    if (isReady(readyState)) {
      expect(readyState.data.test).toBe(123);
    }

    const failedState = unavailable('query_failed');
    expect(failedState.kind).toBe('unavailable');
    expect(isReady(failedState)).toBe(false);
  });
});

describe('Priority Queue builder', () => {
  it('separates contractor action items from waiting-on-customer items', () => {
    const leadStats: LeadSummary = {
      open: 3,
      needsYou: 2,
      waitingOnCustomer: 1,
      new: 2,
      contacted: 0,
      quoted: 1,
      fromWebsite: 1,
    };
    const schedulingIssues = {
      needsCrew: ['job-1'],
      missingTime: ['job-1'],
      unscheduled: ['job-2'],
      all: ['job-1', 'job-2'],
    };

    const queue = buildPriorityQueue({
      leadStats,
      schedulingIssues,
      schedulingIssueCount: 2,
      stuckScheduleCount: 1,
      outstanding: { total: 4500, count: 2 },
      openQuotes: { total: 12000, count: 3 },
      followupsOn: true,
    });

    expect(queue.kind).toBe('ready');
    if (queue.kind === 'ready') {
      expect(queue.data.needsAttention).toHaveLength(4); // leads, scheduling, stuck schedule, unpaid
      expect(queue.data.waitingOnCustomer).toHaveLength(1); // open quotes
      expect(queue.data.waitingOnCustomer[0].label).toContain('3 quotes awaiting customer approval');
      expect(queue.data.waitingOnCustomer[0].detail).toContain('Automatic SMS follow-ups are active');
    }
  });

  it('includes jobs missing critical info and unverified field intake items in priority queue', () => {
    const queue = buildPriorityQueue({
      leadStats: { open: 0, needsYou: 0, waitingOnCustomer: 0, new: 0, contacted: 0, quoted: 0, fromWebsite: 0 },
      schedulingIssues: { needsCrew: [], missingTime: [], unscheduled: [], all: [] },
      schedulingIssueCount: 0,
      stuckScheduleCount: 0,
      outstanding: { total: 0, count: 0 },
      openQuotes: { total: 0, count: 0 },
      followupsOn: false,
      jobsNeedingInfoCount: 3,
      unreviewedFieldIntakeCount: 2,
    });

    expect(queue.kind).toBe('ready');
    if (queue.kind === 'ready') {
      expect(queue.data.needsAttention).toHaveLength(2);
      expect(queue.data.needsAttention[0].label).toBe('3 jobs missing critical details');
      expect(queue.data.needsAttention[0].cta).toBe('Complete job details');
      expect(queue.data.needsAttention[1].label).toBe('2 field items dictated from the truck');
      expect(queue.data.needsAttention[1].href).toBe('/dashboard/text-to-job');
      expect(queue.data.needsAttention[1].cta).toBe('Verify field intake');
    }
  });
});

describe('Today Schedule timeline', () => {
  it('correctly maps crew, city, and work value', () => {
    const crew: CrewMember[] = [
      { id: 'c1', account_id: 'a1', name: 'Dan Miller', phone: '(555) 000-0000', email: null, role_label: 'Lead', hourly_rate: 30, photo_path: null, user_id: null, active: true, deleted_at: null, created_at: '2026-08-26T00:00:00Z' },
    ];
    const todayJobs: ScheduledJobOccurrence<Job>[] = [
      {
        id: 'j1',
        account_id: 'a1',
        ref: 'JOB-1',
        client_id: 'cli1',
        client_name: 'Alice Johnson',
        client_phone: '(555) 123-4567',
        client_email: 'alice@example.com',
        address: '123 Main St, Springfield, IL 62701',
        scheduled_time: '09:00',
        quoted_amount: 1500,
        status: 'in_progress',
        scope: 'Kitchen Remodel Stage 1',
        scheduled_for: '2026-08-26',
        estimated_hours: 6,
        deposit_gate: null,
        quote_items: [],
        photo_paths: [],
        created_at: '2026-08-26T00:00:00Z',
      },
    ];

    const timeline = buildTodaySchedule({
      todayJobs,
      crew,
      assignmentsByJob: { j1: ['c1'] },
      todayKey: '2026-08-26',
      dateLabel: 'Wed, Aug 26',
    });

    expect(timeline.kind).toBe('ready');
    if (timeline.kind === 'ready') {
      expect(timeline.data.items).toHaveLength(1);
      const item = timeline.data.items[0];
      expect(item.clientName).toBe('Alice Johnson');
      expect(item.city).toBe('Springfield');
      expect(item.assignedCrew[0].initials).toBe('DM');
      expect(item.readiness).toBe('ready');
      expect(timeline.data.totalWorkValue).toBe(1500);
      expect(timeline.data.inProgressCount).toBe(1);
    }
  });

  it('handles empty state honestly', () => {
    const timeline = buildTodaySchedule({
      todayJobs: [],
      crew: [],
      assignmentsByJob: {},
      todayKey: '2026-08-26',
      dateLabel: 'Wed, Aug 26',
    });
    expect(timeline.kind).toBe('ready');
    if (timeline.kind === 'ready') {
      expect(timeline.data.items).toHaveLength(0);
      expect(timeline.data.totalWorkValue).toBe(0);
    }
  });
});

describe('Business Pulse builder', () => {
  it('creates exact 5 metric cards with precision tooltips', () => {
    const pulse = buildBusinessPulse({
      collectedThisMonth: { total: 18500, count: 6 },
      collectedMonthLabel: 'August 2026',
      outstanding: { total: 6400, count: 2 },
      openQuotes: { total: 9200, count: 3 },
      bookedWork: { total: 24000, count: 5 },
      newLeadsThisMonthCount: 14,
    });

    expect(pulse.kind).toBe('ready');
    if (pulse.kind === 'ready') {
      expect(pulse.data.collectedThisMonth.formattedValue).toBe('$18,500');
      expect(pulse.data.outstandingInvoices.formattedValue).toBe('$6,400');
      expect(pulse.data.quotesAwaitingApproval.formattedValue).toBe('$9,200');
      expect(pulse.data.bookedWorkNext30Days.formattedValue).toBe('$24,000');
      expect(pulse.data.newLeadsThisMonth.formattedValue).toBe('14');
    }
  });
});

describe('Deterministic Best Opportunity ranking', () => {
  it('recommends high-value quote follow-up as top priority', () => {
    const jobs: Partial<Job>[] = [
      { id: 'j-high', status: 'new_lead', quoted_amount: 8400, client_name: 'Heritage Manor' },
      { id: 'j-low', status: 'new_lead', quoted_amount: 500, client_name: 'Small Deck' },
    ];
    const leads: Partial<Lead>[] = [
      { id: 'l1', status: 'new', name: 'Bob Smith', created_at: new Date().toISOString() },
    ];

    const opp = findBestOpportunity({
      jobs: jobs as Job[],
      leads: leads as Lead[],
      outstandingTotal: 1000,
      rebookCount: 2,
    });

    expect(opp.kind).toBe('ready');
    if (opp.kind === 'ready') {
      expect(opp.data).not.toBeNull();
      expect(opp.data?.type).toBe('viewed_quote');
      expect(opp.data?.estimatedValue).toBe(8400);
      expect(opp.data?.headline).toContain('Heritage Manor');
      expect(opp.data?.reason).toContain('$8,400');
    }
  });

  it('recommends lead response if no high-value quotes are pending', () => {
    const jobs: Partial<Job>[] = [];
    const leads: Partial<Lead>[] = [
      { id: 'l1', status: 'new', name: 'Sarah Connor', created_at: new Date().toISOString() },
    ];

    const opp = findBestOpportunity({
      jobs: jobs as Job[],
      leads: leads as Lead[],
      outstandingTotal: 500,
      rebookCount: 0,
    });

    expect(opp.kind).toBe('ready');
    if (opp.kind === 'ready') {
      expect(opp.data?.type).toBe('high_value_lead');
      expect(opp.data?.headline).toContain('Sarah Connor');
    }
  });
});

describe('Job readiness inspection', () => {
  it('flags blockers for missing crew, time, or address', () => {
    const occurrences: Partial<ScheduledJobOccurrence<Job>>[] = [
      { id: 'j1', client_name: 'Job 1', scheduled_time: null, address: '123 Main St', scheduled_for: '2026-08-27' },
      { id: 'j2', client_name: 'Job 2', scheduled_time: '10:00', address: null, scheduled_for: '2026-08-27' },
      { id: 'j3', client_name: 'Job 3', scheduled_time: '14:00', address: '456 Elm St', scheduled_for: '2026-08-27' },
    ];

    const readiness = buildJobReadiness({
      upcomingOccurrences: occurrences as ScheduledJobOccurrence<Job>[],
      assignmentsByJob: { j3: ['crew-1'] },
    });

    expect(readiness.kind).toBe('ready');
    if (readiness.kind === 'ready') {
      expect(readiness.data.upcomingJobsCount).toBe(3);
      expect(readiness.data.fullyReadyCount).toBe(1); // Only j3 is fully ready
      expect(readiness.data.blockedJobs).toHaveLength(2);
      expect(readiness.data.blockedJobs[0].blockers).toContain('No arrival / start time set');
      expect(readiness.data.blockedJobs[1].blockers).toContain('Missing job site address');
    }
  });
});

describe('Sales pipeline and cash preview', () => {
  it('computes activity funnel counts and conversion rates', () => {
    const leads: Partial<Lead>[] = [
      { id: 'l1', status: 'new' },
      { id: 'l2', status: 'contacted' },
    ];
    const jobs: Partial<Job>[] = [
      { id: 'j1', status: 'new_lead', quoted_amount: 3000 },
      { id: 'j2', status: 'in_progress', quoted_amount: 5000 },
      { id: 'j3', status: 'complete', quoted_amount: 4000 },
    ];

    const pipeline = buildPipelineSummary({
      leads: leads as Lead[],
      jobs: jobs as Job[],
    });

    expect(pipeline.kind).toBe('ready');
    if (pipeline.kind === 'ready') {
      expect(pipeline.data.stages).toHaveLength(6);
      expect(pipeline.data.avgJobValue).toBe(4000);
      expect(pipeline.data.openQuoteValue).toBe(3000);
    }
  });

  it('computes lean 14-day cash outlook', () => {
    const cash = buildCashPreview({
      outstandingTotal: 10000,
      bookedWorkTotal: 20000,
      horizonDays: 14,
    });

    expect(cash.kind).toBe('ready');
    if (cash.kind === 'ready') {
      expect(cash.data.expectedIncoming).toBe(15000); // 70% of 10k + 40% of 20k
      expect(cash.data.outstandingInvoiceBalance).toBe(10000);
      expect(cash.data.netExpectedCash).toBe(15000);
    }
  });
});
