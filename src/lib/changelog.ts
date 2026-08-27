/**
 * Single source of truth for product updates, new features, and changelog releases.
 * Used by both the in-app "What's New" drawer and the public /changelog page.
 */

export type ChangelogCategory =
  | 'All'
  | 'AI & Receptionist'
  | 'Scheduling & Field'
  | 'Pricing & Permits'
  | 'Theme & Design';

export interface ChangelogHighlight {
  title: string;
  description: string;
  badge?: 'New' | 'Improved' | 'Fix';
}

export interface ChangelogAction {
  label: string;
  href: string;
  external?: boolean;
}

export interface ChangelogRelease {
  id: string;
  version: string;
  title: string;
  date: string; // ISO date (YYYY-MM-DD)
  category: ChangelogCategory;
  badge: 'Major Release' | 'Feature Update' | 'Enhancement';
  summary: string;
  highlights: ChangelogHighlight[];
  primaryAction?: ChangelogAction;
  secondaryAction?: ChangelogAction;
}

export const CHANGELOG_CATEGORIES: ChangelogCategory[] = [
  'All',
  'AI & Receptionist',
  'Scheduling & Field',
  'Pricing & Permits',
  'Theme & Design',
];

export const CHANGELOG_RELEASES: ChangelogRelease[] = [
  {
    id: 'release-2026-08-schedule-themes-receptionist',
    version: 'v2.4.0',
    title: 'Schedule Workbench, Eye-Care Themes & Dedicated AI Receptionist',
    date: '2026-08-26',
    category: 'Scheduling & Field',
    badge: 'Major Release',
    summary:
      'A massive update introducing the full-width Schedule Workbench with queue dispatching, color-blind safe eye-care themes, and dedicated 3-step AI phone receptionist provisioning.',
    highlights: [
      {
        badge: 'New',
        title: 'Schedule Workbench & Queue Auto-Dispatch',
        description:
          'Drag unscheduled work from the job queue straight onto crew calendar slots. Automatically adjusts to full-width calendar when the queue is clear.',
      },
      {
        badge: 'New',
        title: 'Clarity, Monochrome & Parchment Eye-Care Themes',
        description:
          'Designed for night estimating and field sun glare. Includes a CVD-safe (Color Vision Deficiency) high-contrast theme and low-blue-light parchment palette.',
      },
      {
        badge: 'New',
        title: 'Interactive 3-Step Dedicated Receptionist Onboarding',
        description:
          'Provision dedicated local business phone numbers in minutes with instant EIN verification, emergency triage guardrails, and after-hours call transcription.',
      },
      {
        badge: 'Improved',
        title: 'Streaming Loading Skeletons',
        description:
          'Instant page response with smooth loading skeletons across Cash Flow forecasting, Insights, and Back-Office reports.',
      },
    ],
    primaryAction: {
      label: 'Open Schedule Workbench',
      href: '/dashboard/schedule',
    },
    secondaryAction: {
      label: 'Explore AI Receptionist',
      href: '/dashboard/voice-calls',
    },
  },
  {
    id: 'release-2026-08-permits-rebates-takeoffs',
    version: 'v2.3.0',
    title: 'North American Permit Intel, Aerial Takeoffs & IRA Clean Energy Rebates',
    date: '2026-08-15',
    category: 'Pricing & Permits',
    badge: 'Feature Update',
    summary:
      'Take the guesswork out of job estimation with automated permit requirement lookups, satellite roof takeoff integration, and real-time IRA clean energy tax credit calculators.',
    highlights: [
      {
        badge: 'New',
        title: 'North American Permit Intel Engine',
        description:
          'Instant jurisdiction requirement detection, permit fee estimations, and COI verification before dispatching field crews.',
      },
      {
        badge: 'New',
        title: 'Clean Energy & IRA Rebate Calculator',
        description:
          'Automatically calculate federal 25C tax credits and state-level utility rebates directly inside customer quotes for heat pumps, roofing, and solar.',
      },
      {
        badge: 'New',
        title: 'Aerial Roof Takeoff & Pitch Multipliers',
        description:
          'Integrate high-resolution aerial imagery and roof pitch slope factors directly into itemized material calculations.',
      },
      {
        badge: 'Improved',
        title: 'Responsive Estimate Generator',
        description:
          'Full mobile optimization with instant print previews and live client approval links.',
      },
    ],
    primaryAction: {
      label: 'Try Estimate Generator',
      href: '/tools/estimate-generator',
    },
    secondaryAction: {
      label: 'View Permit Intel Guide',
      href: '/resources/clean-energy-rebates-permit-intel-guide',
    },
  },
  {
    id: 'release-2026-08-crew-gps-geofencing',
    version: 'v2.2.0',
    title: 'Live Crew GPS Tracking & Geofenced Timesheets',
    date: '2026-08-01',
    category: 'Scheduling & Field',
    badge: 'Feature Update',
    summary:
      'Gain real-time visibility into your field operations with adaptive GPS location sampling, live job site map pins, and automated geofenced timesheet auditing.',
    highlights: [
      {
        badge: 'New',
        title: 'Live Job Site GPS Pin Map',
        description:
          'Real-time view of field crew locations relative to active job coordinates, complete with route ETA calculation.',
      },
      {
        badge: 'New',
        title: 'Geofenced Timesheet Auditing',
        description:
          'Automatically flag clock-ins and clock-outs that occur outside the verified job perimeter to eliminate payroll discrepancies.',
      },
      {
        badge: 'Improved',
        title: 'Adaptive Battery-Saving GPS Sampling',
        description:
          'Intelligent polling frequencies that preserve crew smartphone battery life during transit and on-site work.',
      },
    ],
    primaryAction: {
      label: 'View Crew & Labor',
      href: '/dashboard/crew',
    },
    secondaryAction: {
      label: 'Read Dispatching Playbook',
      href: '/resources/crew-gps-geofenced-timesheets-guide',
    },
  },
  {
    id: 'release-2026-07-command-center-deposits',
    version: 'v2.1.0',
    title: 'Contractor Daily Command Center & Signature-Guarded Deposits',
    date: '2026-07-18',
    category: 'AI & Receptionist',
    badge: 'Enhancement',
    summary:
      'Transformed the primary dashboard into an actionable daily command center with instant action cards and seamless digital deposit workflows.',
    highlights: [
      {
        badge: 'New',
        title: 'Daily Command Center KPI Ribbon',
        description:
          'Quickly glance at today’s revenue, unscheduled work orders, open quote value, and pending homeowner signatures.',
      },
      {
        badge: 'New',
        title: 'Signature-Guarded Online Deposits',
        description:
          'Collect legally binding e-signatures and credit card / ACH deposits simultaneously in a frictionless mobile client portal.',
      },
      {
        badge: 'Improved',
        title: '1-Click Blog & Resource Publisher',
        description:
          'Publish SEO-optimized articles, local case studies, and homeowner tips straight to your contractor website in seconds.',
      },
    ],
    primaryAction: {
      label: 'View Dashboard',
      href: '/dashboard',
    },
    secondaryAction: {
      label: 'Try Interactive Demo',
      href: '/demo',
    },
  },
];

export const LATEST_RELEASE = CHANGELOG_RELEASES[0];

/**
 * Helper to check if a user has unread changelog updates based on localStorage timestamp.
 */
export const CHANGELOG_STORAGE_KEY = 'lgq_last_seen_changelog_date';

export function isNewReleaseAvailable(lastSeenDate: string | null): boolean {
  if (!lastSeenDate) return true;
  return new Date(LATEST_RELEASE.date).getTime() > new Date(lastSeenDate).getTime();
}
