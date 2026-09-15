import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadLeadDetail } from '@/lib/lead-detail';
import * as leadsModule from '@/lib/leads';
import * as jobsModule from '@/lib/jobs';
import * as leadPhotoStorageModule from '@/lib/lead-photo-storage';
import * as phoneModule from '@/lib/phone';
import * as leadDetailLabelsModule from '@/lib/lead-detail-labels';

vi.mock('@/lib/leads', async (importOriginal) => ({
  ...(await importOriginal<typeof leadsModule>()),
  getLead: vi.fn(),
  getLeadTriage: vi.fn(),
  formatLeadSource: vi.fn((s) => `Source: ${s}`),
}));

vi.mock('@/lib/jobs', () => ({
  getJob: vi.fn(),
  formatJobSchedule: vi.fn(() => 'Oct 5, 10:00 AM'),
  formatMoney: vi.fn((m) => `$${m}`),
}));

vi.mock('@/lib/lead-photo-storage', () => ({
  createLeadPhotoLinks: vi.fn(),
}));

vi.mock('@/lib/phone', () => ({
  formatPhoneDashes: vi.fn((p) => p),
}));

vi.mock('@/lib/lead-detail-labels', async (importOriginal) => ({
  ...(await importOriginal<typeof leadDetailLabelsModule>()),
  leadStageLabel: vi.fn(() => 'New'),
  formatLeadDate: vi.fn(() => 'Today'),
  leadScoreLabel: vi.fn(() => 'Hot'),
  estimateRangeLabel: vi.fn(() => '$1k-$2k'),
  formatLeadClock: vi.fn(() => '12:00 PM'),
}));

describe('Lead Detail Lib', () => {
  let supabaseMock: any;
  let queryMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    queryMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    };

    supabaseMock = {
      from: vi.fn(() => queryMock),
    };
  });

  it('returns null if lead not found', async () => {
    vi.mocked(leadsModule.getLead).mockResolvedValue(null);
    const res = await loadLeadDetail(supabaseMock, 'acct1', 'lead1');
    expect(res).toBeNull();
  });

  it('loads lead details correctly with history', async () => {
    vi.mocked(leadsModule.getLead).mockResolvedValue({
      id: 'lead1',
      name: 'Bob',
      status: 'new',
      source: 'web',
      phone: '1234567',
      client_id: 'client1',
      converted_job: 'job1',
      photo_paths: ['p1.jpg'],
      quote_visit: {
        scheduledFor: '2023-01-01',
        scheduledTime: '10:00',
        durationMinutes: 45,
        confirmationTextSentAt: '2023-01-01T09:00:00Z',
      }
    } as any);

    vi.mocked(leadsModule.getLeadTriage).mockReturnValue({
      score: 'A',
      flags: ['phone_verified', 'out_of_area'],
      contactLog: [
        { label: 'Called', at: '2023-01-01T12:00:00Z' },
        { label: 'Emailed', at: '2023-01-02T12:00:00Z' }
      ]
    } as any);

    vi.mocked(leadPhotoStorageModule.createLeadPhotoLinks).mockResolvedValue([{ path: 'p1.jpg', url: 'http://url1' }]);
    
    vi.mocked(jobsModule.getJob).mockResolvedValue({
      id: 'job1',
      ref: 'J-1',
      status: 'scheduled',
      quoted_amount: 500,
    } as any);

    queryMock.then = vi.fn((resolve) => resolve({ count: 5 }));

    const res = await loadLeadDetail(supabaseMock, 'acct1', 'lead1');

    expect(res).toBeDefined();
    expect(res?.name).toBe('Bob');
    expect(res?.flags).toEqual([{ key: 'out_of_area', label: 'Out of area' }]);
    expect(res?.contactLog).toHaveLength(2);
    // reversed contact log
    expect(res?.contactLog[0].label).toBe('Emailed');
    expect(res?.contactLog[1].label).toBe('Called');
    
    expect(res?.quoteVisit?.durationLabel).toBe('45 min');
    expect(res?.convertedJob?.ref).toBe('J-1');
    expect(res?.history?.jobs).toBe(5);
    expect(res?.history?.leads).toBe(5);
  });

  it('loads lead details without history or converted job', async () => {
    vi.mocked(leadsModule.getLead).mockResolvedValue({
      id: 'lead1',
      // no client_id, no converted_job, no quote_visit
    } as any);

    vi.mocked(leadsModule.getLeadTriage).mockReturnValue({
      score: 'B',
      flags: [],
    } as any);

    vi.mocked(leadPhotoStorageModule.createLeadPhotoLinks).mockRejectedValue(new Error('S3 error'));

    const res = await loadLeadDetail(supabaseMock, 'acct1', 'lead1');

    expect(res).toBeDefined();
    expect(res?.convertedJob).toBeNull();
    expect(res?.quoteVisit).toBeNull();
    expect(res?.history).toBeNull();
    expect(res?.photos).toEqual([]); // best-effort photo fetching
  });
});
