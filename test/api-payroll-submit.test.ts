import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/payroll/submit/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireOfficeContext: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  unstable_rethrow: vi.fn(),
}));

vi.mock('@/lib/labor', () => ({
  resolvePayPeriod: vi.fn(),
  normalizePeriodMode: vi.fn(),
  normalizeOffset: vi.fn(),
}));

vi.mock('@/lib/crew-pay-data', () => ({
  loadCrewPayContext: vi.fn(),
  ensurePayPeriodRow: vi.fn(),
  logPayEvent: vi.fn(),
  markSentToPayroll: vi.fn(),
  snapshotOf: vi.fn(),
}));

vi.mock('@/lib/crew-pay', () => ({
  periodEndKey: vi.fn(),
  periodStartKey: vi.fn(),
  formatKeyRange: vi.fn(),
  payMoney: vi.fn(),
}));

vi.mock('@/lib/labor-settings', () => ({
  laborRulesFromAccount: vi.fn(),
}));

vi.mock('@/lib/payroll-export', () => ({
  normalizePayrollProvider: vi.fn(),
}));

vi.mock('@/lib/payroll-api-integration', () => ({
  validatePayrollSubmission: vi.fn(),
  buildProviderPayload: vi.fn(),
  submitPayrollToProvider: vi.fn(),
}));

describe('Payroll Submit Route', () => {
  let requireOfficeContextMock: any;
  let unstableRethrowMock: any;
  let accountMock: any;
  let loadCrewPayContextMock: any;
  let resolvePayPeriodMock: any;
  let validatePayrollSubmissionMock: any;
  let submitPayrollToProviderMock: any;
  let ensurePayPeriodRowMock: any;
  let markSentToPayrollMock: any;
  let logPayEventMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    accountMock = vi.fn().mockResolvedValue({ data: { timezone: 'America/New_York' } });

    const supabaseMock = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: accountMock
          })
        })
      }))
    };

    requireOfficeContextMock = (await import('@/lib/auth')).requireOfficeContext;
    requireOfficeContextMock.mockResolvedValue({ supabase: supabaseMock, accountId: 'acct_1', userEmail: 'user@test.com' });

    unstableRethrowMock = (await import('next/navigation')).unstable_rethrow;

    const laborMock = await import('@/lib/labor');
    laborMock.normalizePeriodMode.mockReturnValue('weekly');
    laborMock.normalizeOffset.mockReturnValue(0);
    resolvePayPeriodMock = laborMock.resolvePayPeriod;
    resolvePayPeriodMock.mockReturnValue({ rangeLabel: 'Jan 1 - 7' });

    const settingsMock = await import('@/lib/labor-settings');
    settingsMock.laborRulesFromAccount.mockReturnValue({});

    const crewPayMock = await import('@/lib/crew-pay');
    crewPayMock.periodEndKey.mockReturnValue('2024-01-07');
    crewPayMock.periodStartKey.mockReturnValue('2024-01-01');

    const dataMock = await import('@/lib/crew-pay-data');
    loadCrewPayContextMock = dataMock.loadCrewPayContext;
    loadCrewPayContextMock.mockResolvedValue({ available: true, rows: [{ crewId: 'c1', eligible: true, hours: 10, review: 'approved', payment: 'unpaid' }] });
    
    ensurePayPeriodRowMock = dataMock.ensurePayPeriodRow;
    ensurePayPeriodRowMock.mockResolvedValue({ id: 'p1' });
    
    markSentToPayrollMock = dataMock.markSentToPayroll;
    markSentToPayrollMock.mockResolvedValue(undefined);
    
    logPayEventMock = dataMock.logPayEvent;
    logPayEventMock.mockResolvedValue(undefined);

    const exportMock = await import('@/lib/payroll-export');
    exportMock.normalizePayrollProvider.mockReturnValue('gusto');

    const integrationMock = await import('@/lib/payroll-api-integration');
    validatePayrollSubmissionMock = integrationMock.validatePayrollSubmission;
    validatePayrollSubmissionMock.mockReturnValue({ valid: true, payable: [{}], totalGross: 1000, totalHours: 40 });
    
    submitPayrollToProviderMock = integrationMock.submitPayrollToProvider;
    submitPayrollToProviderMock.mockResolvedValue({ success: true, batchId: 'b1' });
  });

  it('fails if invalid body', async () => {
    const req = new NextRequest('http://localhost/api/payroll/submit', { method: 'POST', body: 'invalid json' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('fails if unavailable', async () => {
    loadCrewPayContextMock.mockResolvedValue({ available: false });
    const req = new NextRequest('http://localhost/api/payroll/submit', { method: 'POST', body: JSON.stringify({}) });
    const res = await POST(req);
    expect(res.status).toBe(503);
  });

  it('fails if invalid and not dryRun', async () => {
    validatePayrollSubmissionMock.mockReturnValue({ valid: false, problems: [] });
    const req = new NextRequest('http://localhost/api/payroll/submit', { method: 'POST', body: JSON.stringify({}) });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it('fails if submission fails', async () => {
    submitPayrollToProviderMock.mockResolvedValue({ success: false, message: 'API error' });
    const req = new NextRequest('http://localhost/api/payroll/submit', { method: 'POST', body: JSON.stringify({}) });
    const res = await POST(req);
    expect(res.status).toBe(502);
  });

  it('succeeds in dry run', async () => {
    const req = new NextRequest('http://localhost/api/payroll/submit', { method: 'POST', body: JSON.stringify({ dryRun: true }) });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(markSentToPayrollMock).not.toHaveBeenCalled();
    expect(logPayEventMock).not.toHaveBeenCalled();
  });

  it('succeeds and marks sent', async () => {
    const req = new NextRequest('http://localhost/api/payroll/submit', { method: 'POST', body: JSON.stringify({ crewIds: ['c1'] }) });
    const res = await POST(req);
    const data = await res.json();
    console.log(data);
    expect(res.status).toBe(200);
    expect(ensurePayPeriodRowMock).toHaveBeenCalled();
    expect(markSentToPayrollMock).toHaveBeenCalled();
    expect(logPayEventMock).toHaveBeenCalled();
  });

  it('handles db error', async () => {
    const error = new Error('db error');
    requireOfficeContextMock.mockRejectedValue(error);
    
    const req = new NextRequest('http://localhost/api/payroll/submit', { method: 'POST', body: JSON.stringify({}) });
    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(unstableRethrowMock).toHaveBeenCalledWith(error);
  });
});
