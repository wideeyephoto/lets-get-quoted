// "How your settings affect lead quality."
//
// Derived from the switches that are actually set, never decorative. A panel
// that always reads "Strong impact" is a graphic, not a report — and the whole
// reason it sits next to the tick boxes is so a contractor can see a claim
// change when they change a setting.

export type IntakeSignalTone = 'strong' | 'medium' | 'weak';

export type IntakeSignal = {
  key: 'fit' | 'expectations' | 'response';
  icon: string;
  title: string;
  detail: string;
  tone: IntakeSignalTone;
  label: 'Strong impact' | 'Medium impact' | 'Low impact';
};

export type IntakeQualityInput = {
  askTimeline: boolean;
  serviceAreaGate: boolean;
  phoneVerification: boolean;
  /** 0 means "no minimum", which is a real answer rather than an unset one. */
  minJobAmount: number;
  exclusionCount: number;
  /** 'off' means the intake never asks for an email at all. */
  emailField: 'off' | 'optional' | 'required';
  fullyBooked: boolean;
};

export type IntakeQuality = {
  score: 'High' | 'Medium' | 'Low';
  filtersOn: number;
  filtersTotal: number;
  signals: IntakeSignal[];
};

const LABELS: Record<IntakeSignalTone, IntakeSignal['label']> = {
  strong: 'Strong impact',
  medium: 'Medium impact',
  weak: 'Low impact',
};

export function intakeQuality(input: IntakeQualityInput): IntakeQuality {
  const filters = [input.askTimeline, input.serviceAreaGate, input.phoneVerification];
  const filtersOn = filters.filter(Boolean).length;

  // Fit: are the three qualification filters doing anything.
  const fitTone: IntakeSignalTone = filtersOn >= 2 ? 'strong' : filtersOn === 1 ? 'medium' : 'weak';
  const fit: IntakeSignal = {
    key: 'fit',
    icon: '⌕',
    title: filtersOn > 0 ? 'You’re filtering for fit' : 'Nothing is qualifying your leads',
    detail:
      filtersOn > 0
        ? `${filtersOn} of ${filters.length} lead filters are enabled — leads get ranked on timeframe, area and whether the number is real.`
        : 'Every enquiry arrives ranked the same, so a tyre-kicker sits level with a job starting Monday.',
    tone: fitTone,
    label: LABELS[fitTone],
  };

  // Expectations: has the owner said which work they actually want.
  const hasMinimum = input.minJobAmount > 0;
  const hasExclusions = input.exclusionCount > 0;
  const expectationsSet = (hasMinimum ? 1 : 0) + (hasExclusions ? 1 : 0);
  const expectationsTone: IntakeSignalTone = expectationsSet === 2 ? 'strong' : expectationsSet === 1 ? 'medium' : 'weak';
  const expectations: IntakeSignal = {
    key: 'expectations',
    icon: '★',
    title: expectationsSet > 0 ? 'You’re setting clear expectations' : 'You haven’t said which jobs you want',
    detail:
      expectationsSet === 0
        ? 'No minimum job size and nothing excluded, so work you don’t take arrives looking like work you do.'
        : [
            hasMinimum ? 'a minimum job size' : null,
            hasExclusions ? `${input.exclusionCount} excluded job type${input.exclusionCount === 1 ? '' : 's'}` : null,
          ]
            .filter(Boolean)
            .join(' and ')
            .replace(/^./, (character) => character.toUpperCase()) + ' — flagged rather than turned away.',
    tone: expectationsTone,
    label: LABELS[expectationsTone],
  };

  // Response: can you actually reach them, and do you know the number is real.
  const collectsEmail = input.emailField !== 'off';
  const responseScore = (collectsEmail ? 1 : 0) + (input.phoneVerification ? 1 : 0);
  const responseTone: IntakeSignalTone = responseScore === 2 ? 'strong' : responseScore === 1 ? 'medium' : 'weak';
  const response: IntakeSignal = {
    key: 'response',
    icon: '✆',
    title: responseScore > 0 ? 'You’re ready to respond' : 'You only have an unverified phone number',
    detail:
      responseScore === 2
        ? 'You collect an email and verify the phone, so you can reach them two ways and know the number is real.'
        : responseScore === 1
          ? collectsEmail
            ? 'You collect an email as well as a phone. Verifying the number would rule out the junk ones.'
            : 'You verify the phone number. Asking for an email too gives you a second way to reach them.'
          : 'A phone number is always collected, but nothing confirms it belongs to anyone.',
    tone: responseTone,
    label: LABELS[responseTone],
  };

  const signals = [fit, expectations, response];
  const strong = signals.filter((signal) => signal.tone === 'strong').length;
  const weak = signals.filter((signal) => signal.tone === 'weak').length;
  // High needs two genuine strengths AND nothing outright missing — a setup that
  // filters hard but can't reach anybody isn't a high-quality intake.
  const score: IntakeQuality['score'] = strong >= 2 && weak === 0 ? 'High' : weak >= 2 ? 'Low' : 'Medium';

  return { score, filtersOn, filtersTotal: filters.length, signals };
}

/** The badge on each numbered group: what's set, counted rather than asserted. */
export function groupStatus(input: IntakeQualityInput): { asks: string; filters: string; preferences: string } {
  const filters = [input.askTimeline, input.serviceAreaGate, input.phoneVerification].filter(Boolean).length;
  const preferences = [input.minJobAmount > 0, input.exclusionCount > 0, input.fullyBooked].filter(Boolean).length;
  return {
    asks: input.emailField === 'off' ? 'Phone only' : 'Essentials complete',
    filters: `${filters} of 3 filters enabled`,
    preferences: preferences === 0 ? 'Optional' : `${preferences} of 3 set`,
  };
}
