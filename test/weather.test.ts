import { describe, it, expect } from 'vitest';
import {
  assessDay,
  assessDays,
  daysWorthFlagging,
  draftCustomerMessage,
  sensitivityFor,
  sensitivityForTrade,
  suggestReplacements,
  type Forecast,
} from '@/lib/weather';
import { parseWindMph, periodsToForecasts, forecastCacheKey } from '@/lib/weather-nws';

function day(overrides: Partial<Forecast> = {}): Forecast {
  return { day: '2026-08-05', highF: 75, lowF: 60, precipChance: 10, windMph: 8, summary: 'Sunny', ...overrides };
}

describe('sensitivityForTrade', () => {
  it('recognises the trades whose work the weather actually stops', () => {
    expect(sensitivityForTrade('Roofing').key).toBe('roofing');
    expect(sensitivityForTrade('Exterior Painting').key).toBe('painting');
    expect(sensitivityForTrade('Concrete & Patios').key).toBe('concrete');
    expect(sensitivityForTrade('Landscaping').key).toBe('landscaping');
  });

  it('falls back to general exterior work rather than guessing wildly', () => {
    expect(sensitivityForTrade('Plumbing').key).toBe('exterior');
    expect(sensitivityForTrade(null).key).toBe('exterior');
  });
});

describe('assessDay', () => {
  const roofing = sensitivityFor('roofing');

  it('says nothing about a good day', () => {
    const result = assessDay(day(), roofing);
    expect(result.level).toBe('clear');
    expect(result.reasons).toEqual([]);
  });

  it('flags rain at the threshold for the trade', () => {
    expect(assessDay(day({ precipChance: 35 }), roofing).level).toBe('watch');
    expect(assessDay(day({ precipChance: 55 }), roofing).level).toBe('risky');
    expect(assessDay(day({ precipChance: 85 }), roofing).level).toBe('unworkable');
  });

  it('holds painters to a tighter standard than landscapers', () => {
    // 45% rain stops paint curing and barely troubles a mowing crew.
    expect(assessDay(day({ precipChance: 45 }), sensitivityFor('painting')).level).toBe('risky');
    expect(assessDay(day({ precipChance: 45 }), sensitivityFor('landscaping')).level).toBe('clear');
  });

  it('judges cold on the LOW, not the high', () => {
    // A day that dips below freezing overnight ruins a pour even if the
    // afternoon is pleasant.
    const result = assessDay(day({ highF: 68, lowF: 28 }), sensitivityFor('concrete'));
    expect(result.level).toBe('unworkable');
    expect(result.reasons.join(' ')).toContain('28°F');
  });

  it('flags wind for trades that work at height and ignores it for those that do not', () => {
    expect(assessDay(day({ windMph: 28 }), roofing).level).toBe('risky');
    expect(assessDay(day({ windMph: 40 }), roofing).level).toBe('unworkable');
    expect(assessDay(day({ windMph: 40 }), sensitivityFor('concrete')).level).toBe('clear');
  });

  it('never raises the risk on a MISSING figure', () => {
    // NWS omits a precipitation chance on plenty of clear days. Treating
    // "unknown" as "bad" would flag half a calendar and get this switched off.
    const result = assessDay(day({ precipChance: null, windMph: null, lowF: null, highF: null }), roofing);
    expect(result.level).toBe('clear');
    expect(result.reasons).toEqual([]);
  });

  it('reports the worst of several problems, and names them all', () => {
    // 55% rain is 'risky' on its own; 40 mph wind is 'unworkable'. The day takes
    // the worse of the two, and the contractor is told both reasons.
    const result = assessDay(day({ precipChance: 55, windMph: 40 }), roofing);
    expect(result.level).toBe('unworkable');
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons.join(' ')).toContain('55%');
    expect(result.reasons.join(' ')).toContain('40 mph');
  });

  it('does not escalate on a problem that only just crosses the line', () => {
    // 30 mph is over roofing's 25 but under the 35 that makes a day hopeless.
    expect(assessDay(day({ precipChance: 55, windMph: 30 }), roofing).level).toBe('risky');
  });
});

describe('daysWorthFlagging', () => {
  it('leaves "keep an eye on it" alone', () => {
    const roofing = sensitivityFor('roofing');
    const assessments = assessDays(
      [day({ day: '2026-08-05', precipChance: 35 }), day({ day: '2026-08-06', precipChance: 90 })],
      roofing,
    );
    expect(daysWorthFlagging(assessments).map((a) => a.day)).toEqual(['2026-08-06']);
  });
});

