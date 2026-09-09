import { describe, expect, it, vi } from 'vitest';
import { jobTourHref } from '@/lib/job-lifecycle-tour';
import { PUBLIC_DEMO_TOUR } from '@/lib/product-tour/catalog';
import { redirectLegacyJobTour } from '@/lib/job-tour-legacy-redirect';

vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));

describe('Public tour migration and sharing', () => {
  it('versions the five-tab funnel and routes it to How It Works', () => {
    expect(PUBLIC_DEMO_TOUR.version).toBe(2);
    expect(PUBLIC_DEMO_TOUR.steps).toHaveLength(5);
    expect(PUBLIC_DEMO_TOUR.steps.map((step) => step.route)).toEqual(['site', 'intake', 'lead', 'quote', 'approve'].map((step) => `/how-it-works?tour=job-lifecycle&step=${step}`));
  });
  it.each(['site', 'intake', 'lead', 'quote', 'approve', 'complete'])('redirects legacy %s links and preserves the recognized upgrade option', async (step) => {
    const destination = step === 'complete' ? 'approve' : step;
    await expect(redirectLegacyJobTour(step, Promise.resolve({ upgrade: '0', signed: 'true', deposit: 'true' }))).rejects.toThrow(`redirect:/how-it-works?tour=job-lifecycle&step=${destination}&upgrade=0${step === 'complete' ? '&result=preview' : ''}`);
  });
  it('does not copy arbitrary or repeated query values into the destination', async () => {
    await expect(redirectLegacyJobTour('site', Promise.resolve({ upgrade: ['1', '0'], next: 'https://example.com' }))).rejects.toThrow('redirect:/how-it-works?tour=job-lifecycle&step=site');
  });
  it('shares the quote option without carrying simulated approval or payment', () => {
    expect(jobTourHref('approve', true)).toBe('/how-it-works?tour=job-lifecycle&step=approve&upgrade=1');
    expect(jobTourHref('approve', false)).toBe('/how-it-works?tour=job-lifecycle&step=approve&upgrade=0');
  });
});
