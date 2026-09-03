// Weather risk for scheduled work.
//
// Pure half: given a forecast and what trade the work is, decide whether a day
// is risky and say why in words a contractor would use.
//
// The design constraint that shapes everything here: this NEVER moves a job. It
// flags, it suggests, and a person decides. A system that reschedules on a
// forecast will eventually move a job on a day that turned out fine, and the
// customer who took the morning off will never trust a date from you again.

export type RiskLevel = 'clear' | 'watch' | 'risky' | 'unworkable';

export const RISK_ORDER: Record<RiskLevel, number> = { clear: 0, watch: 1, risky: 2, unworkable: 3 };

export type Forecast = {
  /** YYYY-MM-DD in the job's local zone. */
  day: string;
  /** Fahrenheit — NWS returns imperial for US locations. */
  highF: number | null;
  lowF: number | null;
  /** 0..100. Null when the forecast doesn't carry one. */
  precipChance: number | null;
  /** Miles per hour, the higher end of any range NWS gives. */
  windMph: number | null;
  /** "Chance of showers then partly sunny" — used only for wording. */
  summary: string;
};

/**
 * What weather each kind of work actually cares about.
 *
 * These aren't guesses about comfort — they're the thresholds where the WORK
 * fails: paint that won't cure, sealant that won't bond, a roof you can't stand
 * on, concrete that freezes before it sets.
 */
export type Sensitivity = {
  key: string;
  label: string;
  /** Above this chance of rain, the day is in question. */
  precipWatch: number;
  precipRisky: number;
  /** Wind that stops the work, mph. Null = wind doesn't matter. */
  windRisky: number | null;
  /** Below this, materials misbehave. Null = cold doesn't matter. */
  minTempF: number | null;
  /** Above this, materials misbehave (asphalt, sealant, working on a roof). */
  maxTempF: number | null;
  /** Said to the customer when the day is called off. */
  reasonNote: string;
};

export const SENSITIVITIES: Sensitivity[] = [
  {
    key: 'roofing',
    label: 'Roofing',
    precipWatch: 30,
    precipRisky: 50,
    windRisky: 25,
    minTempF: 40,
    maxTempF: 95,
    reasonNote: 'Shingles need a dry deck and safe footing, and they won’t seal properly in the cold.',
  },
  {
    key: 'painting',
    label: 'Exterior painting',
    precipWatch: 20,
    precipRisky: 40,
    windRisky: 20,
    minTempF: 50,
    maxTempF: 95,
    reasonNote: 'Paint won’t cure below 50°F or in the wet, and wind carries overspray onto everything nearby.',
  },
  {
    key: 'concrete',
    label: 'Concrete & masonry',
    precipWatch: 30,
    precipRisky: 50,
    windRisky: null,
    minTempF: 40,
    maxTempF: 90,
    reasonNote: 'Concrete that freezes before it sets never reaches full strength, and rain ruins the surface.',
  },
  {
    key: 'exterior',
    label: 'General exterior work',
    precipWatch: 40,
    precipRisky: 60,
    windRisky: 30,
    minTempF: 25,
    maxTempF: null,
    reasonNote: 'It’s outside work, and the forecast isn’t on our side.',
  },
  {
    key: 'landscaping',
    label: 'Landscaping',
    precipWatch: 50,
    precipRisky: 70,
    windRisky: null,
    minTempF: 32,
    maxTempF: null,
    reasonNote: 'Saturated ground means ruts in a lawn we’d then have to repair.',
  },
];

const BY_KEY = new Map(SENSITIVITIES.map((s) => [s.key, s]));

/** Falls back to general exterior work — the least opinionated of the profiles. */
export function sensitivityFor(key: string | null | undefined): Sensitivity {
  return BY_KEY.get((key ?? '').toLowerCase()) ?? BY_KEY.get('exterior')!;
}

/** Best guess at which profile a trade name belongs to. Advisory only. */
export function sensitivityForTrade(trade: string | null | undefined): Sensitivity {
  const text = (trade ?? '').toLowerCase();
  if (/roof/.test(text)) return sensitivityFor('roofing');
  if (/paint|stain|coat/.test(text)) return sensitivityFor('painting');
  if (/concrete|mason|paver|patio|driveway/.test(text)) return sensitivityFor('concrete');
  if (/landscap|lawn|garden|tree/.test(text)) return sensitivityFor('landscaping');
  return sensitivityFor('exterior');
}

export type Assessment = {
  day: string;
  level: RiskLevel;
  /** Short phrases, worst first. What the contractor reads. */
  reasons: string[];
  summary: string;
};

function raise(current: RiskLevel, next: RiskLevel): RiskLevel {
  return RISK_ORDER[next] > RISK_ORDER[current] ? next : current;
}

