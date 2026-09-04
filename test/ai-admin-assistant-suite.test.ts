import { describe, it, expect } from 'vitest';

// 1. Text-to-SQL
import { executeSafeNaturalLanguageQuery, isSafeReadOnlySqlQuery } from '@/lib/ai-operator/sql-interpreter';

// 2. Churn Risk Detector
import { scanContractorsForChurnRisk } from '@/lib/ai-operator/churn-detector';

// 3. Health Scorecard
import { calculateContractorHealthScore } from '@/lib/ai-operator/health-scorecard';

// 4. Regional Pricing Intelligence
import { getRegionalPricingIntelligence } from '@/lib/ai-operator/pricing-intelligence';

// 5. Fraud Scanner
import { scanStripeConnectAccountsForFraud } from '@/lib/ai-operator/fraud-scanner';

// 6. Carrier Compliance Auditor
import { auditSmsCarrierCompliance } from '@/lib/ai-operator/carrier-compliance';

// 7. 1099 Tax Tracker
import { evaluate1099TaxCompliance } from '@/lib/ai-operator/tax-1099-tracker';

// 8. Staff Security Audit
import { auditStaffAdminActions } from '@/lib/ai-operator/staff-security-audit';

// 9. Database Index Advisor
import { getPostgresIndexRecommendations } from '@/lib/ai-operator/index-advisor';

// 10. DLQ Playbooks
import { triageDeadLetterQueue } from '@/lib/ai-operator/dlq-playbooks';

// 11. Latency Triager
import { triageSystemLatencyAndErrors } from '@/lib/ai-operator/latency-triager';

// 12. Circuit Breakers
import { checkThirdPartyCircuitBreakers } from '@/lib/ai-operator/circuit-breaker';

// 13. Support Inbox Responder
import { generateAutoSupportReply } from '@/lib/ai-operator/support-inbox-responder';

// 15. Courtesy Credit Policy Advisor
import { calculateCourtesyCreditRecommendation } from '@/lib/ai-operator/refund-policy-advisor';

// 16. VIP Concierge
import { evaluateVipOnboardingCandidate } from '@/lib/ai-operator/vip-concierge';

// 17. Voice Action Controller
import { parseVoiceAdminCommand } from '@/lib/ai-operator/voice-action-controller';

// 18. Cockpit Widget Manager
import { getPinnedCockpitWidgets } from '@/lib/ai-operator/widget-manager';

// 19. Weekly Strategy Report
import { generateWeeklyStrategyReport } from '@/lib/ai-operator/weekly-strategy-report';

// 20. Funnel Experimenter
import { getPrioritizedGrowthExperiments } from '@/lib/ai-operator/funnel-experimenter';

