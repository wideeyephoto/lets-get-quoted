import { describe, expect, it } from 'vitest';
import { recommendJobProfitabilityGoals, evaluateJobPacing } from '@/lib/job-goals-ai';
import { recommendCampaignGoals, evaluateCampaignPacing } from '@/lib/campaign-goals-ai';
import { recommendIntakeGoals, updateIntakeGoalProgress } from '@/lib/intake-goals-ai';
import { recommendBusinessRevenueGoals, getTradeSeasonalityMultiplier } from '@/lib/revenue-goals-ai';

describe('AI Goal Recommendations Suite', () => {
  describe('1. Quoting & Job Profitability Goals (job-goals-ai)', () => {
    it('recommends trade-specific gross margins and labor targets for roofing', () => {
      const goals = recommendJobProfitabilityGoals({
        trade: 'roofing',
        scope: 'Full shingle tear-off and replacement',
        estimatedRevenue: 15000,
        estimatedHours: 36,
        yearBuilt: 1965,
      });

      expect(goals.tradeFamily).toBe('roofing');
      expect(goals.targetMarginPct).toBe(38);
      expect(goals.minAcceptableMarginPct).toBe(28);
      expect(goals.targetLaborHours).toBe(36);
      expect(goals.recommendedCrewSize).toBe(3); // > 24 hours => 3 person crew
      expect(goals.contingencyBufferPct).toBe(8); // pre-1978 => 8% buffer
      expect(goals.targetProfitAmount).toBe(5700); // 38% of 15000
      expect(goals.milestones.length).toBe(3);
    });

    it('adds emergency margin premium for emergency plumbing calls', () => {
      const goals = recommendJobProfitabilityGoals({
        trade: 'plumbing',
        scope: 'Emergency burst pipe repair in basement',
        estimatedRevenue: 1200,
        estimatedHours: 4,
      });

      expect(goals.tradeFamily).toBe('plumbing');
      expect(goals.targetMarginPct).toBe(57); // 52% base + 5% emergency premium
      expect(goals.recommendedCrewSize).toBe(1);
    });

    it('evaluates real-time job pacing and triggers warning if labor consumption drifts', () => {
      const goals = recommendJobProfitabilityGoals({
        trade: 'electrical',
        estimatedRevenue: 4000,
        estimatedHours: 20,
      });

      const pacingHealthy = evaluateJobPacing({
        loggedLaborHours: 8,
        totalCostsSoFar: 1000,
        quotedRevenue: 4000,
        targetGoals: goals,
        currentProgressPct: 40,
      });
      expect(pacingHealthy.isLaborPacingHealthy).toBe(true);
      expect(pacingHealthy.severity).toBe('healthy');

      // Labor spent 80% (16 hrs) but progress only 40%
      const pacingWarning = evaluateJobPacing({
        loggedLaborHours: 16,
        totalCostsSoFar: 2500,
        quotedRevenue: 4000,
        targetGoals: goals,
        currentProgressPct: 40,
      });
      expect(pacingWarning.isLaborPacingHealthy).toBe(false);
      expect(pacingWarning.severity).toBe('warning');
      expect(pacingWarning.alertMessage).toContain('Labor usage is at 80%');
    });
  });

  describe('2. Ad Campaign Goals (campaign-goals-ai)', () => {
    it('calibrates CPL and job targets based on trade and team capacity', () => {
      const openSchedule = recommendCampaignGoals({
        trade: 'hvac',
        activeCrews: 2,
        availableDaysNextFortnight: 10, // lots of open days
      });

      expect(openSchedule.tradeFamily).toBe('hvac');
      expect(openSchedule.targetCostPerLead).toBe(65);
      expect(openSchedule.pacingAction).toBe('scale');
      expect(openSchedule.targetMonthlyBookedJobs).toBeGreaterThan(50); // 25 * 2 crews * 1.3 scale factor

      const fullSchedule = recommendCampaignGoals({
        trade: 'hvac',
        activeCrews: 2,
        availableDaysNextFortnight: 1, // nearly full schedule
      });
      expect(fullSchedule.pacingAction).toBe('throttle_for_capacity');
    });

    it('evaluates campaign pacing and flags high CPL thresholds', () => {
      const goals = recommendCampaignGoals({ trade: 'roofing' });

      const evaluation = evaluateCampaignPacing({
        actualSpend: 1600,
        leadsGenerated: 10, // $160 CPL > max $150
        bookedJobRevenue: 18000,
        goals,
      });

      expect(evaluation.actualCpl).toBe(160);
      expect(evaluation.status).toBe('warning');
      expect(evaluation.action).toBe('throttle_for_capacity');
    });
  });

  describe('3. AI Voice & Intake Qualification Goals (intake-goals-ai)', () => {
    it('generates mandatory qualification checklist for roofing leads', () => {
      const intake = recommendIntakeGoals({
        trade: 'roofing',
        initialTranscriptOrNotes: 'Caller has a 2 story house with roof leak dripping into ceiling',
      });

      expect(intake.tradeFamily).toBe('roofing');
      expect(intake.tradeName).toContain('Roofing');
      expect(intake.mandatoryInformationGoals.length).toBeGreaterThanOrEqual(2);
      expect(intake.photoGoalPrompt).toContain('Photos of the roof area');
      expect(intake.recommendedOutcome).toBe('book_onsite_visit');
    });

    it('detects trade exclusions and recommends declining out-of-scope work', () => {
      const intake = recommendIntakeGoals({
        trade: 'roofing',
        initialTranscriptOrNotes: 'Caller asking for repair on a mobile homes roof',
      });

      expect(intake.recommendedOutcome).toBe('decline_out_of_scope');
      expect(intake.isReadyForBooking).toBe(false);
    });

    it('updates intake progress as mandatory questions are answered', () => {
      const initial = recommendIntakeGoals({ trade: 'siding' });
      expect(initial.completionScorePct).toBe(0);

      const updated = updateIntakeGoalProgress(initial, {
        field_0: 'Hardie board fiber cement',
        field_1: 'Whole house replacement',
      });

      expect(updated.completionScorePct).toBe(100);
      expect(updated.missingMandatoryFields.length).toBe(0);
      expect(updated.isReadyForBooking).toBe(true);
    });
  });

  describe('4. Business Revenue Pacing Goals (revenue-goals-ai)', () => {
    it('calculates adaptive monthly targets with seasonal factors', () => {
      // Summer index = 6 (July)
      const summerGoals = recommendBusinessRevenueGoals({
        trade: 'roofing',
        activeCrewCount: 2,
        currentGrossRevenue: 45000,
        dayOfMonth: 15,
        daysInMonth: 30,
        currentMonthIndex: 6,
      });

      expect(summerGoals.tradeFamily).toBe('roofing');
      expect(summerGoals.seasonalityMultiplier).toBe(1.3);
      expect(summerGoals.suggestedMonthlyRevenue).toBe(98800); // 38,000 * 2 crews * 1.3
      expect(summerGoals.pacingStatus).toBe('on_track');
    });

    it('detects ahead of pace and gives pricing growth tip if win rate is unusually high', () => {
      const goals = recommendBusinessRevenueGoals({
        trade: 'plumbing',
        activeCrewCount: 1,
        currentGrossRevenue: 25000,
        dayOfMonth: 15,
        daysInMonth: 30,
        actualWinRatePct: 80, // Very high win rate
      });

      expect(goals.pacingStatus).toBe('ahead');
      expect(goals.aiGrowthTip).toContain('increase quote margins');
    });

    it('correctly applies trade seasonality multipliers', () => {
      const summerRoofing = getTradeSeasonalityMultiplier('roofing', 6);
      const winterRoofing = getTradeSeasonalityMultiplier('roofing', 0);
      expect(summerRoofing).toBe(1.3);
      expect(winterRoofing).toBe(0.75);

      const summerHvac = getTradeSeasonalityMultiplier('hvac', 6);
      expect(summerHvac).toBe(1.25);
    });
  });
});