/**
 * How risky one day looks for one kind of work.
 *
 * A missing figure never raises the risk. NWS omits a precipitation chance on
 * plenty of clear days, and treating "unknown" as "bad" would flag half a
 * calendar and get the whole feature switched off in a week.
 */
export function assessDay(forecast: Forecast, sensitivity: Sensitivity): Assessment {
  let level: RiskLevel = 'clear';
  const reasons: string[] = [];

  const precip = forecast.precipChance;
  if (precip !== null) {
    if (precip >= 80) {
      level = raise(level, 'unworkable');
      reasons.push(`${precip}% chance of rain`);
    } else if (precip >= sensitivity.precipRisky) {
      level = raise(level, 'risky');
      reasons.push(`${precip}% chance of rain`);
    } else if (precip >= sensitivity.precipWatch) {
      level = raise(level, 'watch');
      reasons.push(`${precip}% chance of rain`);
    }
  }

  if (sensitivity.windRisky !== null && forecast.windMph !== null) {
    if (forecast.windMph >= sensitivity.windRisky + 10) {
      level = raise(level, 'unworkable');
      reasons.push(`${forecast.windMph} mph wind`);
    } else if (forecast.windMph >= sensitivity.windRisky) {
      level = raise(level, 'risky');
      reasons.push(`${forecast.windMph} mph wind`);
    }
  }

  // Cold is judged on the LOW and heat on the HIGH: a day that dips below
  // freezing overnight ruins a pour even if the afternoon is pleasant.
  if (sensitivity.minTempF !== null && forecast.lowF !== null && forecast.lowF < sensitivity.minTempF) {
    level = raise(level, forecast.lowF < sensitivity.minTempF - 10 ? 'unworkable' : 'risky');
    reasons.push(`down to ${forecast.lowF}°F`);
  }
  if (sensitivity.maxTempF !== null && forecast.highF !== null && forecast.highF > sensitivity.maxTempF) {
    level = raise(level, 'watch');
    reasons.push(`up to ${forecast.highF}°F`);
  }

  return { day: forecast.day, level, reasons, summary: forecast.summary };
}

export function assessDays(forecasts: Forecast[], sensitivity: Sensitivity): Assessment[] {
  return forecasts.map((forecast) => assessDay(forecast, sensitivity));
}

export const RISK_LABEL: Record<RiskLevel, string> = {
  clear: 'Looks fine',
  watch: 'Keep an eye on it',
  risky: 'Risky',
  unworkable: "Don't plan on it",
};

/** Days worth telling somebody about. 'watch' is deliberately not one of them. */
export function daysWorthFlagging(assessments: Assessment[]): Assessment[] {
  return assessments.filter((a) => RISK_ORDER[a.level] >= RISK_ORDER.risky);
}

/**
 * Dates to offer instead, best first.
 *
 * Only ever days the forecast actually reaches — no inventing a date beyond the
 * horizon, which would be a promise made from nothing. Nearest clear day wins,
 * because a customer who has already taken time off wants the smallest possible
 * change.
 */
export function suggestReplacements(
  assessments: Assessment[],
  afterDay: string,
  options?: { limit?: number },
): Assessment[] {
  return assessments
    .filter((a) => a.day > afterDay && a.level === 'clear')
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(0, options?.limit ?? 3);
}

/**
 * The text a contractor sends. Drafted, never sent on its own.
 *
 * Says what's wrong, why it matters for THIS work, and what happens next. It
 * does not apologise for the weather — a contractor who moves a job because rain
 * would wreck it is doing their job, and a grovelling text makes it sound like a
 * failure.
 */
export function draftCustomerMessage(input: {
  businessName: string;
  customerName: string | null;
  day: string;
  assessment: Assessment;
  sensitivity: Sensitivity | { label?: string; reasonNote: string };
  alternatives: Assessment[];
  targetAlternativeDay?: string | null;
}): string {
  const first = (input.customerName ?? '').trim().split(/\s+/)[0];
  const greeting = first ? `Hi ${first}, ` : '';
  const when = new Date(`${input.day}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  const why = input.assessment.reasons.length > 0 ? ` (${input.assessment.reasons.join(', ')})` : '';
  
  let options = ' We’ll call you to find another day.';
  if (input.targetAlternativeDay) {
    const targetWhen = new Date(`${input.targetAlternativeDay}T12:00:00Z`).toLocaleDateString('en-US', {
      timeZone: 'UTC',
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
    options = ` We can move your visit to ${targetWhen} instead — does that work for you? Reply YES to confirm.`;
  } else if (input.alternatives.length > 0) {
    options = ` We could do ${input.alternatives
      .map((a) => new Date(`${a.day}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long' }))
      .join(' or ')} instead — which suits you?`;
  }

  return `${greeting}${input.businessName} here. The forecast for ${when}${why} isn’t going to work for your job. ${input.sensitivity.reasonNote}${options}`;
}
