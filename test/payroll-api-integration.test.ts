import { describe, it, expect, vi } from 'vitest';
import {
  validatePayrollSubmission,
  buildProviderPayload,
  submitPayrollToProvider,
  processPayrollWebhook,
  PROVIDER_CAPABILITIES,
  type PayrollProviderConfig,
  type GustoPayrollSubmissionPayload,
  type QuickBooksTimeActivityBatchPayload,
  type AdpPayrollEventPayload,
  type PaychexTimeTransactionBatchPayload,
  type GenericPayrollWebhookPayload,
} from '@/lib/payroll-api-integration';
import type { CrewPayRow } from '@/lib/crew-pay';
import type { PayType } from '@/lib/pay-types';

function makeRow(over: Partial<CrewPayRow> & { name: string }): CrewPayRow {
  return {
    crewId: `crew-${over.name.replace(/\s+/g, '-').toLowerCase()}`,
    roleLabel: 'Technician',
    rate: 35,
    rateVaries: false,
    hours: 40,
    regularHours: 40,
    overtimeHours: 0,
    estimatedPay: 1400,
    jobIds: ['job-1'],
    entryCount: 1,
    issues: [],
    entries: [],
    payType: 'hourly' as PayType,
    payBasis: 'Hours logged × rate',
    overtimePaid: true,
    workedDays: 5,
    payProblem: null,
    status: 'approved',
    review: 'approved',
    payment: 'unpaid',
    eligible: true,
    ineligibleReason: null,
    warnings: [],
    blockers: [],
    record: null,
    approvedAmount: 1400,
    paidAmount: null,
    adjustment: 0,
    payrollId: 'EMP-101',
    locked: false,
    paymentLabel: null,
    paymentDetail: null,
    ...over,
  } as CrewPayRow;
}

const defaultOptions = {
  rangeLabel: 'Aug 24 – Aug 30',
  periodStartKey: '2026-08-24',
  periodEndKey: '2026-08-30',
};

describe('Native Payroll Provider Capabilities', () => {
  it('defines capabilities for all supported providers', () => {
    expect(PROVIDER_CAPABILITIES.gusto.supportsDirectApi).toBe(true);
    expect(PROVIDER_CAPABILITIES.quickbooks.supportsDirectApi).toBe(true);
    expect(PROVIDER_CAPABILITIES.adp.supportsDirectApi).toBe(true);
    expect(PROVIDER_CAPABILITIES.paychex.supportsDirectApi).toBe(true);
    expect(PROVIDER_CAPABILITIES.generic.supportsDirectApi).toBe(true);
  });
});

describe('validatePayrollSubmission', () => {
  it('accepts approved hourly rows with employee IDs', () => {
    const rows = [makeRow({ name: 'Alex Electrician', regularHours: 40, overtimeHours: 5, estimatedPay: 1662.5 })];
    const res = validatePayrollSubmission('gusto', rows, defaultOptions);
    expect(res.valid).toBe(true);
    expect(res.payable).toHaveLength(1);
    expect(res.totalGross).toBe(1662.5);
    expect(res.totalHours).toBe(45);
    expect(res.problems).toHaveLength(0);
  });

  it('excludes salaried employees to prevent double-pay in payroll runs', () => {
    const rows = [
      makeRow({ name: 'Sam Salary', payType: 'salary', estimatedPay: 1500 }),
      makeRow({ name: 'Holly Hourly', payType: 'hourly', estimatedPay: 1200 }),
    ];
    const res = validatePayrollSubmission('gusto', rows, defaultOptions);
    expect(res.valid).toBe(true);
    expect(res.payable).toHaveLength(1);
    expect(res.payable[0].name).toBe('Holly Hourly');
    expect(res.excluded).toHaveLength(1);
    expect(res.excluded[0].name).toBe('Sam Salary');
    expect(res.excluded[0].reason).toContain('double-pay');
  });

  it('fails validation when ADP or Paychex is missing employee payroll ID', () => {
    const rows = [makeRow({ name: 'Dave Tech', payrollId: null })];
    const resAdp = validatePayrollSubmission('adp', rows, defaultOptions);
    expect(resAdp.valid).toBe(false);
    expect(resAdp.problems[0]).toContain('employee ID');

    const resPaychex = validatePayrollSubmission('paychex', rows, defaultOptions);
    expect(resPaychex.valid).toBe(false);
    expect(resPaychex.problems[0]).toContain('employee ID');
  });

  it('warns if the pay period was already marked sent', () => {
    const rows = [makeRow({ name: 'Dave Tech' })];
    const res = validatePayrollSubmission('gusto', rows, { ...defaultOptions, alreadySent: true });
    expect(res.warnings.some((w) => w.includes('already been marked as sent'))).toBe(true);
  });

  it('rejects unapproved draft rows', () => {
    const rows = [makeRow({ name: 'Draft Dave', review: 'draft', status: 'draft' })];
    const res = validatePayrollSubmission('gusto', rows, defaultOptions);
    expect(res.valid).toBe(false);
    expect(res.payable).toHaveLength(0);
    expect(res.problems).toContain('No payable crew members in this pay period.');
  });
});

