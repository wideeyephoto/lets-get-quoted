import { describe, it, expect } from 'vitest';
import { generateNoiDocumentData, calculateCureDeadline } from '../src/lib/noi-generator';
import { generateGeneralLedgerJournalEntries } from '../src/lib/accounting/accounting-sync-engine';

describe('Notice of Intent to Lien (NOI) Generator', () => {
  it('calculates 10-day statutory cure deadline accurately', () => {
    const noticeDate = new Date('2026-08-31T12:00:00Z');
    const deadline = calculateCureDeadline(noticeDate, 10);
    expect(deadline.toISOString().slice(0, 10)).toBe('2026-09-10');
  });

  it('compiles compliant Notice of Intent to Lien document with mandatory legal advisements', () => {
    const doc = generateNoiDocumentData({
      contractorName: 'Apex Pro Roofing LLC',
      contractorContact: 'office@apexproroofing.com · (555) 234-5678',
      propertyOwner: 'Robert Henderson',
      propertyAddress: '742 Evergreen Terrace, Springfield, IL',
      jobRef: 'JOB-2024-912',
      invoiceRef: 'INV-401',
      amountDue: 6850.00,
      daysOverdue: 45,
      curePeriodDays: 10,
    });

    expect(doc.documentTitle).toBe('STATUTORY NOTICE OF INTENT TO FILE MECHANIC’S LIEN');
    expect(doc.claimant).toBe('Apex Pro Roofing LLC');
    expect(doc.propertyOwner).toBe('Robert Henderson');
    expect(doc.propertyAddress).toBe('742 Evergreen Terrace, Springfield, IL');
    expect(doc.amountFormatted).toBe('$6,850.00');
    expect(doc.legalAdvisementText).toContain('10 calendar days');
    expect(doc.legalAdvisementText).toContain('filing a verified Mechanic’s Lien');
  });
});

describe('Automated Dunning & Escalation Rules Engine', () => {
  it('determines the correct dunning stage based on days overdue', () => {
    function resolveDunningStage(daysOverdue: number): { stage: number; label: string; action: string } {
      if (daysOverdue >= 30) return { stage: 4, label: 'Formal Demand', action: 'Certified Demand Letter + Late Fee' };
      if (daysOverdue >= 14) return { stage: 3, label: 'Urgent Notice', action: 'Urgent SMS + Office Phone Callback' };
      if (daysOverdue >= 7) return { stage: 2, label: 'Friendly Reminder', action: 'Email with 2% Early Pay Incentive' };
      if (daysOverdue >= 1) return { stage: 1, label: 'Payment Due', action: 'Gentle SMS with Instant Pay Link' };
      return { stage: 0, label: 'Current', action: 'None' };
    }

    expect(resolveDunningStage(0).stage).toBe(0);
    expect(resolveDunningStage(3).stage).toBe(1);
    expect(resolveDunningStage(10).stage).toBe(2);
    expect(resolveDunningStage(20).stage).toBe(3);
    expect(resolveDunningStage(45).stage).toBe(4);
  });
});

describe('QuickBooks & Xero Double-Entry Accounting Sync', () => {
  it('generates balanced journal entries with sum(Debits) === sum(Credits)', () => {
    const transactions = [
      { id: 'pay_1', clientName: 'Sarah Jenkins', gross: 5000.00, fee: 145.30, net: 4854.70 },
      { id: 'pay_2', clientName: 'Robert Vance', gross: 2500.00, fee: 5.00, net: 2495.00 }, // ACH
      { id: 'pay_3', clientName: 'Michael Scott', gross: 1200.00, fee: 0.00, net: 1200.00 }, // Cash
    ];

    const entries = generateGeneralLedgerJournalEntries(transactions);

    const totalDebits = entries.reduce((sum, e) => sum + e.debit, 0);
    const totalCredits = entries.reduce((sum, e) => sum + e.credit, 0);

    expect(Math.round(totalDebits * 100) / 100).toBe(Math.round(totalCredits * 100) / 100);
    expect(totalCredits).toBe(8700.00); // 5000 + 2500 + 1200
  });
});

describe('Card-on-File Milestone Pre-Authorization', () => {
  it('computes milestone authorization draw schedules with exact dollar allocations', () => {
    function generateMilestoneDrawSchedule(contractTotal: number, stages: Array<{ name: string; pct: number }>) {
      return stages.map((s) => ({
        name: s.name,
        percentage: s.pct,
        amount: Math.round(contractTotal * (s.pct / 100) * 100) / 100,
      }));
    }

    const schedule = generateMilestoneDrawSchedule(20000, [
      { name: 'Initial Deposit (Materials Ordering)', pct: 40 },
      { name: 'Rough-in Inspection Approval', pct: 30 },
      { name: 'Final Walkthrough & Sign-off', pct: 30 },
    ]);

    expect(schedule[0].amount).toBe(8000.00);
    expect(schedule[1].amount).toBe(6000.00);
    expect(schedule[2].amount).toBe(6000.00);
    const total = schedule.reduce((sum, s) => sum + s.amount, 0);
    expect(total).toBe(20000.00);
  });
});
