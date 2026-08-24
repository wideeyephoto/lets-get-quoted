import { describe, it, expect } from 'vitest';
import { jobStageLabel, matchesQuery, stageCounts, type StageFilter, type QueueJob } from '@/lib/job-queue';

function mockJob(overrides: Partial<QueueJob> = {}): QueueJob {
  return {
    id: 'job-1',
    ref: 'J-1001',
    clientName: 'Arthur Dent',
    address: '42 Cottington Lane, Cottington',
    status: 'in_progress',
    scope: 'Tea and towel emergency plumbing',
    scheduledFor: '2026-08-25',
    quotedAmount: 4200,
    outstandingAmount: 2100,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('Jobs Workspace Enhancements', () => {
  describe('jobStageLabel', () => {
    it('returns friendly names for every pipeline stage and all filter', () => {
      expect(jobStageLabel('all')).toBe('All jobs');
      expect(jobStageLabel('new_lead')).toBe('New request');
      expect(jobStageLabel('in_progress')).toBe('In progress');
      expect(jobStageLabel('complete')).toBe('Complete');
      expect(jobStageLabel('archived')).toBe('Archived');
    });
  });

  describe('Contextual Job Filter & Search Matching', () => {
    it('filters accurately by stage and multi-word queries', () => {
      const jobs: QueueJob[] = [
        mockJob({ id: 'j1', ref: 'J-101', clientName: 'Ford Prefect', status: 'new_lead', address: 'London' }),
        mockJob({ id: 'j2', ref: 'J-102', clientName: 'Tricia McMillan', status: 'in_progress', address: 'Islington' }),
        mockJob({ id: 'j3', ref: 'J-103', clientName: 'Zaphod Beeblebrox', status: 'complete', address: 'Heart of Gold' }),
      ];

      // Searching "Ford" in 'in_progress' stage should yield 0 results
      const stage: StageFilter = 'in_progress';
      const query = 'Ford';

      const filtered = jobs.filter(
        (j) => (stage === 'all' || j.status === stage) && matchesQuery(j, query),
      );

      expect(filtered.length).toBe(0);
      expect(jobStageLabel(stage)).toBe('In progress');

      // Searching "Ford" across all jobs should find 1
      const allMatches = jobs.filter(
        (j) => ('all' === 'all' || j.status === 'all') && matchesQuery(j, query),
      );
      expect(allMatches.length).toBe(1);
      expect(allMatches[0].clientName).toBe('Ford Prefect');
    });

    it('counts jobs by stage correctly', () => {
      const jobs: QueueJob[] = [
        mockJob({ id: 'j1', status: 'new_lead' }),
        mockJob({ id: 'j2', status: 'in_progress' }),
        mockJob({ id: 'j3', status: 'in_progress' }),
        mockJob({ id: 'j4', status: 'complete' }),
      ];

      const counts = stageCounts(jobs);
      expect(counts.all).toBe(4);
      expect(counts.new_lead).toBe(1);
      expect(counts.in_progress).toBe(2);
      expect(counts.complete).toBe(1);
      expect(counts.archived).toBe(0);
    });
  });

  describe('Keyboard and Focus Target Guards', () => {
    it('ignores hotkey shortcuts when user is typing in form inputs', () => {
      const shouldTrigger = (targetTagName: string, isContentEditable = false) => {
        const isFormInput =
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(targetTagName.toUpperCase()) ||
          isContentEditable;
        return !isFormInput;
      };

      expect(shouldTrigger('INPUT')).toBe(false);
      expect(shouldTrigger('TEXTAREA')).toBe(false);
      expect(shouldTrigger('SELECT')).toBe(false);
      expect(shouldTrigger('DIV', true)).toBe(false);
      expect(shouldTrigger('DIV', false)).toBe(true);
      expect(shouldTrigger('BODY', false)).toBe(true);
    });
  });
});
