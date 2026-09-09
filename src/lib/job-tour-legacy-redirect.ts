import { redirect } from 'next/navigation';
import { jobTourHref, normalizeJobTourStep } from './job-lifecycle-tour';

export type LegacyTourPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function redirectLegacyJobTour(step: string, searchParams: LegacyTourPageProps['searchParams']) {
  const params = await searchParams;
  const upgrade = params.upgrade === '1' ? true : params.upgrade === '0' ? false : undefined;
  redirect(jobTourHref(normalizeJobTourStep(step), upgrade) + (step === 'complete' ? '&result=preview' : ''));
}
