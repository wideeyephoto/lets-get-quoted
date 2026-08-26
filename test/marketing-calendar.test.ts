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
    expect(tradeFamily('Landscaping')).toBe('landscaping');
    expect(tradeFamily('Lawn Care')).toBe('lawn-care');
    expect(tradeFamily('Holiday Lighting')).toBe('holiday-lighting');
    expect(tradeFamily('Mosquito & Tick Control')).toBe('mosquito-control');
    expect(tradeFamily('Air Duct Cleaning')).toBe('duct-cleaning');
    expect(tradeFamily('Pond Services')).toBe('pond-service');
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
    // The wrap now lives in a topic's own window rather than in two separate
    // rows — ice dams run December into January and that is one thing to say.
    const iceDams = planned.find((entry) => entry.beat.id === 'ice-dams');
    expect(iceDams?.months).toEqual([12, 1]);
    expect(iceDams?.monthName).toBe('December–January');
  });

  it('lists a topic once, however many months its season runs', () => {
    // The bug this replaces was visible on screen: "Book a heating tune-up
    // before the first cold snap" appeared under September AND October,
    // because its cold-zone window is [9, 10]. One thing to do, listed twice.
    const planned = planCalendar({ trade: 'Plumbing', zone: 'cold', fromMonth: 8, monthsAhead: 4 });
    const ids = planned.map((entry) => entry.beat.id);
    expect(new Set(ids).size).toBe(ids.length);

    const heating = planned.find((entry) => entry.beat.id === 'heating-tuneup');
    expect(heating?.months).toEqual([9, 10]);
    expect(heating?.monthName).toBe('September–October');
  });

  it('only says "–" when the months are genuinely consecutive', () => {
    // Exterior painting in a hot climate is [3, 10]: March and October, the two
    // moments either side of a summer nobody paints in. "March–October" would
    // advertise an eight-month season that does not exist.
    const planned = planCalendar({ trade: 'Painting', zone: 'hot', fromMonth: 1, monthsAhead: 12 });
    const paint = planned.find((entry) => entry.beat.id === 'exterior-paint');
    expect(paint?.months).toEqual([3, 10]);
    expect(paint?.monthName).toBe('March & October');
  });

  it('carries every channel a topic supports, not just the first', () => {
    const planned = planCalendar({ trade: 'Roofing', zone: 'cold', fromMonth: 12, monthsAhead: 2 });
    // Blog-only: this is the topic that had a draft and nowhere to put it.
    expect(planned.find((entry) => entry.beat.id === 'ice-dams')?.channels).toEqual(['blog']);

    const emailOnly = planCalendar({ trade: 'Landscaping', zone: 'cold', fromMonth: 12, monthsAhead: 1 });
    expect(emailOnly.find((entry) => entry.beat.id === 'year-review')?.channels).toEqual(['email']);
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
    accountId: 'acct',
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
      subjectOptions: [],
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

  it('keeps two alternative subjects and drops a duplicate of the first', () => {
    const draft = normalizeMarketingDraft({
      ...good,
      subject_options: ['Your furnace before October', 'BEFORE THE FIRST FREEZE', 'One too many', 'And another'],
    });
    // The duplicate is caught case-insensitively, and only two survive.
    expect(draft?.subjectOptions).toEqual(['Your furnace before October', 'One too many']);
  });

  it('drops a bad alternative subject without losing the draft', () => {
    // The body is the expensive part and it passed its own checks. Throwing the
    // whole draft away because option three got enthusiastic is the wrong trade
    // — unlike the main subject, which does gate the draft.
    const draft = normalizeMarketingDraft(
      { ...good, subject_options: ['Act now on your furnace', 'Ready for 2024?', 'Booking October now'] },
      2026,
    );
    expect(draft).not.toBeNull();
    expect(draft?.subject).toBe('Before the first freeze');
    expect(draft?.subjectOptions).toEqual(['Booking October now']);
  });

  it('still refuses the draft when the MAIN subject is junk, options or not', () => {
    expect(normalizeMarketingDraft({ ...good, subject: 'Act now', subject_options: ['Perfectly fine'] })).toBeNull();
  });

  it('survives subject_options being absent or the wrong shape', () => {
    expect(normalizeMarketingDraft(good)?.subjectOptions).toEqual([]);
    expect(normalizeMarketingDraft({ ...good, subject_options: 'not an array' })?.subjectOptions).toEqual([]);
    expect(normalizeMarketingDraft({ ...good, subject_options: [null, 42, '  '] })?.subjectOptions).toEqual(['42']);
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

describe('planCalendar and what the contractor actually sells', () => {
  // A plumber in a cold state in September is exactly the case the audit found:
  // the calendar offered a heating tune-up and an irrigation blow-out to a
  // business that does neither.
  const plumberInSeptember = (services?: string[]) =>
    planCalendar({ trade: 'Plumbing', zone: 'cold', fromMonth: 9, monthsAhead: 3, services }).map(
      (planned) => planned.beat.id,
    );

  it('offers adjacent-trade beats when the price book is empty, rather than looking broken mid-setup', () => {
    const ids = plumberInSeptember();
    expect(ids).toContain('heating-tuneup');
    expect(ids).toContain('irrigation-blowout');
  });

  it('withholds them once the price book says otherwise', () => {
    const ids = plumberInSeptember(['Drain cleaning', 'Water heater replacement', 'Leak repair']);
    expect(ids).not.toContain('heating-tuneup');
    expect(ids).not.toContain('irrigation-blowout');
  });

  // A water heater is not a furnace, and "Water heater replacement" is about
  // the most common line in a plumber's price book. Matching it would put the
  // heating beat back in front of exactly the contractor it was hidden from.
  it('does not read a water heater as space heating', () => {
    expect(plumberInSeptember(['Water heater replacement'])).not.toContain('heating-tuneup');
    expect(plumberInSeptember(['Tankless water heater install'])).not.toContain('heating-tuneup');
  });

  it('still offers them to the plumber who does that work', () => {
    expect(plumberInSeptember(['Drain cleaning', 'Boiler service'])).toContain('heating-tuneup');
    expect(plumberInSeptember(['Drain cleaning', 'Sprinkler winterization'])).toContain('irrigation-blowout');
  });

  // The filter is about ADJACENT trades. A plumber's own beats are never in
  // question, whatever their price book happens to list.
  it('never withholds a beat from its home trade', () => {
    expect(plumberInSeptember(['Nothing recognisable'])).toContain('frozen-pipes');
  });

  it('leaves the HVAC contractor who owns the heating beat alone', () => {
    const ids = planCalendar({ trade: 'HVAC', zone: 'cold', fromMonth: 9, monthsAhead: 3, services: ['Duct cleaning'] })
      .map((planned) => planned.beat.id);
    expect(ids).toContain('heating-tuneup');
  });

  it('only gates beats that declare what they need', () => {
    for (const beat of BEATS) {
      if (!beat.needs) continue;
      // A gated beat must have somewhere to be gated FROM, or the rule is dead.
      expect(beat.trades.length).toBeGreaterThan(1);
    }
  });
});
