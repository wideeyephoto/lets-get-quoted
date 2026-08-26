import { describe, it, expect } from 'vitest';
import { POST } from '../src/app/api/rebates/calculate/route';

describe('Clean Energy Rebate API Route - POST /api/rebates/calculate', () => {
  it('returns calculated IRA tax credits and utility rebates', async () => {
    const req = new Request('http://localhost/api/rebates/calculate', {
      method: 'POST',
      body: JSON.stringify({
        category: 'heat_pump_hvac',
        state: 'MI',
        projectCost: 11000,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.rebateReport).toBeDefined();
    expect(json.rebateReport.incentives.federalTaxCredit.calculatedAmount).toBe(2000);
    expect(json.rebateReport.financialSummary.grossPrice).toBe(11000);
    expect(json.rebateReport.financialSummary.totalIncentives).toBe(3200); // 2000 fed + 1200 DTE
  });

  it('rejects invalid requests with 400', async () => {
    const req = new Request('http://localhost/api/rebates/calculate', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
