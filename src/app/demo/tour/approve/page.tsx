import { redirectLegacyJobTour, type LegacyTourPageProps } from '@/lib/job-tour-legacy-redirect';

export default function LegacyTourPage({ searchParams }: LegacyTourPageProps) {
  return redirectLegacyJobTour('approve', searchParams);
}
