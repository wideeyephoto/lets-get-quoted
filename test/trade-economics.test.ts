import { describe, it, expect } from 'vitest';
import { getTrade, getTradeEconomics } from '@/lib/trades';

describe('trade economics modeling', () => {
  it('defaults to 12 active months for standard year-round trades', () => {
    const plumbing = getTrade('plumbers')!;
    const economics = getTradeEconomics(plumbing);
    expect(economics.activeMonthsPerYear).toBe(12);
    expect(economics.quickStopActiveMonthsPerYear).toBe(12);
    expect(economics.typicalMonthlyVolume).toBeGreaterThan(0);
    expect(economics.avgTicket).toBeGreaterThan(0);
  });

  it('calculates season-aware active months for seasonal trades', () => {
    const holiday = getTrade('holiday-lighting')!;
    const holidayEcon = getTradeEconomics(holiday);
    expect(holidayEcon.activeMonthsPerYear).toBe(4);
    expect(holidayEcon.quickStopActiveMonthsPerYear).toBe(3);
    expect(holidayEcon.avgTicket).toBe(1500);

    const lawn = getTrade('lawn-care')!;
    const lawnEcon = getTradeEconomics(lawn);
    expect(lawnEcon.activeMonthsPerYear).toBe(8);
    expect(lawnEcon.avgTicket).toBe(450);

    const mosquito = getTrade('mosquito-tick-control')!;
    const mosquitoEcon = getTradeEconomics(mosquito);
    expect(mosquitoEcon.activeMonthsPerYear).toBe(7);
    expect(mosquitoEcon.avgTicket).toBe(650);

    const duct = getTrade('air-duct-cleaning')!;
    const ductEcon = getTradeEconomics(duct);
    expect(ductEcon.activeMonthsPerYear).toBe(10);
    expect(ductEcon.avgTicket).toBe(500);

    const pond = getTrade('pond-services')!;
    const pondEcon = getTradeEconomics(pond);
    expect(pondEcon.activeMonthsPerYear).toBe(8);
    expect(pondEcon.avgTicket).toBe(850);
  });
});
