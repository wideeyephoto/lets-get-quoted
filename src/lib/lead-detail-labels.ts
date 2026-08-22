import type { LeadScore, LeadStatus } from './leads';
import type { JobStatus } from './jobs';
import { queueStageLabel } from './lead-queue';

// Display strings shared by the leads board, the Focus pane and the full lead
// page. They lived in three files and had already drifted — the board printed
// "Quote sent" while the detail page's own map printed the same thing from a
// separate copy, and either could have been edited alone. Client-safe: pure
// strings and formatting, no server imports.

// Canonical lead-stage vocabulary, taken from lib/lead-queue rather than spelled
// out a second time here. 'quoted' still reads "Quote sent" because that is what
// happened; the raw enum only makes sense to whoever wrote the schema.
//
// It WAS a second map, and the two disagreed about 'new': the queue chip said
// "Needs response" and the detail page's pill, drawn from here, said "New
// request" — for the same lead, one click apart.
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: queueStageLabel('new'),
  contacted: queueStageLabel('contacted'),
  quoted: queueStageLabel('quoted'),
  won: queueStageLabel('won'),
  lost: queueStageLabel('lost'),
};

// One stage word per lead, from lib/lead-queue — the same function the Smoothie
// chips, the board columns and the table already count and label with.
//
// This used to shout "Needs response" for a new WEBSITE lead and say "New
// request" for every other new lead, which is how one lead came to badge two
// different ways on one screen: the Smoothie chip above it counts on status
// alone, so a lead phoned in an hour ago sat in the Needs-response bucket with
// "New request" written on it. `_source` is still accepted so the callers that
// pass it keep compiling; it no longer changes the answer.
export function leadStageLabel(status: LeadStatus, _source?: string): string {
  return queueStageLabel(status);
}

// The stage of the job a lead turned into. data-export.ts keeps its own copy of
// these strings on purpose — that one has to round-trip through
// mapImportedJobStatus on re-import, so it is not free to be reworded. Leave
// them as two maps: they answer to different masters.
export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  new_lead: 'New request',
  in_progress: 'In progress',
  complete: 'Complete',
  archived: 'Archived',
};

export function leadScoreLabel(score: LeadScore): string {
  if (score === 'hot') return '🔥 Hot';
  if (score === 'low') return 'Low';
  return 'Warm';
}

/** "$1,200–$3,400", or null when the AI never put a number on it. */
export function estimateRangeLabel(estimate: { min: number; max: number } | null | undefined): string | null {
  if (!estimate) return null;
  const { min, max } = estimate;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min === max) return `$${min.toLocaleString('en-US')}`;
  return `$${min.toLocaleString('en-US')}–$${max.toLocaleString('en-US')}`;
}

/** "Jul 28, 2:15 PM" — enough to tell two touchpoints on the same day apart. */
export function formatLeadClock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "Jul 28, 2026" — for a created date, where the clock is noise. */
export function formatLeadDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* --- which town is this? ---------------------------------------------------
   A name alone doesn't tell a contractor whether a lead is ten minutes away or
   across the county, and that decides who gets called back first. The town is
   already sitting inside the address string; it just has to be found.

   Everything below RETURNS NULL rather than guessing. A wrong town is worse
   than no town: it's the number that decides the drive, and "Royal Oak" printed
   next to a Livonia address would be believed. */

const COUNTRY_WORDS = new Set(['us', 'usa', 'united states', 'united states of america', 'canada']);

const US_STATE_NAMES = new Set([
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware',
  'district of columbia', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa',
  'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota',
  'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey',
  'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon',
  'pennsylvania', 'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah',
  'vermont', 'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming',
]);

const STREET_SUFFIX =
  /\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard|ct|court|way|pl|place|ter|terrace|cir|circle|hwy|highway|pkwy|parkway|trl|trail|route|rt|apt|unit|suite|ste)\.?$/i;

function isPostalCode(part: string): boolean {
  return /^\d{5}(?:-\d{4})?$/.test(part);
}

/** "MI", "Michigan", "MI 48067" — the tail of a US address, never its town. */
function isStateish(part: string): boolean {
  const bare = part.replace(/\.$/, '').trim().toLowerCase();
  if (/^[a-z]{2}$/.test(bare)) return true; // no US city has a two-letter name
  if (US_STATE_NAMES.has(bare)) return true;
  const withZip = part.match(/^(.+?)\s+\d{5}(?:-\d{4})?$/);
  return withZip ? isStateish(withZip[1]) : false;
}

function looksLikeStreet(part: string): boolean {
  return /^\d/.test(part) || /^p\.?\s?o\.?\s*box/i.test(part) || STREET_SUFFIX.test(part);
}

/**
 * "1418 Maplewood Ave, Royal Oak, MI 48067, USA" → "Royal Oak".
 *
 * Works backwards from the end, peeling off country and state/ZIP, because
 * that tail is the predictable part of a US address — the number of segments
 * in front of it is not (apartment lines, business names, missing street).
 * Whatever is left standing at the end is the town.
 */
export function cityFromAddress(address: string | null | undefined): string | null {
  const parts = (address ?? '')
    .toString()
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  while (parts.length > 0) {
    const last = parts[parts.length - 1];
    if (COUNTRY_WORDS.has(last.replace(/\.$/, '').toLowerCase()) || isPostalCode(last) || isStateish(last)) {
      parts.pop();
      continue;
    }
    break;
  }

  const candidate = parts[parts.length - 1];
  if (!candidate) return null;
  // A single un-punctuated line is usually a street, not a town. Any digit at
  // all rules it out too: "Suite 200" and "48067 Royal Oak" are not places.
  if (looksLikeStreet(candidate) || /\d/.test(candidate)) return null;
  return candidate.length <= 40 ? candidate : null;
}

/**
 * "1418 Maplewood Ave, Royal Oak, MI 48067, USA" → "1418 Maplewood Ave".
 *
 * Works FORWARDS, the opposite of cityFromAddress, because the street is the
 * first segment that looks like one. Segments in front of it that don't — a
 * business name, a care-of line — are skipped rather than mistaken for it, and
 * a state/ZIP/country tail is never eligible even in a one-line address.
 *
 * Returns the whole segment including the house number, not just the road name.
 * "1418 Maplewood Ave" identifies a customer; "Maplewood Ave" identifies a road
 * that several of them may live on.
 */
export function streetFromAddress(address: string | null | undefined): string | null {
  const parts = (address ?? '')
    .toString()
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  for (const part of parts) {
    if (COUNTRY_WORDS.has(part.replace(/\.$/, '').toLowerCase())) continue;
    if (isPostalCode(part) || isStateish(part)) continue;
    if (!looksLikeStreet(part)) continue;
    // Long enough to be a paragraph is not a street; the inbox row would be
    // truncated to something less recognisable than the phone number it replaced.
    return part.length <= 60 ? part : null;
  }
  return null;
}

/**
 * The town for a lead — from the address if there is one, otherwise from
 * whatever the estimator recorded as their location.
 *
 * That second field is frequently a bare ZIP ("Location given: 48072"), which
 * `cityFromAddress` declines rather than printing "(48072)" where a town is
 * promised. The full ZIP still shows on the Where row.
 */
export function leadCityLabel(address: string | null | undefined, location?: string | null): string | null {
  return cityFromAddress(address) ?? cityFromAddress(location);
}