describe('20 AI Admin Assistant Improvements Suite', () => {
  // 1. Text-to-SQL
  it('1. executes safe natural language SQL queries and blocks mutation keywords', async () => {
    expect(isSafeReadOnlySqlQuery('SELECT * FROM accounts;')).toBe(true);
    expect(isSafeReadOnlySqlQuery('DROP TABLE accounts;')).toBe(false);
    expect(isSafeReadOnlySqlQuery('UPDATE accounts SET plan = "free";')).toBe(false);

    const res = await executeSafeNaturalLanguageQuery('Show me quote activity');
    expect(res.isReadOnly).toBe(true);
    expect(res.rows.length).toBeGreaterThan(0);
    expect(res.columns.length).toBeGreaterThan(0);
  });

  // 2. Churn Risk Detector
  it('2. detects contractor churn risks and velocity drop percentages', async () => {
    const scan = await scanContractorsForChurnRisk();
    expect(scan.totalScanned).toBeGreaterThan(0);
    expect(scan.accounts.length).toBeGreaterThan(0);
    expect(scan.accounts[0].riskLevel).toBe('critical');
    expect(scan.accounts[0].velocityDropPercent).toBe(100);
  });

  // 3. Health Scorecard
  it('3. calculates 0-100 contractor health score and classifies champion accounts', () => {
    const scorecard = calculateContractorHealthScore({
      accountId: 'acc-1',
      businessName: 'Apex Roofing',
      quotesSentLast30Days: 12,
      quotesApprovedLast30Days: 7,
      averageSpeedToLeadSeconds: 45,
      grossPaymentsCollectedDollars: 15000,
    });
    expect(scorecard.healthScore).toBeGreaterThanOrEqual(80);
    expect(scorecard.tier).toBe('champion');
    expect(scorecard.keyStrengths.length).toBeGreaterThan(0);
  });

  // 4. Regional Pricing Intelligence
  it('4. provides regional price benchmarks by trade and market', () => {
    const roofing = getRegionalPricingIntelligence('roofing', 'TX');
    expect(roofing.trade).toBe('Roofing');
    expect(roofing.averagePricePerUnit).toBe(425);
    expect(roofing.averageQuoteTotalDollars).toBeGreaterThan(5000);
  });

  // 5. Stripe Connect Fraud Scanner
  it('5. scans Stripe Connect accounts for fraud anomalies and risk scores', async () => {
    const scan = await scanStripeConnectAccountsForFraud();
    expect(scan.scannedAccountsCount).toBeGreaterThan(0);
    expect(scan.signals.length).toBeGreaterThan(0);
    expect(scan.signals[0].recommendedAction).toBe('clear');
  });

  // 6. Carrier Compliance Auditor
  it('6. audits SMS copy for 10DLC compliance, SHAFT keywords, and STOP opt-out', () => {
    const compliant = auditSmsCarrierCompliance('Hi, this is Austin Roofing. Reply STOP to opt out.', 'Austin Roofing');
    expect(compliant.isCompliant).toBe(true);
    expect(compliant.hasRequiredOptOut).toBe(true);

    const nonCompliant = auditSmsCarrierCompliance('Get fast cash cannabis loan now!');
    expect(nonCompliant.isCompliant).toBe(false);
    expect(nonCompliant.violations.length).toBeGreaterThan(0);
    expect(nonCompliant.safeModifiedCopy).toContain('STOP');
  });

  // 7. 1099 Tax Tracker
  it('7. evaluates 1099-NEC tax compliance and flags pending W-9s over $600', () => {
    const pending = evaluate1099TaxCompliance({
      accountId: 'acc-1',
      businessName: 'Apex Framing',
      grossPaymentsCollectedDollars: 1200,
      hasEncryptedTaxId: false,
    });
    expect(pending.exceeds1099Threshold).toBe(true);
    expect(pending.taxVaultStatus).toBe('pending_w9');

    const verified = evaluate1099TaxCompliance({
      accountId: 'acc-1',
      businessName: 'Apex Framing',
      grossPaymentsCollectedDollars: 1200,
      hasEncryptedTaxId: true,
    });
    expect(verified.taxVaultStatus).toBe('verified_encrypted');
  });

  // 8. Staff Security Audit
  it('8. audits staff admin actions and verifies clean operational logs', async () => {
    const audit = await auditStaffAdminActions();
    expect(audit.isAuditClean).toBe(true);
    expect(audit.scannedEventsCount).toBeGreaterThan(0);
  });

  // 9. Database Index Advisor
  it('9. provides Postgres index recommendations with SQL snippets', () => {
    const advisor = getPostgresIndexRecommendations();
    expect(advisor.totalRecommendations).toBeGreaterThan(0);
    expect(advisor.recommendations[0].suggestedSql).toContain('CREATE INDEX');
  });

  // 10. DLQ Playbooks
  it('10. triages dead-letter queues and flags auto-redrive ready tasks', async () => {
    const report = await triageDeadLetterQueue();
    expect(report.scannedJobsCount).toBeGreaterThan(0);
    expect(report.jobs[0].canAutoRedrive).toBe(true);
  });

  // 11. Latency Triager
  it('11. triages system route latencies against p95 performance SLAs', () => {
    const triage = triageSystemLatencyAndErrors();
    expect(triage.systemStatus).toBe('healthy');
    expect(triage.overallP95Ms).toBeLessThan(500);
    expect(triage.slowestRoutes.length).toBeGreaterThan(0);
  });

  // 12. Circuit Breakers
  it('12. checks third-party API circuit breakers across Stripe, Twilio, and Resend', () => {
    const cb = checkThirdPartyCircuitBreakers();
    expect(cb.allOperational).toBe(true);
    expect(cb.services.length).toBe(5);
    expect(cb.bannerNotice).toBeNull();
  });

  // 13. Support Inbox Responder
  it('13. generates manual-referenced support reply drafts for payout & domain tickets', () => {
    const draft = generateAutoSupportReply({
      ticketId: 't-101',
      subject: 'When do Stripe payouts deposit to my bank?',
      body: 'I collected my first customer quote payment yesterday.',
    });
    expect(draft.category).toBe('stripe_payouts');
    expect(draft.confidenceScore).toBeGreaterThan(0.9);
    expect(draft.draftReply).toContain('rolling 2-business-day');
  });

  // 15. Courtesy Credit Policy Advisor
  it('15. calculates policy-compliant courtesy wallet credits and duplicate refunds', () => {
    const credit = calculateCourtesyCreditRecommendation({
      accountId: 'acc-1',
      ticketId: 't-202',
      reportedIssue: 'Carrier dropped speed-to-lead SMS due to invalid homeowner number',
    });
    expect(credit.recommendedAction).toBe('wallet_credit');
    expect(credit.recommendedAmountDollars).toBe(25);
    expect(credit.hitlActionPayload.amountCents).toBe(2500);
  });

  // 16. VIP Concierge
  it('16. identifies multi-crew contractor signups for VIP founder outreach', () => {
    const vip = evaluateVipOnboardingCandidate({
      accountId: 'acc-88',
      businessName: 'Texas Mega Roofing LLC',
      trade: 'Roofing',
      crewMembersCount: 5,
      pastClientImportsCount: 25,
    });
    expect(vip.potentialAnnualLtvDollars).toBeGreaterThan(2000);
    expect(vip.founderActionItem).toContain('VIP');
  });

  // 17. Voice Action Controller
  it('17. parses spoken founder voice commands into structured operational actions', () => {
    const action = parseVoiceAdminCommand('Replay all failed webhooks immediately');
    expect(action.detectedIntent).toBe('replay_webhooks');
    expect(action.requiresHitlConfirmation).toBe(false);

    const creditAction = parseVoiceAdminCommand('Issue a $50 credit for ticket 402');
    expect(creditAction.detectedIntent).toBe('issue_credit');
    expect(creditAction.amountDollars).toBe(50);
    expect(creditAction.requiresHitlConfirmation).toBe(true);
  });

  // 18. Cockpit Widget Manager
  it('18. returns default and customized pinned KPI widgets for the Cockpit', () => {
    const widgets = getPinnedCockpitWidgets();
    expect(widgets.length).toBe(6);
    expect(widgets.some((w) => w.id === 'mrr_tracker')).toBe(true);
  });

  // 19. Weekly Strategy Report
  it('19. generates executive Monday morning founder strategy reports with markdown', () => {
    const report = generateWeeklyStrategyReport({ endingMrr: 168, newSignups: 4, activated: 7 });
    expect(report.mrrSnapshot.endingMrr).toBe(168);
    expect(report.contractorFunnel.activationRatePercent).toBeGreaterThan(0);
    expect(report.markdownReport).toContain('# 📊 Executive Monday Strategy');
  });

  // 20. Funnel Experimenter
  it('20. proposes high-conviction growth experiments across signup and quote acceptance', () => {
    const exp = getPrioritizedGrowthExperiments();
    expect(exp.totalExperiments).toBe(3);
    expect(exp.experiments[0].confidenceScore).toBeGreaterThan(80);
    expect(exp.experiments[0].expectedMetricLift).toBeDefined();
  });
});
