import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadJobDetail } from '@/lib/job-detail';
import * as jobsModule from '@/lib/jobs';
import * as paymentsModule from '@/lib/payments';
import * as invoicesModule from '@/lib/invoices';
import * as jobFeedModule from '@/lib/job-feed';
import * as jobTasksModule from '@/lib/job-tasks';
import * as crewModule from '@/lib/crew';
import * as jobPhotoStorageModule from '@/lib/job-photo-storage';

vi.mock('@/lib/jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof jobsModule>()),
  getJob: vi.fn(),
  listCosts: vi.fn(),
  computeMargin: vi.fn(),
  formatJobTime: vi.fn((t) => t),
  formatMoney: vi.fn((amt) => `$${amt}`),
}));

vi.mock('@/lib/payments', () => ({
  listPayments: vi.fn(),
}));

vi.mock('@/lib/invoices', () => ({
  listInvoices: vi.fn(),
  selectPrimaryInvoice: vi.fn(),
}));

vi.mock('@/lib/job-feed', () => ({
  listJobFeed: vi.fn(),
  createLinkedFeedItems: vi.fn(),
  sortJobFeed: vi.fn((arr) => arr),
}));

vi.mock('@/lib/job-tasks', () => ({
  listJobTasks: vi.fn(),
  taskProgress: vi.fn(),
}));

vi.mock('@/lib/crew', () => ({
  listCrewIdsForJob: vi.fn(),
  listCrew: vi.fn(),
}));

vi.mock('@/lib/job-photo-storage', () => ({
  createJobPhotoLinks: vi.fn(),
}));

describe('Job Detail Lib', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null if job not found', async () => {
    vi.mocked(jobsModule.getJob).mockResolvedValue(null);
    const res = await loadJobDetail({} as any, 'acct1', 'job1');
    expect(res).toBeNull();
  });

  it('loads job details correctly', async () => {
    vi.mocked(jobsModule.getJob).mockResolvedValue({
      id: 'job1',
      ref: 'J-123',
      client_name: 'John Doe',
      client_phone: '5551234',
      client_email: 'john@example.com',
      address: '123 Main St',
      scope: 'Paint house',
      status: 'scheduled',
      created_at: '2023-01-01T12:00:00Z',
      scheduled_for: '2023-05-01',
      scheduled_time: '10:00 AM',
      estimated_hours: 10,
      quoted_amount: 1000,
      photo_paths: ['photo1.jpg', 'photo2.jpg'],
    } as any);

    vi.mocked(jobsModule.listCosts).mockResolvedValue([{ id: 'cost1' } as any]);
    vi.mocked(jobsModule.computeMargin).mockReturnValue({
      revenue: 1000, materialsCost: 100, laborCost: 200, otherCost: 50, totalCost: 350, profit: 650, margin: 0.65
    } as any);
    
    vi.mocked(paymentsModule.listPayments).mockResolvedValue([
      { id: 'pay1', amount: 500, status: 'paid', invoice_id: 'inv1' }
    ] as any);

    vi.mocked(invoicesModule.listInvoices).mockResolvedValue([{ id: 'inv1' } as any]);
    vi.mocked(invoicesModule.selectPrimaryInvoice).mockReturnValue({ id: 'inv1', ref: 'INV-1', status: 'open', total: 1000 } as any);
    
    vi.mocked(jobFeedModule.listJobFeed).mockResolvedValue([]);
    vi.mocked(jobFeedModule.createLinkedFeedItems).mockReturnValue([
      { id: 'event1', kind: 'job_created', created_at: '2023-01-01T12:00:00Z' } as any
    ]);
    
    vi.mocked(jobTasksModule.listJobTasks).mockResolvedValue([
      { id: 'task1', title: 'Buy paint', done: true }
    ] as any);
    vi.mocked(jobTasksModule.taskProgress).mockReturnValue({ done: 1, total: 1, pct: 100 });
    
    vi.mocked(crewModule.listCrewIdsForJob).mockResolvedValue(['crew1']);
    vi.mocked(crewModule.listCrew).mockResolvedValue([
      { id: 'crew1', name: 'Alice', role_label: 'Painter' }
    ] as any);
    
    vi.mocked(jobPhotoStorageModule.createJobPhotoLinks).mockResolvedValue([
      { path: 'photo1.jpg', url: 'http://url1' },
      { path: 'photo2.jpg', url: 'http://url2' },
    ]);

    const res = await loadJobDetail({} as any, 'acct1', 'job1');
    
    expect(res).toBeDefined();
    expect(res?.ref).toBe('J-123');
    expect(res?.money.marginLabel).toBe('65%'); // cost.length > 0
    expect(res?.money.paidLabel).toBe('$500');
    expect(res?.money.outstandingLabel).toBe('$500');
    expect(res?.invoice?.ref).toBe('INV-1');
    expect(res?.crew).toEqual([{ id: 'crew1', name: 'Alice', roleLabel: 'Painter' }]);
    expect(res?.tasks.items).toHaveLength(1);
    expect(res?.feed).toHaveLength(1);
    expect(res?.photoCount).toBe(2);
    expect(res?.scheduledLabel).toContain('10:00 AM');
  });

  it('loads job details with no costs', async () => {
    vi.mocked(jobsModule.getJob).mockResolvedValue({
      id: 'job1',
      created_at: '2023-01-01T12:00:00Z',
      quoted_amount: 1000,
    } as any);

    vi.mocked(jobsModule.listCosts).mockResolvedValue([]);
    vi.mocked(jobsModule.computeMargin).mockReturnValue({
      revenue: 1000, materialsCost: 0, laborCost: 0, otherCost: 0, totalCost: 0, profit: 1000, margin: 1
    } as any);
    
    vi.mocked(paymentsModule.listPayments).mockResolvedValue([]);
    vi.mocked(invoicesModule.selectPrimaryInvoice).mockReturnValue(null);
    vi.mocked(jobFeedModule.createLinkedFeedItems).mockReturnValue([]);
    vi.mocked(jobTasksModule.listJobTasks).mockResolvedValue([]);
    vi.mocked(jobTasksModule.taskProgress).mockReturnValue({ done: 0, total: 0, pct: 0 });
    vi.mocked(crewModule.listCrewIdsForJob).mockResolvedValue([]);
    vi.mocked(crewModule.listCrew).mockResolvedValue([]);
    vi.mocked(jobPhotoStorageModule.createJobPhotoLinks).mockResolvedValue([]);

    const res = await loadJobDetail({} as any, 'acct1', 'job1');
    
    expect(res?.money.marginLabel).toBe('No costs yet');
    expect(res?.invoice).toBeNull();
    expect(res?.money.paidLabel).toBe('$0');
    expect(res?.money.outstandingLabel).toBe('$1000');
  });
});
