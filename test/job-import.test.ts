import { describe, it, expect } from 'vitest';
import { mapImportedJobStatus, parseImportedDate } from '@/lib/jobs';

describe('mapImportedJobStatus', () => {
  it('maps common status words to the job_status enum', () => {
    expect(mapImportedJobStatus('Completed')).toBe('complete');
    expect(mapImportedJobStatus('paid')).toBe('complete');
    expect(mapImportedJobStatus('In Progress')).toBe('in_progress');
    expect(mapImportedJobStatus('Scheduled')).toBe('in_progress');
    expect(mapImportedJobStatus('Estimate')).toBe('new_lead');
    expect(mapImportedJobStatus('Quoted')).toBe('new_lead');
    expect(mapImportedJobStatus('Cancelled')).toBe('archived');
    expect(mapImportedJobStatus('Lost')).toBe('archived');
  });

  it('defaults blank / unknown to complete (historical migration)', () => {
    expect(mapImportedJobStatus('')).toBe('complete');
    expect(mapImportedJobStatus(null)).toBe('complete');
    expect(mapImportedJobStatus('whatever')).toBe('complete');
  });
});

describe('parseImportedDate', () => {
  it('passes through ISO / YYYY-MM-DD', () => {
    expect(parseImportedDate('2026-07-28')).toBe('2026-07-28');
    expect(parseImportedDate('2026-07-28T00:00:00Z')).toBe('2026-07-28');
  });

  it('converts M/D/Y and M/D/YY US dates', () => {
    expect(parseImportedDate('07/28/2026')).toBe('2026-07-28');
    expect(parseImportedDate('7/5/26')).toBe('2026-07-05');
  });

  it('returns null for blank or unparseable/invalid dates', () => {
    expect(parseImportedDate('')).toBeNull();
    expect(parseImportedDate(null)).toBeNull();
    expect(parseImportedDate('next tuesday')).toBeNull();
    expect(parseImportedDate('13/40/2026')).toBeNull();
  });
});
