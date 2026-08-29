import { describe, it, expect } from 'vitest';
import { marginVerdict, costConfidence, DEFAULT_MIN_MARGIN_PCT } from '@/lib/cost-truth';
import { computeMargin } from '@/lib/jobs';

describe('marginVerdict and Margin Sentinel Logic', () => {
  it('detects a healthy job operating above target margin floor', () => {
    const job = { quoted_amount: 5000 };
    const costs = [
      { id: '1', account_id: 'a', job_id: 'j', type: 'material' as const, category: 'Materials', description: 'Paint', amount: 1000, burden_amount: null, crew_id: null, crew_name: null, crew_role_label: null, supplier: 'Sherwin', receipt_url: null, cost_source: 'receipt' as const, hours: null, rate: null, created_at: '2026-08-28' },
      { id: '2', account_id: 'a', job_id: 'j', type: 'labor' as const, category: 'Labor', description: 'Labor', amount: 1500, burden_amount: 600, crew_id: null, crew_name: null, crew_role_label: null, supplier: null, receipt_url: null, cost_source: 'clocked' as const, hours: 50, rate: 30, created_at: '2026-08-28' },
    ];

    const margin = computeMargin(job, costs);
    // Total cost = 1000 (materials) + 1500 (wages) + 600 (burden) = 3100
    // Revenue = 5000, Profit = 1900, Margin = 38%
    expect(margin.totalCost).toBe(3100);
    expect(margin.profit).toBe(1900);
    expect(Math.round(margin.margin * 100)).toBe(38);

    const verdict = marginVerdict({
      revenue: margin.revenue,
      totalCost: margin.totalCost,
      minMarginPct: DEFAULT_MIN_MARGIN_PCT, // 15%
    });

    expect(verdict.below).toBe(false);
    expect(verdict.losing).toBe(false);
    expect(verdict.message).toBeNull();
  });

  it('triggers below floor warning when margin dips below floor (e.g. 10% vs 15% floor)', () => {
    const job = { quoted_amount: 1000 };
    const costs = [
      { id: '1', account_id: 'a', job_id: 'j', type: 'material' as const, category: 'Materials', description: 'Drywall', amount: 900, burden_amount: null, crew_id: null, crew_name: null, crew_role_label: null, supplier: 'Yard', receipt_url: null, cost_source: 'receipt' as const, hours: null, rate: null, created_at: '2026-08-28' },
    ];

    const margin = computeMargin(job, costs);
    // Total cost = 900, Revenue = 1000, Profit = 100, Margin = 10%
    expect(margin.margin).toBe(0.1);

    const verdict = marginVerdict({
      revenue: margin.revenue,
      totalCost: margin.totalCost,
      minMarginPct: 15,
      evidencedPct: 1.0,
    });

    expect(verdict.below).toBe(true);
    expect(verdict.losing).toBe(false);
    expect(verdict.message).toContain('Margin is 10%, below your 15% floor');
  });

  it('triggers loss alert when costs exceed quoted revenue', () => {
    const job = { quoted_amount: 1000 };
    const costs = [
      { id: '1', account_id: 'a', job_id: 'j', type: 'material' as const, category: 'Materials', description: 'Equipment repair', amount: 1350, burden_amount: null, crew_id: null, crew_name: null, crew_role_label: null, supplier: 'Rental Co', receipt_url: null, cost_source: 'supplier_invoice' as const, hours: null, rate: null, created_at: '2026-08-28' },
    ];

    const margin = computeMargin(job, costs);
    expect(margin.profit).toBe(-350);
    expect(margin.margin).toBe(-0.35);

    const verdict = marginVerdict({
      revenue: margin.revenue,
      totalCost: margin.totalCost,
      minMarginPct: 15,
    });

    expect(verdict.below).toBe(true);
    expect(verdict.losing).toBe(true);
    expect(verdict.message).toContain('running at a loss (-35%)');
  });

  it('correctly weighs cost confidence evidence by dollar amount', () => {
    const costs = [
      { amount: 50, burdenAmount: 0, source: 'estimated' as const },
      { amount: 50, burdenAmount: 0, source: 'estimated' as const },
      { amount: 900, burdenAmount: 0, source: 'receipt' as const },
    ];

    const confidence = costConfidence(costs);
    expect(confidence.total).toBe(1000);
    expect(confidence.evidenced).toBe(900);
    expect(confidence.estimated).toBe(100);
    expect(confidence.evidencedPct).toBe(0.9); // 90% evidence despite 2 out of 3 rows being estimated
  });
});
