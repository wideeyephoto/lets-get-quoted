import { describe, it, expect } from 'vitest';
import {
  BEATS,
  climateZoneForState,
  planCalendar,
  stateFromAddress,
  tradeFamily,
  SMS_EXCLUSION_NOTE,
} from '@/lib/marketing-calendar';
import { buildMarketingInput, normalizeMarketingDraft } from '@/lib/marketing-draft';

describe('climateZoneForState', () => {
  it('knows where winter happens', () => {
    expect(climateZoneForState('MN')).toBe('cold');
    expect(climateZoneForState('FL')).toBe('hot');
    expect(climateZoneForState('WA')).toBe('marine');
    expect(climateZoneForState('OH')).toBe('temperate');
  });

  it('falls back to four seasons, whose advice is least wrong everywhere', () => {
    expect(climateZoneForState(null)).toBe('temperate');
    expect(climateZoneForState('ZZ')).toBe('temperate');
  });

  it('is not fussy about case or spacing', () => {
    expect(climateZoneForState(' mn ')).toBe('cold');
  });
});

describe('stateFromAddress', () => {
  it('reads the state off a normal US address', () => {
    expect(stateFromAddress('1418 Maplewood Ave, Royal Oak, MI 48073')).toBe('MI');
    expect(stateFromAddress('12 Elm St, Austin, TX')).toBe('TX');
  });

  it('returns null rather than guessing', () => {
    // A wrong zone sends furnace advice to Phoenix, so unsure must mean unsure.
    expect(stateFromAddress('12 Elm Street')).toBeNull();
    expect(stateFromAddress(null)).toBeNull();
    expect(stateFromAddress('somewhere in the UK')).toBeNull();
  });
});

describe('tradeFamily', () => {
  it('groups trades that want the same beats', () => {
    expect(tradeFamily('Roofing & Gutters')).toBe('roofing');
    expect(tradeFamily('Heating and Air Conditioning')).toBe('hvac');
    expect(tradeFamily('Plumbing')).toBe('plumbing');
    expect(tradeFamily('Exterior Painting')).toBe('exterior');
    expect(tradeFamily('Lawn Care')).toBe('landscaping');
  });

  it('falls back to general rather than dropping a trade off the calendar', () => {
    expect(tradeFamily('Handyman')).toBe('general');
    expect(tradeFamily(null)).toBe('general');
  });
});

describe('planCalendar', () => {
  it('proposes the furnace beat in autumn where there are winters', () => {
    const planned = planCalendar({ trade: 'HVAC', zone: 'cold', fromMonth: 9, monthsAhead: 2 });
    expect(planned.map((p) => p.beat.id)).toContain('heating-tuneup');
  });

  it('never proposes a furnace tune-up in Phoenix', () => {
    // The whole reason zones exist. Nobody in a hot zone has thought about a
    // furnace in their life, and sending that email is how a list goes stale.
    const wholeYear = planCalendar({ trade: 'HVAC', zone: 'hot', fromMonth: 1, monthsAhead: 12 });
    expect(wholeYear.map((p) => p.beat.id)).not.toContain('heating-tuneup');
    expect(wholeYear.map((p) => p.beat.id)).not.toContain('frozen-pipes');
  });

  it('shifts the AC beat earlier where summer arrives earlier', () => {
    const hot = planCalendar({ trade: 'HVAC', zone: 'hot', fromMonth: 1, monthsAhead: 12 }).find((p) => p.beat.id === 'ac-service');
    const cold = planCalendar({ trade: 'HVAC', zone: 'cold', fromMonth: 1, monthsAhead: 12 }).find((p) => p.beat.id === 'ac-service');
    expect(hot!.month).toBeLessThan(cold!.month);
  });

  it('keeps ice dams out of every zone but the cold one', () => {
    for (const zone of ['temperate', 'hot', 'marine'] as const) {
      const planned = planCalendar({ trade: 'Roofing', zone, fromMonth: 1, monthsAhead: 12 });
      expect(planned.map((p) => p.beat.id)).not.toContain('ice-dams');
    }
    expect(
      planCalendar({ trade: 'Roofing', zone: 'cold', fromMonth: 12, monthsAhead: 2 }).map((p) => p.beat.id),
    ).toContain('ice-dams');
  });

  it('gives a trade only its own beats', () => {
    const planned = planCalendar({ trade: 'Landscaping', zone: 'cold', fromMonth: 1, monthsAhead: 12 });
    expect(planned.map((p) => p.beat.id)).not.toContain('ac-service');
    expect(planned.map((p) => p.beat.id)).toContain('spring-cleanup');
  });

  it('returns nothing rather than filler for a quiet month', () => {
    // A calendar that invents something for every square is a calendar of
    // things nobody needed to read.
    const planned = planCalendar({ trade: 'Landscaping', zone: 'cold', fromMonth: 7, monthsAhead: 1 });
    expect(planned).toEqual([]);
  });

  it('wraps around the year end', () => {
    const planned = planCalendar({ trade: 'Roofing', zone: 'cold', fromMonth: 12, monthsAhead: 2 });
    expect(planned.map((p) => p.month)).toEqual(expect.arrayContaining([12, 1]));
  });

  it('never looks more than a year ahead', () => {
    const planned = planCalendar({ trade: 'Roofing', zone: 'cold', fromMonth: 1, monthsAhead: 99 });
    expect(new Set(planned.map((p) => p.month)).size).toBeLessThanOrEqual(12);
  });

  it('gives everybody the December thank-you', () => {
    for (const trade of ['Roofing', 'HVAC', 'Plumbing', 'Painting', 'Landscaping', 'Handyman']) {
      const planned = planCalendar({ trade, zone: 'temperate', fromMonth: 12, monthsAhead: 1 });
      expect(planned.map((p) => p.beat.id)).toContain('year-review');
    }
  });
});

