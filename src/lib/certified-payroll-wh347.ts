export interface Wh347WorkerEntry {
  workerName: string;
  lastFourSsn: string;
  workClassification: string;
  dailyHours: {
    monday: number;
    tuesday: number;
    wednesday: number;
    thursday: number;
    friday: number;
    saturday: number;
    sunday: number;
  };
  straightTimeHours: number;
  overtimeHours: number;
  hourlyRateDollars: number;
  hourlyFringeBenefitsDollars: number;
  grossEarnedDollars: number;
  deductions: {
    ficaDollars: number;
    federalWithholdingDollars: number;
    stateTaxDollars: number;
    otherDollars: number;
    totalDeductionsDollars: number;
  };
  netWagesPaidDollars: number;
}

export interface FormWh347PayrollReport {
  payrollNumber: number;
  weekEndingDate: string;
  contractorName: string;
  contractorAddress: string;
  projectName: string;
  projectLocation: string;
  contractOrProjectNumber: string;
  workers: Wh347WorkerEntry[];
  totalStraightTimeHours: number;
  totalOvertimeHours: number;
  totalGrossWagesDollars: number;
  totalNetWagesDollars: number;
  statementOfCompliance: {
    signatoryName: string;
    signatoryTitle: string;
    fringeBenefitPaymentType: 'paid_to_approved_plans' | 'paid_in_cash_as_wages';
    isCertifiedUnderPenaltyOfPerjury: boolean;
    signedDate: string;
  };
}

/**
 * Creates a U.S. Department of Labor Form WH-347 Certified Payroll Record
 */
export function generateCertifiedPayrollWh347(params: {
  payrollNumber: number;
  weekEndingDate: string;
  contractorName: string;
  contractorAddress: string;
  projectName: string;
  projectLocation: string;
  contractOrProjectNumber: string;
  signatoryName: string;
  signatoryTitle: string;
  workers: Wh347WorkerEntry[];
}): FormWh347PayrollReport {
  const {
    payrollNumber,
    weekEndingDate,
    contractorName,
    contractorAddress,
    projectName,
    projectLocation,
    contractOrProjectNumber,
    signatoryName,
    signatoryTitle,
    workers,
  } = params;

  let totalStraightTimeHours = 0;
  let totalOvertimeHours = 0;
  let totalGrossWagesDollars = 0;
  let totalNetWagesDollars = 0;

  for (const w of workers) {
    totalStraightTimeHours += w.straightTimeHours;
    totalOvertimeHours += w.overtimeHours;
    totalGrossWagesDollars += w.grossEarnedDollars;
    totalNetWagesDollars += w.netWagesPaidDollars;
  }

  return {
    payrollNumber,
    weekEndingDate,
    contractorName,
    contractorAddress,
    projectName,
    projectLocation,
    contractOrProjectNumber,
    workers,
    totalStraightTimeHours,
    totalOvertimeHours,
    totalGrossWagesDollars,
    totalNetWagesDollars,
    statementOfCompliance: {
      signatoryName,
      signatoryTitle,
      fringeBenefitPaymentType: 'paid_in_cash_as_wages',
      isCertifiedUnderPenaltyOfPerjury: true,
      signedDate: new Date().toISOString().split('T')[0],
    },
  };
}

/**
 * Formats Form WH-347 Certified Payroll into a printable executive table layout
 */
export function formatWh347ReportMarkdown(report: FormWh347PayrollReport): string {
  return `# U.S. Department of Labor Form WH-347
**Payroll No**: ${report.payrollNumber} | **For Week Ending**: ${report.weekEndingDate}
**Contractor**: ${report.contractorName} (${report.contractorAddress})
**Project / Contract**: ${report.projectName} — ${report.contractOrProjectNumber} (${report.projectLocation})

---

### 👷 Employee Wage & Hours Summary
| Worker Name & SSN | Classification | ST Hours | OT Hours | Hourly Rate | Fringe | Gross Pay | Deductions | Net Pay |
|---|---|---|---|---|---|---|---|---|
${report.workers
  .map(
    (w) =>
      `| ${w.workerName} (***-**-${w.lastFourSsn}) | ${w.workClassification} | ${w.straightTimeHours}h | ${w.overtimeHours}h | $${w.hourlyRateDollars.toFixed(2)} | $${w.hourlyFringeBenefitsDollars.toFixed(2)} | $${w.grossEarnedDollars.toFixed(2)} | $${w.deductions.totalDeductionsDollars.toFixed(2)} | **$${w.netWagesPaidDollars.toFixed(2)}** |`,
  )
  .join('\n')}

**Totals**: ${report.totalStraightTimeHours} ST Hours | ${report.totalOvertimeHours} OT Hours | **Total Gross**: $${report.totalGrossWagesDollars.toFixed(2)} | **Total Net Paid**: $${report.totalNetWagesDollars.toFixed(2)}

---

### 📝 Statement of Compliance (Davis-Bacon Act)
I, **${report.statementOfCompliance.signatoryName}**, **${report.statementOfCompliance.signatoryTitle}**, do hereby state under penalty of perjury that I pay or supervise the payment of the persons employed by ${report.contractorName} on the ${report.projectName}; that during the payroll period commencing on the respective week ending date, all persons employed on said project have been paid the full weekly wages earned, that no rebates have been or will be made, and that fringe benefits are ${report.statementOfCompliance.fringeBenefitPaymentType === 'paid_in_cash_as_wages' ? 'paid in cash as additional wages' : 'paid to approved fringe benefit plans'}.

*Certified & Signed on: ${report.statementOfCompliance.signedDate}*
`.trim();
}