describe('suggestReplacements', () => {
  const roofing = sensitivityFor('roofing');
  const week = assessDays(
    [
      day({ day: '2026-08-05', precipChance: 90 }),
      day({ day: '2026-08-06', precipChance: 85 }),
      day({ day: '2026-08-07', precipChance: 5 }),
      day({ day: '2026-08-08', precipChance: 5 }),
    ],
    roofing,
  );

  it('offers the nearest clear days after the washout', () => {
    expect(suggestReplacements(week, '2026-08-05').map((a) => a.day)).toEqual(['2026-08-07', '2026-08-08']);
  });

  it('never offers a day before the one being moved', () => {
    expect(suggestReplacements(week, '2026-08-08')).toEqual([]);
  });

  it('offers nothing rather than inventing a date beyond the forecast', () => {
    // A promise made from no data is worse than no promise.
    const soaked = assessDays([day({ day: '2026-08-05', precipChance: 95 })], roofing);
    expect(suggestReplacements(soaked, '2026-08-05')).toEqual([]);
  });
});

describe('draftCustomerMessage', () => {
  const roofing = sensitivityFor('roofing');
  const assessment = assessDay(day({ day: '2026-08-05', precipChance: 90 }), roofing);

  it('says what is wrong and why it matters for this work', () => {
    const message = draftCustomerMessage({
      businessName: 'BrokePipes',
      customerName: 'Jane Homeowner',
      day: '2026-08-05',
      assessment,
      sensitivity: roofing,
      alternatives: assessDays([day({ day: '2026-08-07', precipChance: 5 })], roofing),
    });
    expect(message).toContain('Hi Jane');
    expect(message).toContain('90% chance of rain');
    expect(message).toContain('dry deck');
    expect(message).toContain('Friday');
  });

  it('does not apologise for the weather', () => {
    // Moving a job because rain would wreck it is doing the job properly.
    const message = draftCustomerMessage({
      businessName: 'X', customerName: null, day: '2026-08-05', assessment, sensitivity: roofing, alternatives: [],
    });
    expect(message.toLowerCase()).not.toContain('sorry');
    expect(message.toLowerCase()).not.toContain('apolog');
  });

  it('promises a call when there is no clear day to offer', () => {
    const message = draftCustomerMessage({
      businessName: 'X', customerName: null, day: '2026-08-05', assessment, sensitivity: roofing, alternatives: [],
    });
    expect(message).toContain('call you');
  });

  it('drafts a targeted single-day proposal when targetAlternativeDay is chosen', () => {
    const message = draftCustomerMessage({
      businessName: 'Apex Roofing',
      customerName: 'Sarah Connor',
      day: '2026-08-05',
      assessment,
      sensitivity: roofing,
      alternatives: assessDays([day({ day: '2026-08-07', precipChance: 5 })], roofing),
      targetAlternativeDay: '2026-08-07',
    });
    expect(message).toContain('Hi Sarah');
    expect(message).toContain('move your visit to Friday, Aug 7 instead');
    expect(message).toContain('Reply YES to confirm');
  });
});

describe('parseWindMph', () => {
  it('takes the high end of a range, because that is what stops the work', () => {
    expect(parseWindMph('10 to 20 mph')).toBe(20);
    expect(parseWindMph('15 mph')).toBe(15);
  });

  it('returns null rather than 0 for something unparseable', () => {
    // 0 would read as "dead calm" and silently clear a windy day.
    expect(parseWindMph('Light and variable')).toBeNull();
    expect(parseWindMph(undefined)).toBeNull();
  });
});

describe('periodsToForecasts', () => {
  it('collapses day and night into one row, taking each half where it matters', () => {
    const forecasts = periodsToForecasts([
      { startTime: '2026-08-05T06:00:00-04:00', isDaytime: true, temperature: 78, probabilityOfPrecipitation: { value: 20 }, windSpeed: '5 to 10 mph', shortForecast: 'Sunny' },
      { startTime: '2026-08-05T18:00:00-04:00', isDaytime: false, temperature: 31, probabilityOfPrecipitation: { value: 70 }, windSpeed: '15 mph', shortForecast: 'Showers' },
    ]);
    expect(forecasts).toHaveLength(1);
    expect(forecasts[0].highF).toBe(78);
    expect(forecasts[0].lowF).toBe(31);
    // Worst chance across both halves — rain overnight still wets the deck.
    expect(forecasts[0].precipChance).toBe(70);
    expect(forecasts[0].summary).toBe('Sunny');
  });

  it('uses the date NWS stamped rather than re-interpreting it locally', () => {
    // Converting through a Date would shift the day on a server in another zone.
    const forecasts = periodsToForecasts([
      { startTime: '2026-08-05T22:00:00-04:00', isDaytime: false, temperature: 60, shortForecast: 'Clear' },
    ]);
    expect(forecasts[0].day).toBe('2026-08-05');
  });

  it('skips malformed periods instead of producing a junk day', () => {
    expect(periodsToForecasts([{ temperature: 70 }, { startTime: 'nonsense' }])).toEqual([]);
  });
});

describe('forecastCacheKey', () => {
  it('collapses a street onto one key', () => {
    // Two houses 40m apart share an NWS grid cell; fetching twice is waste.
    expect(forecastCacheKey(42.4931, -83.1447)).toBe(forecastCacheKey(42.4934, -83.1449));
  });

  it('keeps genuinely different places apart', () => {
    expect(forecastCacheKey(42.49, -83.14)).not.toBe(forecastCacheKey(42.6, -83.14));
  });
});