describe('the beats themselves', () => {
  it('every beat is time-sensitive enough to say why now', () => {
    for (const beat of BEATS) {
      expect(beat.whyNow.length).toBeGreaterThan(40);
      expect(beat.channels.length).toBeGreaterThan(0);
      expect(beat.trades.length).toBeGreaterThan(0);
    }
  });

  it('offers no SMS channel anywhere', () => {
    // Marketing texts need their own written opt-in under the TCPA, and this
    // app's consent ledger doesn't separate that from job-update consent.
    for (const beat of BEATS) {
      expect(beat.channels).not.toContain('sms');
    }
    expect(SMS_EXCLUSION_NOTE).toMatch(/written opt-in/i);
  });

  it('uses month numbers a human would recognise', () => {
    for (const beat of BEATS) {
      for (const months of Object.values(beat.monthsByZone)) {
        for (const month of months ?? []) {
          expect(month).toBeGreaterThanOrEqual(1);
          expect(month).toBeLessThanOrEqual(12);
        }
      }
    }
  });

});

describe('buildMarketingInput', () => {
  const beat = BEATS[0];
  const input = {
    beat,
    channel: 'email' as const,
    businessName: 'BrokePipes',
    trade: 'Plumbing',
    zone: 'cold' as const,
    monthName: 'October',
    year: 2026,
    serviceArea: 'Royal Oak, MI',
  };

  it('says "JSON" in the input, not only in the instructions', () => {
    // The Responses API 400s without it, that 400 is caught, and the drafter
    // then fails silently on every topic. Same trap as quote-guard-ai.
    expect(buildMarketingInput(input)).toMatch(/json/i);
  });

  it('sends the timing reason, which is the whole point of the message', () => {
    expect(buildMarketingInput(input)).toContain('WHY THIS MONTH');
    expect(buildMarketingInput(input)).toContain('October');
  });

  it('never sends anything about who will receive it', () => {
    // Audience is a database question with consent rules attached. No part of
    // it belongs to a language model.
    const built = buildMarketingInput(input);
    expect(built).not.toMatch(/customer list|recipients|email address/i);
  });
});

describe('normalizeMarketingDraft', () => {
  const good = { subject: 'Before the first freeze', body: ['Two sentences here.', 'And another.'], call_to_action: 'Reply and we will book you in.' };

  it('keeps a clean draft', () => {
    expect(normalizeMarketingDraft(good)).toEqual({
      subject: 'Before the first freeze',
      body: ['Two sentences here.', 'And another.'],
      callToAction: 'Reply and we will book you in.',
    });
  });

  it('throws out the WHOLE draft when it reads like junk mail', () => {
    // Rejected rather than quietly edited: a message with the pressure filed
    // off still had the pressure in it, and the contractor should see a redraft
    // rather than a sanitised version they never asked for.
    for (const phrase of ['Act now', 'limited slots', "Don't miss out", 'guaranteed results', '20% off']) {
      expect(normalizeMarketingDraft({ ...good, subject: `${phrase} on your furnace` })).toBeNull();
    }
    expect(normalizeMarketingDraft({ ...good, body: ['Hurry, this is a limited time offer.'] })).toBeNull();
  });

  it('refuses a draft with nothing in it', () => {
    expect(normalizeMarketingDraft({ subject: '', body: ['x'] })).toBeNull();
    expect(normalizeMarketingDraft({ subject: 'x', body: [] })).toBeNull();
    expect(normalizeMarketingDraft(null)).toBeNull();
  });

  it('drops blank paragraphs rather than rendering gaps', () => {
    expect(normalizeMarketingDraft({ ...good, body: ['Real.', '  ', ''] })?.body).toEqual(['Real.']);
  });

  it('refuses a draft that names the wrong year', () => {
    // A live run had the December "year in review" thanking people for 2023 and
    // looking forward to 2024. The model has no idea what year it is, and a
    // wrong one is a factual error in something the contractor signs their name to.
    expect(normalizeMarketingDraft({ ...good, body: ['Looking back on 2023, it has been a busy year.'] }, 2026)).toBeNull();
    expect(normalizeMarketingDraft({ ...good, subject: 'Ready for 2024?' }, 2026)).toBeNull();
  });

  it('allows the year it was actually given', () => {
    expect(normalizeMarketingDraft({ ...good, body: ['Looking back on 2026.'] }, 2026)).not.toBeNull();
  });

  it('does not police years when none was supplied', () => {
    expect(normalizeMarketingDraft({ ...good, body: ['Since 1994 we have.'] })).not.toBeNull();
  });
});
