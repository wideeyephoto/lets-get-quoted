import type { LatLng } from '@/lib/distance';

/**
 * The queue's data, flattened for the client.
 *
 * The rows used to be server-rendered — every card carried two bound server
 * actions and a crew form of its own, which is why nine jobs waiting meant
 * eighteen buttons and eighteen inline panels in the markup. Selecting a job
 * has to be client state (the detail rail is the thing that reacts to it), so
 * the rows come across as plain data and the actions are called from the panel
 * instead: one form for the job you actually picked.
 *
 * NO DIRECTIVE IN THIS FILE. It is types only, imported from both a server page
 * and a client component — a 'use client' here would make the server import a
 * client reference, which is the failure mode that took the lead page down when
 * `quoteShape` was exported from a client module.
 */

export type QueueJob = {
  id: string;
  clientName: string;
  clientPhone: string | null;
  /** What the work is. The row's second line, and the panel's subtitle. */
  scope: string | null;
  address: string | null;
  cityLabel: string;
  estimatedHours: number | null;
  /** in_progress. The other case is a quote nobody has accepted. */
  approved: boolean;
  crewIds: string[];
  /** Where a sent set of dates has got to, if any were sent. */
  requestState: 'none' | 'sent' | 'needs_more_options';
  lat: number | null;
  lng: number | null;
};

/** Everything suggestSlots needs that is the same for every job in the queue. */
export type SuggestContext = {
  todayKey: string;
  hoursByDate: Record<string, number>;
  jobsByDate: Record<string, number>;
  placesByDate: Record<string, LatLng[]>;
  capacityHours: number;
  /**
   * Availability blocks ONLY — days deliberately taken off.
   *
   * Deliberately NOT the page's `unavailableDays`, which also holds every day
   * that is merely full. A full day is one this can rank below an emptier one;
   * a day off is not a suggestion at all. Conflating them would have hidden
   * every busy day from the ranking rather than ordering it.
   */
  blockedDays: Record<string, string>;
  workingWeekdays: number[];
  workdayStart: string | null;
};