describe('buildProviderPayload for each native provider', () => {
  const payable = [
    {
      crewId: 'crew-1',
      name: 'Bob Builder',
      payrollId: 'GUSTO-001',
      payType: 'hourly' as PayType,
      regularHours: 35,
      overtimeHours: 5,
      amount: 1400,
    },
    {
      crewId: 'crew-2',
      name: 'Dan Day',
      payrollId: 'GUSTO-002',
      payType: 'day_rate' as PayType,
      regularHours: 0,
      overtimeHours: 0,
      amount: 600,
    },
  ];

  it('builds valid Gusto payroll submission payload', () => {
    const payload = buildProviderPayload('gusto', payable, {
      ...defaultOptions,
      companyId: 'comp_123',
    }) as GustoPayrollSubmissionPayload;

    expect(payload.provider).toBe('gusto');
    expect(payload.company_id).toBe('comp_123');
    expect(payload.employee_compensations).toHaveLength(2);
    expect(payload.employee_compensations[0].regular_hours).toBe(35);
    expect(payload.employee_compensations[0].overtime_hours).toBe(5);
    expect(payload.employee_compensations[1].paid_as).toBe('day_rate');
    expect(payload.employee_compensations[1].additional_earnings?.[0].amount).toBe(600);
  });

  it('builds valid QuickBooks time activity batch payload', () => {
    const payload = buildProviderPayload('quickbooks', payable, {
      ...defaultOptions,
      realmId: 'realm_456',
    }) as QuickBooksTimeActivityBatchPayload;

    expect(payload.provider).toBe('quickbooks');
    expect(payload.realm_id).toBe('realm_456');
    // Hourly Bob produces 2 entries (Regular + Overtime) + Day Dan produces 1
    expect(payload.time_activities).toHaveLength(3);
    expect(payload.time_activities[0].ItemRef.value).toBe('Regular_Pay');
    expect(payload.time_activities[0].Hours).toBe(35);
    expect(payload.time_activities[1].ItemRef.value).toBe('Overtime_Pay');
    expect(payload.time_activities[1].Hours).toBe(5);
    expect(payload.time_activities[2].GrossAmount).toBe(600);
  });

  it('builds valid ADP payroll event payload', () => {
    const payload = buildProviderPayload('adp', payable, {
      ...defaultOptions,
      companyId: 'ADP_CO_99',
    }) as AdpPayrollEventPayload;

    expect(payload.provider).toBe('adp');
    expect(payload.events).toHaveLength(1);
    const event = payload.events[0];
    expect(event.serviceCategoryCode.codeValue).toBe('payroll');
    expect(event.payrollOutput.companyCode).toBe('ADP_CO_99');
    expect(event.payrollOutput.workerCompensations).toHaveLength(2);
    expect(event.payrollOutput.workerCompensations[0].regularHours).toBe(35);
    expect(event.payrollOutput.workerCompensations[1].otherEarnings?.[0].earningCode).toBe('OTH');
  });

  it('builds valid Paychex time transaction batch payload', () => {
    const payload = buildProviderPayload('paychex', payable, {
      ...defaultOptions,
      companyId: 'PAYCHEX_88',
    }) as PaychexTimeTransactionBatchPayload;

    expect(payload.provider).toBe('paychex');
    expect(payload.companyId).toBe('PAYCHEX_88');
    expect(payload.transactions).toHaveLength(2);
    expect(payload.transactions[0].earnings[0].code).toBe('REG');
    expect(payload.transactions[0].earnings[0].hours).toBe(35);
    expect(payload.transactions[0].earnings[1].code).toBe('OT');
    expect(payload.transactions[0].earnings[1].hours).toBe(5);
    expect(payload.transactions[1].earnings[0].code).toBe('OTH');
    expect(payload.transactions[1].earnings[0].amount).toBe(600);
  });

  it('builds valid Generic webhook payload with calculated totals', () => {
    const payload = buildProviderPayload('generic', payable, defaultOptions) as GenericPayrollWebhookPayload;

    expect(payload.provider).toBe('generic');
    expect(payload.event).toBe('payroll.submission');
    expect(payload.totals.headcount).toBe(2);
    expect(payload.totals.grossPay).toBe(2000);
    expect(payload.totals.regularHours).toBe(35);
    expect(payload.totals.overtimeHours).toBe(5);
  });
});

