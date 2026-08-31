import { describe, it, expect } from 'vitest';

describe('Payment Receipts & Field Collection Utilities', () => {
  it('calculates cash change due accurately given amount and tendered cash', () => {
    function calculateCashChange(totalDue: number, amountTendered: number) {
      if (amountTendered < totalDue) {
        return { isSufficient: false, changeDue: 0, shortfall: totalDue - amountTendered };
      }
      const changeDue = Math.round((amountTendered - totalDue) * 100) / 100;
      return { isSufficient: true, changeDue, shortfall: 0 };
    }

    const test1 = calculateCashChange(450.00, 500.00);
    expect(test1.isSufficient).toBe(true);
    expect(test1.changeDue).toBe(50.00);

    const test2 = calculateCashChange(1275.50, 1300.00);
    expect(test2.isSufficient).toBe(true);
    expect(test2.changeDue).toBe(24.50);

    const test3 = calculateCashChange(500.00, 400.00);
    expect(test3.isSufficient).toBe(false);
    expect(test3.shortfall).toBe(100.00);
  });

  it('formats contractor payment receipt details with verification seal data', () => {
    function generateReceiptData(payment: {
      id: string;
      amount: number;
      clientName: string;
      jobRef: string;
      paymentMethod: string;
      paidAt: string;
    }) {
      return {
        receiptNumber: `RCP-${payment.id.slice(0, 8).toUpperCase()}`,
        clientName: payment.clientName,
        jobRef: payment.jobRef,
        amountFormatted: `$${payment.amount.toFixed(2)}`,
        paymentMethod: payment.paymentMethod,
        dateFormatted: new Date(payment.paidAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        status: 'PAID IN FULL',
      };
    }

    const receipt = generateReceiptData({
      id: 'pay_abc12345xyz',
      amount: 3250.00,
      clientName: 'Sarah Jenkins',
      jobRef: 'JOB-2024-88',
      paymentMethod: 'Credit Card (Visa ending in 4242)',
      paidAt: '2026-08-15T14:30:00Z',
    });

    expect(receipt.receiptNumber).toBe('RCP-PAY_ABC1');
    expect(receipt.clientName).toBe('Sarah Jenkins');
    expect(receipt.amountFormatted).toBe('$3250.00');
    expect(receipt.status).toBe('PAID IN FULL');
  });

  it('determines promise-to-pay timeliness and breach status accurately', () => {
    function evaluatePromiseToPay(promisedDateStr: string, currentDateStr: string) {
      const promised = new Date(promisedDateStr).getTime();
      const current = new Date(currentDateStr).getTime();
      const diffDays = Math.floor((current - promised) / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        return { isBroken: false, daysRemaining: Math.abs(diffDays) };
      }
      return { isBroken: true, daysOverdue: diffDays };
    }

    const onTime = evaluatePromiseToPay('2026-09-05', '2026-09-01');
    expect(onTime.isBroken).toBe(false);
    expect(onTime.daysRemaining).toBe(4);

    const broken = evaluatePromiseToPay('2026-08-25', '2026-08-31');
    expect(broken.isBroken).toBe(true);
    expect(broken.daysOverdue).toBe(6);
  });

  it('computes credit card surcharge recovery and net merchant savings', () => {
    function calculateSurchargeRecovery(monthlyCardVolume: number, surchargeRatePct = 3.0, stripeFeePct = 2.9, fixedFeePerTx = 0.30, avgTxSize = 1500) {
      const txCount = monthlyCardVolume / avgTxSize;
      const stripeCost = (monthlyCardVolume * (stripeFeePct / 100)) + (txCount * fixedFeePerTx);
      const surchargeCollected = monthlyCardVolume * (surchargeRatePct / 100);
      const netEffectiveFee = Math.max(0, stripeCost - surchargeCollected);
      const annualSavings = (stripeCost - netEffectiveFee) * 12;

      return {
        stripeCost: Math.round(stripeCost * 100) / 100,
        surchargeCollected: Math.round(surchargeCollected * 100) / 100,
        netEffectiveFee: Math.round(netEffectiveFee * 100) / 100,
        annualSavings: Math.round(annualSavings * 100) / 100,
      };
    }

    const result = calculateSurchargeRecovery(30000);
    expect(result.stripeCost).toBe(876.00); // $30k * 2.9% + 20 * $0.30
    expect(result.surchargeCollected).toBe(900.00); // $30k * 3%
    expect(result.netEffectiveFee).toBe(0.00);
    expect(result.annualSavings).toBe(10512.00);
  });
});
