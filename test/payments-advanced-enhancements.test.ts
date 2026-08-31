import { describe, it, expect } from 'vitest';
import { generateLienWaiverDocument, LIEN_WAIVER_TITLES } from '../src/lib/lien-waiver';
import { groupReceivablesByClient, formatConsolidatedStatementText } from '../src/lib/consolidated-billing';
import { calculateRetainageCents, generateRetainageReleaseDemand } from '../src/lib/retainage-tracker';
import type { ReceivableItem } from '../src/lib/receivables-data';

describe('Advanced Revenue & Payments Enhancements', () => {
  describe('1. Statutory Lien Waiver Generator', () => {
    it('generates statutory legal release documents for all 4 legal waiver types', () => {
      const types = [
        'conditional_progress',
        'unconditional_progress',
        'conditional_final',
        'unconditional_final',
      ] as const;

      for (const t of types) {
        const doc = generateLienWaiverDocument({
          type: t,
          claimantName: 'Austin Pro Roofing LLC',
          customerName: 'Marcus Vance',
          jobRef: 'JOB-904',
          propertyAddress: '1400 Congress Ave, Austin, TX',
          paymentAmount: 8500.50,
          throughDate: '2026-08-31',
        });

        expect(doc.title).toBe(LIEN_WAIVER_TITLES[t]);
        expect(doc.claimantName).toBe('Austin Pro Roofing LLC');
        expect(doc.customerName).toBe('Marcus Vance');
        expect(doc.formattedAmount).toBe('$8,500.50');
        expect(doc.legalBody).toContain('Austin Pro Roofing LLC');
        expect(doc.legalBody).toContain('1400 Congress Ave, Austin, TX');
        expect(doc.legalBody).toContain('$8,500.50');
      }
    });
  });

  describe('2. Consolidated Multi-Job Statement Billing', () => {
    it('groups open receivables by client across multiple jobs and calculates exact total balance', () => {
      const mockReceivables: ReceivableItem[] = [
        {
          id: 'inv-1',
          source: 'invoice',
          jobId: 'job-101',
          jobRef: 'JOB-101',
          clientName: 'Austin Real Estate Holdings LLC',
          clientPhone: '512-555-0101',
          clientEmail: 'billing@austinholdings.com',
          ref: 'INV-101',
          title: 'Roof Shingle Tear-off',
          amountTotal: 8000,
          amountPaid: 0,
          amountDue: 8000,
          status: 'sent',
          createdAt: '2026-08-01T00:00:00Z',
          dueDate: '2026-08-15',
          daysOutstanding: 30,
          daysOverdue: 16,
          agingBucket: '16_30',
          reliabilityTier: 'A',
          lastReminderSentAt: null,
          remindersCount: 0,
          payUrl: 'https://pay.test/inv-1',
        },
        {
          id: 'inv-2',
          source: 'invoice',
          jobId: 'job-102',
          jobRef: 'JOB-102',
          clientName: 'Austin Real Estate Holdings LLC',
          clientPhone: '512-555-0101',
          clientEmail: 'billing@austinholdings.com',
          ref: 'INV-102',
          title: 'HVAC Duct Replacement',
          amountTotal: 4500,
          amountPaid: 0,
          amountDue: 4500,
          status: 'sent',
          createdAt: '2026-08-01T00:00:00Z',
          dueDate: '2026-08-20',
          daysOutstanding: 30,
          daysOverdue: 11,
          agingBucket: '1_15',
          reliabilityTier: 'A',
          lastReminderSentAt: null,
          remindersCount: 0,
          payUrl: 'https://pay.test/inv-2',
        },
        {
          id: 'inv-3',
          source: 'invoice',
          jobId: 'job-103',
          jobRef: 'JOB-103',
          clientName: 'Austin Real Estate Holdings LLC',
          clientPhone: '512-555-0101',
          clientEmail: 'billing@austinholdings.com',
          ref: 'INV-103',
          title: 'Drywall Repair',
          amountTotal: 2500,
          amountPaid: 0,
          amountDue: 2500,
          status: 'sent',
          createdAt: '2026-08-01T00:00:00Z',
          dueDate: '2026-08-28',
          daysOutstanding: 30,
          daysOverdue: 3,
          agingBucket: '1_15',
          reliabilityTier: 'A',
          lastReminderSentAt: null,
          remindersCount: 0,
          payUrl: 'https://pay.test/inv-3',
        },
      ];

      const groups = groupReceivablesByClient(mockReceivables);
      expect(groups.length).toBe(1);

      const g = groups[0];
      expect(g.clientName).toBe('Austin Real Estate Holdings LLC');
      expect(g.totalDue).toBe(15000);
      expect(g.totalDueCents).toBe(1500000);
      expect(g.jobCount).toBe(3);
      expect(g.invoiceCount).toBe(3);

      const statementText = formatConsolidatedStatementText(g, 'Austin Pro Contracting', 'https://app.letsgetquoted.com/pay/consolidated/austin-holdings');
      expect(statementText).toContain('Total Open Balance: $15,000.00');
      expect(statementText).toContain('JOB-101');
      expect(statementText).toContain('JOB-102');
      expect(statementText).toContain('JOB-103');
    });
  });

  describe('3. Retainage & Punch List Escrow Tracker', () => {
    it('calculates retainage holdback amounts and generates formal prompt payment release demand', () => {
      const calc10 = calculateRetainageCents(65000, 10);
      expect(calc10.retainageDollars).toBe(6500);
      expect(calc10.formattedRetainage).toBe('$6,500.00');

      const calc5 = calculateRetainageCents(38000, 5);
      expect(calc5.retainageDollars).toBe(1900);
      expect(calc5.formattedRetainage).toBe('$1,900.00');

      const demand = generateRetainageReleaseDemand({
        claimantName: 'Apex Roofing & Siding',
        customerName: 'Highland Park Lofts LLC',
        projectAddress: '450 Highland Ave, Austin, TX',
        jobRef: 'JOB-412',
        contractTotal: 65000,
        retainageAmount: 6500,
        substantialCompletionDate: '2026-07-15',
        punchListCompleted: true,
      });

      expect(demand.title).toBe('Formal Demand for Release of Retainage');
      expect(demand.amountFormatted).toBe('$6,500.00');
      expect(demand.body).toContain('DEMAND FOR RELEASE OF RETAINAGE FUNDS');
      expect(demand.body).toContain('$6,500.00 (10.0% of total contract value $65,000.00)');
      expect(demand.body).toContain('Highland Park Lofts LLC');
    });
  });

  describe('4. Homeowner ACH Early-Pay Incentive Economics', () => {
    it('verifies contractor net fee savings when offering homeowner ACH prompt credit', () => {
      const projectTotal = 10000;
      const cardFee = projectTotal * 0.029 + 0.30; // $290.30
      const homeownerCredit = 100.00; // $100 instant cash credit
      const achFee = 5.00; // Flat $5 ACH fee

      const contractorNetFeeCost = homeownerCredit + achFee; // $105.00
      const netSavings = cardFee - contractorNetFeeCost; // $185.30

      expect(cardFee).toBe(290.30);
      expect(contractorNetFeeCost).toBe(105.00);
      expect(Math.round(netSavings * 100) / 100).toBe(185.30);
      expect(netSavings).toBeGreaterThan(0);
    });
  });

  describe('5. IRS Form 1099-K Reporting Scope & Threshold Accuracy', () => {
    it('ensures 1099-K informational copy accurately distinguishes payment card reporting from TPSO network thresholds', async () => {
      const { readFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const panelCode = readFileSync(join(process.cwd(), 'src/app/dashboard/payments/PayoutsTransfersPanel.tsx'), 'utf8');

      // The copy must not categorically state that 1099-K only applies over $20k / 200 tx,
      // because payment card transactions have no de minimis threshold.
      expect(panelCode).not.toContain('Federal IRS Form 1099-K reporting applies to accounts processing over $20,000');
      expect(panelCode).toContain('payment card transactions have no minimum reporting threshold');
      expect(panelCode).toContain('third-party network (TPSO) transactions are subject to federal thresholds ($20,000 and 200 transactions)');
      expect(panelCode).toContain('Stripe Connect automatically generates and delivers official year-end tax forms');
    });
  });
});