describe('submitPayrollToProvider', () => {
  const config: PayrollProviderConfig = {
    provider: 'gusto',
    companyId: 'comp_123',
    status: 'connected',
  };

  const payload = buildProviderPayload('gusto', [
    {
      crewId: 'c1',
      name: 'Tim Tech',
      payrollId: 'G1',
      payType: 'hourly',
      regularHours: 40,
      overtimeHours: 2,
      amount: 1470,
    },
  ], defaultOptions);

  it('executes dry run preview without network transmission', async () => {
    const res = await submitPayrollToProvider(config, payload, { dryRun: true });
    expect(res.success).toBe(true);
    expect(res.isDryRun).toBe(true);
    expect(res.status).toBe('pending');
    expect(res.recordCount).toBe(1);
    expect(res.totalHours).toBe(42);
    expect(res.providerResponse.dryRunValidated).toBe(true);
  });

  it('executes sandbox live simulation returning batch and transaction ID', async () => {
    const res = await submitPayrollToProvider(config, payload, { dryRun: false });
    expect(res.success).toBe(true);
    expect(res.isDryRun).toBe(false);
    expect(res.status).toBe('submitted');
    expect(res.batchId).toBeDefined();
    expect(res.transactionId).toContain('TXN-GUSTO-');
  });

  it('dispatches to configured webhook URL and handles success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'received_and_queued', confirmationId: 'CONF-9988' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const customConfig: PayrollProviderConfig = {
      provider: 'gusto',
      webhookUrl: 'https://api.gusto.com/v1/sandbox/payrolls/submit',
      accessToken: 'test_token',
      status: 'connected',
    };

    const res = await submitPayrollToProvider(customConfig, payload);
    expect(res.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.gusto.com/v1/sandbox/payrolls/submit',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Payroll-Provider': 'gusto',
          Authorization: 'Bearer test_token',
        }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it('handles provider HTTP errors cleanly', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Invalid OAuth access token',
    });
    vi.stubGlobal('fetch', mockFetch);

    const customConfig: PayrollProviderConfig = {
      provider: 'gusto',
      webhookUrl: 'https://api.gusto.com/v1/payrolls',
      status: 'connected',
    };

    const res = await submitPayrollToProvider(customConfig, payload);
    expect(res.success).toBe(false);
    expect(res.status).toBe('failed');
    expect(res.errors?.[0]).toContain('401');

    vi.unstubAllGlobals();
  });
});

describe('processPayrollWebhook', () => {
  it('processes Gusto payroll.paid webhook', () => {
    const body = {
      event_type: 'payroll.processed',
      external_batch_id: 'BATCH-AUG-2026',
      id: 'GUSTO-TXN-123',
      total_gross: 4500,
    };
    const res = processPayrollWebhook('gusto', {}, body);
    expect(res.valid).toBe(true);
    expect(res.event?.eventType).toBe('payroll.paid');
    expect(res.event?.batchId).toBe('BATCH-AUG-2026');
    expect(res.event?.totalPaid).toBe(4500);
  });

  it('processes QuickBooks Payroll webhook', () => {
    const body = {
      batch_id: 'QBO-BATCH-77',
      status: 'synced',
    };
    const res = processPayrollWebhook('quickbooks', {}, body);
    expect(res.valid).toBe(true);
    expect(res.event?.eventType).toBe('payroll.processed');
    expect(res.event?.batchId).toBe('QBO-BATCH-77');
  });

  it('processes ADP RUN webhook', () => {
    const body = {
      events: [
        {
          eventID: 'ADP-EVT-44',
          payrollOutput: { batchID: 'ADP-BATCH-99' },
        },
      ],
    };
    const res = processPayrollWebhook('adp', {}, body);
    expect(res.valid).toBe(true);
    expect(res.event?.eventType).toBe('payroll.paid');
    expect(res.event?.batchId).toBe('ADP-BATCH-99');
  });

  it('handles malformed webhook payload gracefully', () => {
    const res = processPayrollWebhook('gusto', {}, null as unknown as Record<string, unknown>);
    expect(res.valid).toBe(false);
    expect(res.error).toBeDefined();
  });
});
