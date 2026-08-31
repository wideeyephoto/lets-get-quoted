import { matchTradeFamilies, type TradeFamily } from '@/lib/property-intel/profile';
import { TRADE_INTAKE_PRESETS, type TradeIntakePreset } from '@/lib/trade-intake-presets';

export type IntakeOutcome =
  | 'book_onsite_visit'
  | 'request_photo_scan'
  | 'instant_quote'
  | 'decline_out_of_scope';

export type IntakeFieldGoal = {
  key: string;
  label: string;
  isMandatory: boolean;
  extractedValue: string | null;
  guidanceForVoiceAgent: string;
};

export type IntakeSessionGoals = {
  tradeFamily: TradeFamily;
  tradeName: string;
  recommendedOutcome: IntakeOutcome;
  mandatoryInformationGoals: IntakeFieldGoal[];
  photoGoalPrompt: string | null;
  highValueLeadThreshold: number;
  minJobAmount: number;
  complexityTriggers: string[];
  exclusions: string[];
  completionScorePct: number; // 0 - 100
  isReadyForBooking: boolean;
  missingMandatoryFields: string[];
  aiPromptDirectives: string[];
};

/**
 * Recommends dynamic intake and qualification goals for incoming voice calls and chat leads.
 */
export function recommendIntakeGoals(params: {
  trade?: string | null;
  initialTranscriptOrNotes?: string | null;
  callerEstimatedBudget?: number | null;
}): IntakeSessionGoals {
  const { trade, initialTranscriptOrNotes = '', callerEstimatedBudget } = params;

  const matchedFamilies = matchTradeFamilies(trade);
  const tradeFamily = matchedFamilies[0] || 'general';
  const preset: TradeIntakePreset = TRADE_INTAKE_PRESETS[tradeFamily] || TRADE_INTAKE_PRESETS.general;

  const transcript = (initialTranscriptOrNotes || '').toLowerCase();

  // 1. Mandatory Information Goals based on Trade Preset
  const mandatoryInformationGoals: IntakeFieldGoal[] = preset.mandatoryQuestions.map((q, idx) => {
    // Basic extraction heuristic for known field patterns
    let extractedValue: string | null = null;
    if (q.toLowerCase().includes('stories') && (transcript.includes('1 story') || transcript.includes('one story') || transcript.includes('2 story') || transcript.includes('two story'))) {
      extractedValue = transcript.includes('2') || transcript.includes('two') ? '2 stories' : '1 story';
    } else if (q.toLowerCase().includes('leak') && (transcript.includes('leak') || transcript.includes('dripping') || transcript.includes('water stain'))) {
      extractedValue = 'Active leak reported';
    }

    return {
      key: `field_${idx}`,
      label: q,
      isMandatory: true,
      extractedValue,
      guidanceForVoiceAgent: `Ensure caller explicitly answers: "${q}"`,
    };
  });

  // 2. Check for exclusions (out of scope)
  const matchingExclusions = preset.exclusions.filter((exc) =>
    transcript.includes(exc.toLowerCase()),
  );

  // 3. Complexity & High Value Triggers
  const matchingComplexity = preset.siteVisitTriggers.filter((trigger) => {
    const words = trigger.toLowerCase().split(/\s+/).slice(0, 3).join(' ');
    return transcript.includes(words);
  });

  // 4. Determine Recommended Outcome
  let recommendedOutcome: IntakeOutcome = 'request_photo_scan';
  if (matchingExclusions.length > 0) {
    recommendedOutcome = 'decline_out_of_scope';
  } else if (
    matchingComplexity.length > 0 ||
    (callerEstimatedBudget && callerEstimatedBudget >= preset.highValueLeadAmount) ||
    transcript.includes('remodel') ||
    transcript.includes('full replacement') ||
    transcript.includes('leak') ||
    transcript.includes('urgent') ||
    transcript.includes('emergency') ||
    transcript.includes('diagnostic')
  ) {
    recommendedOutcome = 'book_onsite_visit';
  }

  // 5. Completion Scoring
  const completedFields = mandatoryInformationGoals.filter((g) => g.extractedValue !== null);
  const completionScorePct = mandatoryInformationGoals.length > 0
    ? Math.round((completedFields.length / mandatoryInformationGoals.length) * 100)
    : 100;

  const missingMandatoryFields = mandatoryInformationGoals
    .filter((g) => g.extractedValue === null)
    .map((g) => g.label);

  const isReadyForBooking = recommendedOutcome !== 'decline_out_of_scope' && missingMandatoryFields.length === 0;

  // 6. Directives for AI Voice/Chat Agents
  const aiPromptDirectives: string[] = [
    `Trade Goal: Qualify inquiry for ${preset.name}.`,
    `Minimum Job Floor: $${preset.minJobAmount}. Do not accept projects below this amount.`,
    `Target Outcome: ${recommendedOutcome.replace(/_/g, ' ').toUpperCase()}.`,
  ];

  if (preset.photoPrompt) {
    aiPromptDirectives.push(`Photo Acquisition: Prompt caller: "${preset.photoPrompt}"`);
  }

  return {
    tradeFamily,
    tradeName: preset.name,
    recommendedOutcome,
    mandatoryInformationGoals,
    photoGoalPrompt: preset.photoPrompt,
    highValueLeadThreshold: preset.highValueLeadAmount,
    minJobAmount: preset.minJobAmount,
    complexityTriggers: preset.siteVisitTriggers,
    exclusions: preset.exclusions,
    completionScorePct,
    isReadyForBooking,
    missingMandatoryFields,
    aiPromptDirectives,
  };
}

/**
 * Updates intake session goals as caller provides additional answers in real-time.
 */
export function updateIntakeGoalProgress(
  currentGoals: IntakeSessionGoals,
  capturedAnswers: Record<string, string>,
): IntakeSessionGoals {
  const updatedMandatory = currentGoals.mandatoryInformationGoals.map((goal) => {
    const val = capturedAnswers[goal.key] || goal.extractedValue;
    return {
      ...goal,
      extractedValue: val || null,
    };
  });

  const missing = updatedMandatory
    .filter((g) => !g.extractedValue || g.extractedValue.trim().length === 0)
    .map((g) => g.label);

  const completedCount = updatedMandatory.length - missing.length;
  const score = updatedMandatory.length > 0
    ? Math.round((completedCount / updatedMandatory.length) * 100)
    : 100;

  return {
    ...currentGoals,
    mandatoryInformationGoals: updatedMandatory,
    missingMandatoryFields: missing,
    completionScorePct: score,
    isReadyForBooking: currentGoals.recommendedOutcome !== 'decline_out_of_scope' && missing.length === 0,
  };
}
